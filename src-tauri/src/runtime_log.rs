use std::fs::{self, OpenOptions};
use std::io::Write;
use std::panic;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

static LOG_LOCK: Mutex<()> = Mutex::new(());
const MAX_LOG_BYTES: u64 = 1024 * 1024;
const LOG_TTL: Duration = Duration::from_secs(14 * 24 * 60 * 60);

pub(crate) fn install_panic_hook() {
    panic::set_hook(Box::new(|_| {
        write("panic", "Unhandled native panic; document content omitted.");
    }));
}

pub(crate) fn write(scope: &str, message: &str) {
    let Ok(_guard) = LOG_LOCK.lock() else { return };
    let Some(base) = dirs::data_local_dir() else {
        return;
    };
    let log_dir = base.join("Multi-Converter").join("logs");
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }
    let path = log_dir.join("multi-converter.log");
    rotate(&path);
    let mut file = match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(file) => file,
        Err(_) => return,
    };
    let timestamp = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "unknown-time".to_string());
    let message: String = message
        .chars()
        .filter(|value| !value.is_control())
        .take(2048)
        .collect();
    let _ = writeln!(file, "[{timestamp}] {scope}: {message}");
}

fn rotate(path: &Path) {
    let previous = path.with_extension("previous.log");
    for candidate in [path, previous.as_path()] {
        if let Ok(metadata) = fs::metadata(candidate)
            && let Ok(modified) = metadata.modified()
            && SystemTime::now()
                .duration_since(modified)
                .unwrap_or_default()
                > LOG_TTL
        {
            let _ = fs::remove_file(candidate);
        }
    }
    if fs::metadata(path).is_ok_and(|metadata| metadata.len() >= MAX_LOG_BYTES) {
        let _ = fs::remove_file(&previous);
        let _ = fs::rename(path, previous);
    }
}

pub(crate) fn path(_value: impl AsRef<Path>) -> String {
    "<path>".to_string()
}

#[cfg(test)]
mod tests {
    use super::path;
    use std::path::Path;

    #[test]
    fn path_redacts_parent_directories() {
        let redacted = path(Path::new("C:\\Users\\Maintainer\\Documents\\secret.pdf"));
        assert_eq!(redacted, "<path>");
        assert!(!redacted.contains("secret.pdf"));
        assert!(!redacted.contains("Maintainer"));
        assert!(!redacted.contains("Documents"));
    }

    #[test]
    fn path_handles_root_like_values() {
        assert_eq!(path(Path::new("C:\\")), "<path>");
    }

    #[test]
    fn rotation_keeps_only_one_bounded_previous_log() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("multi-converter.log");
        std::fs::write(&path, vec![b'x'; super::MAX_LOG_BYTES as usize]).unwrap();
        super::rotate(&path);
        assert!(!path.exists());
        let previous = path.with_extension("previous.log");
        assert_eq!(
            std::fs::metadata(&previous).unwrap().len(),
            super::MAX_LOG_BYTES
        );
        std::fs::write(&path, vec![b'y'; super::MAX_LOG_BYTES as usize]).unwrap();
        super::rotate(&path);
        assert_eq!(std::fs::read(previous).unwrap()[0], b'y');
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}
