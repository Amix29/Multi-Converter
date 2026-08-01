use super::CommandResult;
use crate::runtime_log;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::{
    env,
    ffi::OsStr,
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

const MAX_CLIPBOARD_IMPORT_FILES: usize = 24;
const MAX_CLIPBOARD_IMPORT_BYTES: usize = 128 * 1024 * 1024;
const MAX_CLIPBOARD_IMPORT_TOTAL_BYTES: usize = 512 * 1024 * 1024;
const CLIPBOARD_TEMP_PREFIX: &str = "multi-converter-clipboard-";

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardFile {
    name: String,
    mime_type: String,
    bytes: Vec<u8>,
}

#[tauri::command]
pub(crate) async fn save_clipboard_files(files: Vec<ClipboardFile>) -> CommandResult<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || save_clipboard_files_to_temp(&files))
        .await
        .map_err(|error| error.to_string())?
}

fn save_clipboard_files_to_temp(files: &[ClipboardFile]) -> CommandResult<Vec<String>> {
    let directory = tempfile::Builder::new()
        .prefix(CLIPBOARD_TEMP_PREFIX)
        .tempdir()
        .map_err(|error| error.to_string())?;
    let paths = save_clipboard_files_to_directory(files, directory.path())?;
    let _ = directory.keep();
    Ok(paths)
}

fn save_clipboard_files_to_directory(
    files: &[ClipboardFile],
    directory: &Path,
) -> CommandResult<Vec<String>> {
    if files.is_empty() {
        return Err("clipboard.empty".to_string());
    }
    if files.len() > MAX_CLIPBOARD_IMPORT_FILES {
        return Err("clipboard.tooManyFiles".to_string());
    }
    let total_bytes = files.iter().try_fold(0usize, |total, file| {
        total
            .checked_add(file.bytes.len())
            .filter(|value| *value <= MAX_CLIPBOARD_IMPORT_TOTAL_BYTES)
            .ok_or_else(|| "clipboard.batchTooLarge".to_string())
    })?;
    debug_assert!(total_bytes <= MAX_CLIPBOARD_IMPORT_TOTAL_BYTES);

    fs::create_dir_all(directory).map_err(|error| error.to_string())?;

    let mut saved_paths = Vec::with_capacity(files.len());
    for file in files {
        if file.bytes.len() > MAX_CLIPBOARD_IMPORT_BYTES {
            return Err("clipboard.fileTooLarge".to_string());
        }

        let file_name = safe_clipboard_file_name(&file.name, &file.mime_type);
        let output_path = directory.join(format!("{}-{file_name}", uuid::Uuid::new_v4()));
        write_private_file(&output_path, &file.bytes).map_err(|error| error.to_string())?;
        saved_paths.push(output_path.to_string_lossy().to_string());
    }

    Ok(saved_paths)
}

fn write_private_file(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(path)?;
    file.write_all(bytes)
}

fn safe_clipboard_file_name(name: &str, mime_type: &str) -> String {
    let source_name = Path::new(name)
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or_default();
    let sanitized = source_name
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

    if sanitized.trim().is_empty() || sanitized == "." || sanitized == ".." {
        format!("clipboard.{}", extension_for_clipboard_mime(mime_type))
    } else if Path::new(&sanitized).extension().is_some() {
        sanitized
    } else {
        format!("{sanitized}.{}", extension_for_clipboard_mime(mime_type))
    }
}

fn extension_for_clipboard_mime(mime_type: &str) -> &'static str {
    match mime_type.to_ascii_lowercase().as_str() {
        "text/plain" => "txt",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "image/tiff" => "tiff",
        "audio/mpeg" => "mp3",
        "audio/wav" | "audio/x-wav" => "wav",
        "audio/ogg" => "ogg",
        "audio/flac" => "flac",
        "audio/mp4" => "m4a",
        "video/mp4" => "mp4",
        "video/quicktime" => "mov",
        "video/webm" => "webm",
        "video/x-matroska" => "mkv",
        _ => "bin",
    }
}
pub(crate) fn cleanup_stale_clipboard_folders() {
    let Ok(entries) = fs::read_dir(env::temp_dir()) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let is_clipboard_dir = path.is_dir()
            && path
                .file_name()
                .and_then(OsStr::to_str)
                .is_some_and(|name| name.starts_with(CLIPBOARD_TEMP_PREFIX));
        if is_clipboard_dir && fs::remove_dir_all(&path).is_err() {
            runtime_log::write(
                "cleanup",
                &format!("clipboard cleanup failed for {}", runtime_log::path(&path)),
            );
        }
    }
}
#[cfg(test)]
mod tests;
