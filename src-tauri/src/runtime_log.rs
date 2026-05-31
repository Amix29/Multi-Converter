use std::fs::{self, OpenOptions};
use std::io::Write;
use std::panic;

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
