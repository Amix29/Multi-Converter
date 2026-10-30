use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};

const MANIFEST_NAME: &str = "runtime-manifest.json";

pub(super) struct ArchiveExpectation<'a> {
    pub aggregate_sha256: &'a str,
    pub file_count: usize,
    pub total_bytes: u64,
}

pub(super) fn archive_path(resource_root: &Path, platform: &str) -> PathBuf {
    resource_root
        .join("runtime")
        .join(format!("{platform}.zip"))
}

pub(super) fn ensure_extracted(
    app: &AppHandle,
    resource_root: &Path,
    platform: &str,
    expected: ArchiveExpectation<'_>,
    canceled: &AtomicBool,
    progress: &mut dyn FnMut(u8),
) -> Result<PathBuf, String> {
    ensure_not_canceled(canceled)?;
    let archive = archive_path(resource_root, platform);
    if !archive.is_file() {
        return Err("OCR_RUNTIME_MISSING:Archive du moteur OCR absente.".to_string());
    }
    let cache_root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("OCR_RUNTIME_CACHE:{error}"))?
        .join("ocr-runtime");
    fs::create_dir_all(&cache_root).map_err(|error| format!("OCR_RUNTIME_CACHE:{error}"))?;
    let target = cache_root.join(format!("{platform}-{}", expected.aggregate_sha256));
    if target.join(MANIFEST_NAME).is_file() {
        progress(100);
        return Ok(target);
    }

    let staging = crate::private_temp::builder(".extracting-")
        .tempdir_in(&cache_root)
        .map_err(|error| format!("OCR_RUNTIME_CACHE:{error}"))?;
    extract_archive(
        &archive,
        staging.path(),
        expected.file_count,
        expected.total_bytes,
        canceled,
        progress,
    )?;
    ensure_not_canceled(canceled)?;
    let staging_path = staging.keep();
    match fs::rename(&staging_path, &target) {
        Ok(()) => Ok(target),
        Err(_error) if target.join(MANIFEST_NAME).is_file() => {
            let _ = fs::remove_dir_all(staging_path);
            Ok(target)
        }
        Err(error) => {
            let _ = fs::remove_dir_all(staging_path);
            Err(format!("OCR_RUNTIME_CACHE:{error}"))
        }
    }
}

fn extract_archive(
    archive_path: &Path,
    destination: &Path,
    expected_files: usize,
    expected_bytes: u64,
    canceled: &AtomicBool,
    progress: &mut dyn FnMut(u8),
) -> Result<(), String> {
    ensure_not_canceled(canceled)?;
    let file = File::open(archive_path).map_err(|error| format!("OCR_RUNTIME_ARCHIVE:{error}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("OCR_RUNTIME_ARCHIVE:{error}"))?;
    if archive.len() > expected_files.saturating_add(1_024) {
        return Err("OCR_RUNTIME_ARCHIVE:L’archive contient trop d’entrées.".to_string());
    }
    let byte_limit = expected_bytes.saturating_add(16 * 1024 * 1024);
    let mut extracted_files = 0usize;
    let mut extracted_bytes = 0u64;
    let mut seen_paths = HashSet::new();
    let entry_count = archive.len().max(1);

    for index in 0..archive.len() {
        ensure_not_canceled(canceled)?;
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("OCR_RUNTIME_ARCHIVE:{error}"))?;
        let relative = crate::path_safety::archive_relative(entry.name_raw(), entry.is_dir())
            .ok_or_else(|| "OCR_RUNTIME_ARCHIVE:Nom non portable dans l’archive.".to_string())?;
        let identity = relative.to_string_lossy().to_lowercase();
        if !seen_paths.insert(identity) {
            return Err("OCR_RUNTIME_ARCHIVE:Chemin dupliqué dans l’archive.".to_string());
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("OCR_RUNTIME_ARCHIVE:Lien symbolique interdit.".to_string());
        }
        let output = destination.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&output).map_err(|error| format!("OCR_RUNTIME_ARCHIVE:{error}"))?;
            continue;
        }
        extracted_files = extracted_files.saturating_add(1);
        extracted_bytes = extracted_bytes.saturating_add(entry.size());
        if extracted_files > expected_files.saturating_add(1) || extracted_bytes > byte_limit {
            return Err("OCR_RUNTIME_ARCHIVE:Limites d’extraction dépassées.".to_string());
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("OCR_RUNTIME_ARCHIVE:{error}"))?;
        }
        let mut target_file =
            File::create(&output).map_err(|error| format!("OCR_RUNTIME_ARCHIVE:{error}"))?;
        let written = copy_with_cancellation(&mut entry, &mut target_file, canceled)?;
        if written != entry.size() {
            return Err("OCR_RUNTIME_ARCHIVE:Taille extraite incohérente.".to_string());
        }
        apply_unix_mode(&output, entry.unix_mode())?;
        progress((((index + 1) * 100) / entry_count).min(100) as u8);
    }
    if !destination.join(MANIFEST_NAME).is_file() {
        return Err("OCR_RUNTIME_ARCHIVE:Manifeste du runtime absent.".to_string());
    }
    Ok(())
}

fn copy_with_cancellation(
    source: &mut impl Read,
    destination: &mut impl Write,
    canceled: &AtomicBool,
) -> Result<u64, String> {
    let mut total = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        ensure_not_canceled(canceled)?;
        let read = source
            .read(&mut buffer)
            .map_err(|error| format!("OCR_RUNTIME_ARCHIVE:{error}"))?;
        if read == 0 {
            return Ok(total);
        }
        destination
            .write_all(&buffer[..read])
            .map_err(|error| format!("OCR_RUNTIME_ARCHIVE:{error}"))?;
        total = total.saturating_add(read as u64);
    }
}

fn ensure_not_canceled(canceled: &AtomicBool) -> Result<(), String> {
    if canceled.load(Ordering::SeqCst) {
        Err("OCR_CANCELLED:L’OCR a été annulé.".to_string())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
fn apply_unix_mode(path: &Path, mode: Option<u32>) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let Some(mode) = mode else {
        return Ok(());
    };
    fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o777))
        .map_err(|error| format!("OCR_RUNTIME_ARCHIVE:{error}"))
}

#[cfg(not(unix))]
fn apply_unix_mode(_path: &Path, _mode: Option<u32>) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    #[test]
    fn archive_extraction_rejects_parent_traversal() {
        let temp = tempfile::tempdir().unwrap();
        let archive_path = temp.path().join("unsafe.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive_path).unwrap());
        writer
            .start_file("../outside.exe", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"unsafe").unwrap();
        writer.finish().unwrap();
        let canceled = AtomicBool::new(false);
        assert!(
            extract_archive(&archive_path, temp.path(), 1, 16, &canceled, &mut |_| {}).is_err()
        );
        assert!(!temp.path().join("outside.exe").exists());
    }

    #[test]
    fn archive_extraction_rejects_case_ambiguous_duplicates() {
        let temp = tempfile::tempdir().unwrap();
        let archive_path = temp.path().join("duplicates.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive_path).unwrap());
        writer
            .start_file("worker.bin", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"one").unwrap();
        writer
            .start_file("WORKER.BIN", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"two").unwrap();
        writer.finish().unwrap();
        let canceled = AtomicBool::new(false);
        assert!(
            extract_archive(&archive_path, temp.path(), 2, 16, &canceled, &mut |_| {}).is_err()
        );
    }

    #[test]
    fn archive_extraction_honors_cancellation_before_writing() {
        let temp = tempfile::tempdir().unwrap();
        let archive_path = temp.path().join("runtime.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive_path).unwrap());
        writer
            .start_file(MANIFEST_NAME, SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"{}").unwrap();
        writer.finish().unwrap();
        let canceled = AtomicBool::new(true);
        let error =
            extract_archive(&archive_path, temp.path(), 1, 16, &canceled, &mut |_| {}).unwrap_err();
        assert!(error.starts_with("OCR_CANCELLED:"));
    }
}
