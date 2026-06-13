use std::fs::{self, OpenOptions};
use std::io::Write;
use std::panic;
use std::path::Path;

pub(crate) fn install_panic_hook() {
    panic::set_hook(Box::new(|info| {
        write("panic", &info.to_string());
    }));
}

pub(crate) fn write(scope: &str, message: &str) {
    let Some(base) = dirs::data_local_dir() else {
        return;
    };
    let log_dir = base.join("Multi-Converter").join("logs");
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }
    let path = log_dir.join("multi-converter.log");
    let mut file = match OpenOptions::new().create(true).append(true).open(path) {
        Ok(file) => file,
        Err(_) => return,
    };
    let timestamp = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "unknown-time".to_string());
    let _ = writeln!(file, "[{timestamp}] {scope}: {message}");
}

pub(crate) fn path(value: impl AsRef<Path>) -> String {
    let value = value.as_ref();
    let name = value
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .filter(|file_name| !file_name.is_empty());
    match name {
        Some(file_name) => format!("<path:{file_name}>"),
        None => "<path>".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::path;
    use std::path::Path;

    #[test]
    fn path_redacts_parent_directories() {
        let redacted = path(Path::new("C:\\Users\\Maintainer\\Documents\\secret.pdf"));
        assert_eq!(redacted, "<path:secret.pdf>");
        assert!(!redacted.contains("Maintainer"));
        assert!(!redacted.contains("Documents"));
    }

    #[test]
    fn path_handles_root_like_values() {
        assert_eq!(path(Path::new("C:\\")), "<path>");
    }
}
