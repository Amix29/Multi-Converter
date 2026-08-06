use pdfium_render::prelude::{PdfDocument, Pdfium, PdfiumError, PdfiumInternalError};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const MAX_REQUEST_BYTES: u64 = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES: u64 = 128 * 1024 * 1024;

pub(super) fn read_stdin_json<T: serde::de::DeserializeOwned>() -> Result<T, String> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take(MAX_REQUEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("PDF_EDITOR_REQUEST_READ:{error}"))?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_REQUEST_BYTES {
        return Err("PDF_EDITOR_REQUEST_LIMIT:Requête JSON vide ou trop volumineuse.".into());
    }
    serde_json::from_slice(&bytes).map_err(|error| format!("PDF_EDITOR_REQUEST_INVALID:{error}"))
}

pub(super) fn write_stdout_json<T: serde::Serialize>(value: &T) -> Result<(), String> {
    let bytes =
        serde_json::to_vec(value).map_err(|error| format!("PDF_EDITOR_RESULT_INVALID:{error}"))?;
    std::io::stdout()
        .write_all(&bytes)
        .map_err(|error| format!("PDF_EDITOR_RESULT_WRITE:{error}"))
}

pub(super) fn validate_schema(schema_version: u8) -> Result<(), String> {
    if schema_version == 1 {
        Ok(())
    } else {
        Err("PDF_EDITOR_SCHEMA:Version de contrat PDF inconnue.".into())
    }
}

pub(super) fn validate_source(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() || !path.is_file() {
        return Err("PDF_EDITOR_SOURCE_INVALID:Le PDF source est introuvable.".into());
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("PDF_EDITOR_SOURCE_METADATA:{error}"))?;
    if is_link_or_reparse(&metadata) || metadata.len() > MAX_SOURCE_BYTES {
        return Err(
            "PDF_EDITOR_SOURCE_INVALID:Le PDF source est un lien ou dépasse 128 Mio.".into(),
        );
    }
    let mut header = [0u8; 5];
    File::open(path)
        .and_then(|mut file| file.read_exact(&mut header))
        .map_err(|error| format!("PDF_EDITOR_SOURCE_READ:{error}"))?;
    if &header != b"%PDF-" {
        return Err("PDF_EDITOR_SOURCE_TYPE:Le type réel du fichier n’est pas PDF.".into());
    }
    path.canonicalize()
        .map_err(|error| format!("PDF_EDITOR_SOURCE_PATH:{error}"))
}

pub(super) fn validate_destination(source: &Path, destination: &Path) -> Result<PathBuf, String> {
    if !destination.is_absolute()
        || destination
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
            != Some("pdf")
    {
        return Err(
            "PDF_EDITOR_DESTINATION_INVALID:La destination doit être un chemin PDF absolu.".into(),
        );
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "PDF_EDITOR_DESTINATION_INVALID:Dossier absent.".to_string())?;
    let parent = parent
        .canonicalize()
        .map_err(|error| format!("PDF_EDITOR_DESTINATION_PARENT:{error}"))?;
    let file_name = destination
        .file_name()
        .ok_or_else(|| "PDF_EDITOR_DESTINATION_INVALID:Nom absent.".to_string())?;
    let resolved = parent.join(file_name);
    if resolved == source {
        return Err("PDF_EDITOR_SAVE_AS_REQUIRED:Le PDF source n’est jamais modifié ; choisissez une autre destination.".into());
    }
    if let Ok(metadata) = fs::symlink_metadata(&resolved)
        && (is_link_or_reparse(&metadata) || !metadata.is_file())
    {
        return Err("PDF_EDITOR_DESTINATION_INVALID:La destination est un lien ou n’est pas un fichier ordinaire.".into());
    }
    Ok(resolved)
}

pub(super) fn validate_render_output(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute()
        || path
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
            != Some("png")
        || path.exists()
    {
        return Err("PDF_EDITOR_RENDER_OUTPUT:La sortie PNG doit être absolue et nouvelle.".into());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "PDF_EDITOR_RENDER_OUTPUT:Dossier absent.".to_string())?
        .canonicalize()
        .map_err(|error| format!("PDF_EDITOR_RENDER_OUTPUT:{error}"))?;
    let name = path
        .file_name()
        .ok_or_else(|| "PDF_EDITOR_RENDER_OUTPUT:Nom absent.".to_string())?;
    Ok(parent.join(name))
}

pub(super) fn load_document<'a>(
    pdfium: &'a Pdfium,
    source: &Path,
    password: Option<&str>,
) -> Result<PdfDocument<'a>, String> {
    pdfium
        .load_pdf_from_file(source, password)
        .map_err(|error| map_open_error(error, password.is_some()))
}

fn map_open_error(error: PdfiumError, password_supplied: bool) -> String {
    match error {
        PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError)
            if !password_supplied =>
        {
            "PDF_EDITOR_PASSWORD_REQUIRED:Ce PDF est protégé par un mot de passe.".into()
        }
        PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError) => {
            "PDF_EDITOR_PASSWORD_INVALID:Le mot de passe PDF est incorrect.".into()
        }
        error => format!("PDF_EDITOR_OPEN_FAILED:PDF corrompu ou non pris en charge : {error}"),
    }
}

pub(super) fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("PDF_EDITOR_HASH_READ:{error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("PDF_EDITOR_HASH_READ:{error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub(super) fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}

pub(super) fn save_atomically(
    document: &PdfDocument<'_>,
    destination: &Path,
) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "PDF_EDITOR_DESTINATION_INVALID:Dossier absent.".to_string())?;
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document.pdf");
    let staged = unique_stage_path(parent, name)?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&staged)
        .map_err(|error| format!("PDF_EDITOR_STAGE_CREATE:{error}"))?;
    let result = (|| {
        document
            .save_to_writer(&mut file)
            .map_err(|error| format!("PDF_EDITOR_SAVE:{error}"))?;
        file.flush()
            .map_err(|error| format!("PDF_EDITOR_SAVE_FLUSH:{error}"))?;
        file.sync_all()
            .map_err(|error| format!("PDF_EDITOR_SAVE_SYNC:{error}"))?;
        drop(file);
        replace_file(&staged, destination)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&staged);
    }
    result
}

pub(super) fn unique_stage_path(parent: &Path, name: &str) -> Result<PathBuf, String> {
    for attempt in 0..32u8 {
        let candidate = parent.join(format!(
            ".{name}.multi-converter-{}-{attempt}.part",
            std::process::id()
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("PDF_EDITOR_STAGE_CREATE:Impossible de réserver un fichier temporaire.".into())
}

pub(super) fn unique_pdf_stage_path(parent: &Path, label: &str) -> Result<PathBuf, String> {
    for attempt in 0..32u8 {
        let candidate = parent.join(format!(
            ".{label}.multi-converter-{}-{attempt}.pdf",
            std::process::id()
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("PDF_EDITOR_STAGE_CREATE:Impossible de réserver un PDF temporaire.".into())
}

fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}

#[cfg(windows)]
pub(super) fn replace_file(staged: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };
    let source = staged
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let target = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let ok = unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok != 0 {
        Ok(())
    } else {
        Err(format!(
            "PDF_EDITOR_REPLACE:{}",
            std::io::Error::last_os_error()
        ))
    }
}

#[cfg(not(windows))]
pub(super) fn replace_file(staged: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(staged, destination).map_err(|error| format!("PDF_EDITOR_REPLACE:{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_use_constant_time_comparison() {
        assert!(constant_time_eq(b"abcd", b"abcd"));
        assert!(!constant_time_eq(b"abcd", b"abce"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    #[test]
    fn save_as_never_accepts_the_source_path() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.pdf");
        fs::write(&source, b"%PDF-test").unwrap();
        let source = source.canonicalize().unwrap();
        assert!(
            validate_destination(&source, &source)
                .unwrap_err()
                .contains("jamais modifié")
        );
    }

    #[test]
    fn password_errors_are_distinct_from_corrupt_files() {
        let password_error =
            || PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError);
        assert!(
            map_open_error(password_error(), false).starts_with("PDF_EDITOR_PASSWORD_REQUIRED")
        );
        assert!(map_open_error(password_error(), true).starts_with("PDF_EDITOR_PASSWORD_INVALID"));
        assert!(
            map_open_error(
                PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::FormatError),
                false
            )
            .starts_with("PDF_EDITOR_OPEN_FAILED")
        );
    }
}
