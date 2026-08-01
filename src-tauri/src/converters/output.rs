use super::{ConvertError, Result};
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub(super) struct AtomicOutput {
    final_path: PathBuf,
    staging_path: PathBuf,
    committed: bool,
}

impl AtomicOutput {
    pub(super) fn new(final_path: &Path) -> Result<Self> {
        let parent = final_path
            .parent()
            .ok_or_else(|| ConvertError::Message("Dossier de sortie invalide.".to_string()))?;
        let stem = final_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("conversion");
        let extension = final_path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        let suffix = uuid::Uuid::new_v4();
        let staging_name = if extension.is_empty() {
            format!(".{stem}-{suffix}.mc-stage")
        } else {
            format!(".{stem}-{suffix}.mc-stage.{extension}")
        };
        Ok(Self {
            final_path: final_path.to_path_buf(),
            staging_path: parent.join(staging_name),
            committed: false,
        })
    }

    pub(super) fn path(&self) -> &Path {
        &self.staging_path
    }

    pub(super) fn commit(mut self) -> Result<PathBuf> {
        match publish_no_replace(&self.staging_path, &self.final_path) {
            Ok(()) => {}
            Err(error)
                if error.kind() == io::ErrorKind::AlreadyExists || self.final_path.exists() =>
            {
                return Err(ConvertError::Message(
                    "Un fichier de sortie portant ce nom existe déjà.".to_string(),
                ));
            }
            Err(error) => return Err(error.into()),
        }
        self.committed = true;
        Ok(self.final_path.clone())
    }
}

fn publish_no_replace(staging_path: &Path, final_path: &Path) -> io::Result<()> {
    fs::hard_link(staging_path, final_path)?;
    let _ = fs::remove_file(staging_path);
    Ok(())
}

impl Drop for AtomicOutput {
    fn drop(&mut self) {
        if !self.committed {
            let _ = fs::remove_file(&self.staging_path);
        }
    }
}

pub(super) fn available_output_path(
    input_path: &Path,
    output_dir: &Path,
    target_extension: &str,
) -> PathBuf {
    let source_base = input_path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("fichier");
    let sanitized = source_base
        .chars()
        .map(|ch| {
            if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control()
            {
                '-'
            } else {
                ch
            }
        })
        .collect::<String>();
    let mut candidate = output_dir.join(format!(
        "{}.{}",
        sanitized,
        target_extension.trim_start_matches('.')
    ));
    let mut index = 1;
    while candidate.exists() {
        candidate = output_dir.join(format!(
            "{}-{}.{}",
            sanitized,
            index,
            target_extension.trim_start_matches('.')
        ));
        index += 1;
    }
    candidate
}

pub(super) fn safe_path_component(value: &str) -> String {
    if value.len() > 128 {
        return uuid::Uuid::new_v4().to_string();
    }
    let sanitized = value
        .chars()
        .map(|ch| {
            if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control()
            {
                '-'
            } else {
                ch
            }
        })
        .collect::<String>();
    let normalized = sanitized.trim().trim_end_matches(['.', ' ']);
    if normalized.is_empty()
        || matches!(normalized, "." | "..")
        || is_windows_reserved_component(normalized)
    {
        uuid::Uuid::new_v4().to_string()
    } else {
        normalized.to_string()
    }
}

fn is_windows_reserved_component(value: &str) -> bool {
    let stem = value
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem
            .strip_prefix("COM")
            .or_else(|| stem.strip_prefix("LPT"))
            .is_some_and(|suffix| {
                suffix.len() == 1
                    && suffix
                        .as_bytes()
                        .first()
                        .is_some_and(|digit| (b'1'..=b'9').contains(digit))
            })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uncommitted_output_is_removed() {
        let directory = tempfile::tempdir().unwrap();
        let final_path = directory.path().join("result.txt");
        let staging_path;
        {
            let output = AtomicOutput::new(&final_path).unwrap();
            staging_path = output.path().to_path_buf();
            fs::write(output.path(), "partial").unwrap();
        }

        assert!(!staging_path.exists());
        assert!(!final_path.exists());
    }

    #[test]
    fn validated_output_is_renamed_to_its_final_path() {
        let directory = tempfile::tempdir().unwrap();
        let final_path = directory.path().join("result.txt");
        let output = AtomicOutput::new(&final_path).unwrap();
        let staging_path = output.path().to_path_buf();
        fs::write(output.path(), "complete").unwrap();

        assert_eq!(output.commit().unwrap(), final_path);
        assert_eq!(fs::read_to_string(&final_path).unwrap(), "complete");
        assert!(!staging_path.exists());
    }

    #[test]
    fn commit_never_overwrites_an_existing_file() {
        let directory = tempfile::tempdir().unwrap();
        let final_path = directory.path().join("result.txt");
        let output = AtomicOutput::new(&final_path).unwrap();
        let staging_path = output.path().to_path_buf();
        fs::write(output.path(), "new").unwrap();
        fs::write(&final_path, "existing").unwrap();

        assert!(output.commit().is_err());
        assert_eq!(fs::read_to_string(&final_path).unwrap(), "existing");
        assert!(!staging_path.exists());
    }

    #[test]
    fn concurrent_commits_publish_exactly_one_output() {
        use std::sync::{Arc, Barrier};

        let directory = tempfile::tempdir().unwrap();
        let final_path = directory.path().join("result.txt");
        let first = AtomicOutput::new(&final_path).unwrap();
        let second = AtomicOutput::new(&final_path).unwrap();
        fs::write(first.path(), "first").unwrap();
        fs::write(second.path(), "second").unwrap();
        let barrier = Arc::new(Barrier::new(2));

        let first_barrier = Arc::clone(&barrier);
        let first_thread = std::thread::spawn(move || {
            first_barrier.wait();
            first.commit()
        });
        let second_thread = std::thread::spawn(move || {
            barrier.wait();
            second.commit()
        });
        let results = [first_thread.join().unwrap(), second_thread.join().unwrap()];

        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(results.iter().filter(|result| result.is_err()).count(), 1);
        assert!(matches!(
            fs::read_to_string(final_path).unwrap().as_str(),
            "first" | "second"
        ));
    }
}
