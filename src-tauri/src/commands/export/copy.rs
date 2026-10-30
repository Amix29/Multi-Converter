use super::CommandResult;
use crate::runtime_log;
use std::{
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

pub(super) fn copy_export_file(
    source: &Path,
    destination_dir: &Path,
    file_name: &str,
) -> CommandResult<PathBuf> {
    let staging = copy_to_staging(source, destination_dir, file_name)?;
    let mut index = 0usize;
    loop {
        let output = export_path_candidate(destination_dir, file_name, index);
        match publish_staging(&staging, &output) {
            Ok(()) => return finish_staging(source, staging, output),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                index = index
                    .checked_add(1)
                    .ok_or_else(|| "Aucun nom d'export disponible.".to_string())?;
            }
            Err(error) => {
                let _ = fs::remove_file(&staging);
                log_export_copy_error(source, &output, &error);
                return Err(format!(
                    "Impossible de copier vers \"{}\" : {}",
                    output.display(),
                    error
                ));
            }
        }
    }
}

pub(super) fn copy_export_file_exact(source: &Path, output: &Path) -> CommandResult<()> {
    if fs::symlink_metadata(output).is_ok() {
        return Err(format!(
            "Le chemin d'export existe déjà : {}",
            output.display()
        ));
    }
    let parent = output
        .parent()
        .ok_or_else(|| "Dossier parent d'export introuvable.".to_string())?;
    let name = output
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "Nom de fichier d'export non valide.".to_string())?;
    let staging = copy_to_staging(source, parent, name)?;
    match publish_staging(&staging, output) {
        Ok(()) => finish_staging(source, staging, output.to_path_buf()).map(|_| ()),
        Err(error) => {
            let _ = fs::remove_file(&staging);
            log_export_copy_error(source, output, &error);
            Err(format!(
                "Impossible de copier vers \"{}\" : {}",
                output.display(),
                error
            ))
        }
    }
}

fn copy_to_staging(source: &Path, destination_dir: &Path, hint: &str) -> CommandResult<PathBuf> {
    let staging = destination_dir.join(format!(
        ".{}.multi-converter-{}.part",
        sanitized_staging_hint(hint),
        uuid::Uuid::new_v4()
    ));
    let result = (|| -> io::Result<()> {
        let mut source_file = File::open(source)?;
        let mut staging_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staging)?;
        io::copy(&mut source_file, &mut staging_file)?;
        staging_file.flush()?;
        staging_file.sync_all()
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&staging);
        log_export_copy_error(source, &staging, &error);
        return Err(if !source.exists() {
            "Impossible d'exporter ce fichier. Il n'est plus disponible. Relancez la conversion."
                .to_string()
        } else {
            format!(
                "Impossible de préparer la copie vers \"{}\" : {}",
                destination_dir.display(),
                error
            )
        });
    }
    Ok(staging)
}

fn finish_staging(source: &Path, staging: PathBuf, output: PathBuf) -> CommandResult<PathBuf> {
    if let Err(error) = fs::remove_file(&staging) {
        log_export_copy_error(source, &staging, &error);
    }
    Ok(output)
}

fn publish_staging(staging: &Path, output: &Path) -> io::Result<()> {
    publish_staging_with(staging, output, |source, destination| {
        fs::hard_link(source, destination)
    })
}

fn publish_staging_with<F>(staging: &Path, output: &Path, link: F) -> io::Result<()>
where
    F: FnOnce(&Path, &Path) -> io::Result<()>,
{
    match link(staging, output) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Err(error),
        Err(_) => copy_staging_without_clobber(staging, output),
    }
}

fn copy_staging_without_clobber(staging: &Path, output: &Path) -> io::Result<()> {
    let mut source = File::open(staging)?;
    let mut destination = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)?;
    let result = (|| {
        io::copy(&mut source, &mut destination)?;
        destination.flush()?;
        destination.sync_all()
    })();
    if result.is_err() {
        let _ = fs::remove_file(output);
    }
    result
}

fn sanitized_staging_hint(value: &str) -> String {
    let safe: String = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(48)
        .collect();
    if safe.is_empty() {
        "export".to_string()
    } else {
        safe
    }
}

fn log_export_copy_error(source: &Path, output: &Path, error: &io::Error) {
    runtime_log::write(
        "export",
        &format!(
            "copy failed from {} to {}: {:?}",
            runtime_log::path(source),
            runtime_log::path(output),
            error.kind()
        ),
    );
}

fn export_path_candidate(destination_dir: &Path, file_name: &str, index: usize) -> PathBuf {
    if index == 0 {
        return destination_dir.join(file_name);
    }
    let extension = Path::new(file_name)
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default();
    let base = Path::new(file_name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or(file_name);
    if extension.is_empty() {
        destination_dir.join(format!("{base}-{index}"))
    } else {
        destination_dir.join(format!("{base}-{index}.{extension}"))
    }
}

#[cfg(test)]
pub(super) fn staging_files(destination: &Path) -> Vec<PathBuf> {
    fs::read_dir(destination)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "part")
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_hard_links_fall_back_to_an_exclusive_copy() {
        let directory = tempfile::tempdir().unwrap();
        let staging = directory.path().join("source.part");
        let output = directory.path().join("result.txt");
        fs::write(&staging, "portable export").unwrap();

        publish_staging_with(&staging, &output, |_, _| {
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "hard links unavailable",
            ))
        })
        .unwrap();

        assert_eq!(fs::read_to_string(output).unwrap(), "portable export");
        assert_eq!(fs::read_to_string(staging).unwrap(), "portable export");
    }

    #[test]
    fn fallback_copy_never_overwrites_an_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let staging = directory.path().join("source.part");
        let output = directory.path().join("result.txt");
        fs::write(&staging, "new").unwrap();
        fs::write(&output, "keep").unwrap();

        let error = publish_staging_with(&staging, &output, |_, _| {
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "hard links unavailable",
            ))
        })
        .unwrap_err();

        assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read_to_string(output).unwrap(), "keep");
    }
}
