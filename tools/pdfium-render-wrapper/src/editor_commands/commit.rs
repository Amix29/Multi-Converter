use super::io::{constant_time_eq, hash_file, replace_file};
use std::fs;
use std::path::Path;

/// Validates a fully written staging PDF, rechecks the source identity at the
/// last possible moment, and only then publishes the result. A validation or
/// source-identity failure never touches an existing destination.
pub(super) fn validate_and_commit<F>(
    source: &Path,
    expected_source_hash: &str,
    staged: &Path,
    destination: &Path,
    source_changed_error: &'static str,
    validate: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    if let Err(error) = validate(staged) {
        let _ = fs::remove_file(staged);
        return Err(error);
    }

    let current_source_hash = match hash_file(source) {
        Ok(hash) => hash,
        Err(error) => {
            let _ = fs::remove_file(staged);
            return Err(error);
        }
    };
    if !constant_time_eq(
        expected_source_hash.as_bytes(),
        current_source_hash.as_bytes(),
    ) {
        let _ = fs::remove_file(staged);
        return Err(source_changed_error.into());
    }

    if let Err(error) = replace_file(staged, destination) {
        let _ = fs::remove_file(staged);
        return Err(error);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn failed_late_validation_preserves_an_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.pdf");
        let staged = directory.path().join("staged.pdf");
        let destination = directory.path().join("destination.pdf");
        fs::write(&source, b"source").unwrap();
        fs::write(&staged, b"new result").unwrap();
        fs::write(&destination, b"existing result").unwrap();
        let source_hash = hash_file(&source).unwrap();

        let error = validate_and_commit(
            &source,
            &source_hash,
            &staged,
            &destination,
            "source changed",
            |_| Err("late validation failed".into()),
        )
        .unwrap_err();

        assert_eq!(error, "late validation failed");
        assert_eq!(fs::read(&destination).unwrap(), b"existing result");
        assert!(!staged.exists());
    }

    #[test]
    fn changed_source_preserves_an_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.pdf");
        let staged = directory.path().join("staged.pdf");
        let destination = directory.path().join("destination.pdf");
        fs::write(&source, b"source before").unwrap();
        let source_hash = hash_file(&source).unwrap();
        fs::write(&source, b"source after").unwrap();
        fs::write(&staged, b"new result").unwrap();
        fs::write(&destination, b"existing result").unwrap();

        let error = validate_and_commit(
            &source,
            &source_hash,
            &staged,
            &destination,
            "source changed",
            |_| Ok(()),
        )
        .unwrap_err();

        assert_eq!(error, "source changed");
        assert_eq!(fs::read(&destination).unwrap(), b"existing result");
        assert!(!staged.exists());
    }
}
