use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};

const MAX_ARCHIVE_ENTRIES: usize = 50_000;

pub(super) fn extract_archive(
    archive_path: &Path,
    destination: &Path,
    expected_bytes: u64,
) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("Archive moteur trop volumineuse.".to_string());
    }
    let byte_limit = expected_bytes.saturating_add(32 * 1024 * 1024);
    let mut extracted_bytes = 0u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| "Chemin dangereux dans l’archive moteur.".to_string())?
            .to_path_buf();
        if relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err("Chemin non portable dans l’archive moteur.".to_string());
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("Lien symbolique interdit dans l’archive moteur.".to_string());
        }
        let output = destination.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&output).map_err(|error| error.to_string())?;
            continue;
        }
        extracted_bytes = extracted_bytes.saturating_add(entry.size());
        if extracted_bytes > byte_limit {
            return Err("Limite d’extraction du moteur dépassée.".to_string());
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut target = File::create(&output).map_err(|error| error.to_string())?;
        let written = io::copy(&mut entry, &mut target).map_err(|error| error.to_string())?;
        if written != entry.size() {
            return Err("Taille extraite incohérente pour le moteur.".to_string());
        }
        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&output, fs::Permissions::from_mode(mode & 0o777))
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub(super) fn safe_relative(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Chemin de moteur dangereux.".to_string());
    }
    Ok(path.to_path_buf())
}

pub(super) fn assert_under(path: &Path, root: &Path) -> Result<(), String> {
    let candidate = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    candidate
        .starts_with(&root)
        .then_some(())
        .ok_or_else(|| "Chemin de cache moteur hors limite.".to_string())
}

pub(super) fn sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
