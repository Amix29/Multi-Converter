mod extraction;
mod profile;

use crate::engine_distribution::ManifestEngine;
use crate::engines;
use extraction::{assert_under, extract_archive, safe_relative, sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

static EXTRACTION_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn available(app: &AppHandle, engine: &ManifestEngine) -> bool {
    archive_path(app, engine).is_some_and(|path| path.is_file())
}

pub(crate) fn is_extracted(engine: &ManifestEngine) -> bool {
    let Ok(spec) = profile::archive_spec(engine) else {
        return false;
    };
    extracted_root(engine)
        .ok()
        .is_some_and(|root| marker_matches(&root, &spec.sha256) && binaries_exist(&root, engine))
}

pub(crate) fn ensure_extracted(
    app: &AppHandle,
    engine: &ManifestEngine,
) -> Result<PathBuf, String> {
    let _guard = EXTRACTION_LOCK
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let spec = profile::archive_spec(engine)?;
    let root = cache_root(engine)?;
    let target = root.join(&engine.id).join(&engine.version);
    if marker_matches(&target, &spec.sha256) && binaries_exist(&target, engine) {
        return Ok(root);
    }
    let archive = archive_path(app, engine)
        .filter(|path| path.is_file())
        .ok_or_else(|| format!("Archive embarquée absente pour {}.", engine.display_name))?;
    if sha256(&archive)? != spec.sha256.to_ascii_lowercase() {
        return Err(format!(
            "Archive embarquée modifiée pour {}.",
            engine.display_name
        ));
    }
    fs::create_dir_all(target.parent().unwrap_or(&root)).map_err(|error| error.to_string())?;
    if target.exists() {
        assert_under(&target, &root)?;
        fs::remove_dir_all(&target).map_err(|error| error.to_string())?;
    }
    let staging = crate::private_temp::builder(".extracting-")
        .tempdir_in(target.parent().unwrap_or(&root))
        .map_err(|error| error.to_string())?;
    extract_archive(&archive, staging.path(), spec.installed_size_bytes)?;
    if !binaries_exist_at(staging.path(), &engine.binary_paths) {
        return Err(format!(
            "Archive embarquée incomplète pour {}.",
            engine.display_name
        ));
    }
    fs::write(
        staging.path().join(".archive-sha256"),
        format!("{}\n", spec.sha256.to_ascii_lowercase()),
    )
    .map_err(|error| error.to_string())?;
    let staging_path = staging.keep();
    fs::rename(&staging_path, &target).map_err(|error| {
        let _ = fs::remove_dir_all(&staging_path);
        error.to_string()
    })?;
    Ok(root)
}

fn archive_path(app: &AppHandle, engine: &ManifestEngine) -> Option<PathBuf> {
    if engine.id != "libreoffice" || engine.platform != "windows-x64" {
        return None;
    }
    app.path()
        .resource_dir()
        .ok()
        .map(|root| root.join("engine-archives").join("libreoffice.zip"))
}

fn extracted_root(engine: &ManifestEngine) -> Result<PathBuf, String> {
    Ok(cache_root(engine)?.join(&engine.id).join(&engine.version))
}

fn cache_root(engine: &ManifestEngine) -> Result<PathBuf, String> {
    let root = engines::tool_env_root()?.join("bundled");
    Ok(match profile::archive_spec(engine)?.cache_key {
        Some(key) => root.join("profiles").join(key),
        None => root,
    })
}

fn marker_matches(target: &Path, expected: &str) -> bool {
    fs::read_to_string(target.join(".archive-sha256"))
        .ok()
        .is_some_and(|value| value.trim().eq_ignore_ascii_case(expected))
}

fn binaries_exist(target: &Path, engine: &ManifestEngine) -> bool {
    binaries_exist_at(target, &engine.binary_paths)
}

fn binaries_exist_at(target: &Path, binary_paths: &[String]) -> bool {
    binary_paths
        .iter()
        .all(|relative| safe_relative(relative).is_ok_and(|path| target.join(path).is_file()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    #[test]
    fn engine_archive_rejects_parent_traversal() {
        let temp = tempfile::tempdir().unwrap();
        let archive_path = temp.path().join("unsafe.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive_path).unwrap());
        writer
            .start_file("../outside.dll", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"unsafe").unwrap();
        writer.finish().unwrap();
        assert!(extract_archive(&archive_path, temp.path(), 16).is_err());
        assert!(!temp.path().join("outside.dll").exists());
    }

    #[test]
    #[ignore = "extracts the 1.5 GB prepared LibreOffice runtime"]
    fn prepared_libreoffice_archive_extracts_required_launcher() {
        let archive = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bundled-engine-archives")
            .join("windows-x64")
            .join("libreoffice.zip");
        assert!(archive.is_file(), "prepare:bundled-engines must run first");
        let temp = tempfile::tempdir().unwrap();
        extract_archive(&archive, temp.path(), 1_513_332_017).unwrap();
        assert!(temp.path().join("program").join("soffice.exe").is_file());
    }

    #[test]
    #[ignore = "streams the prepared LibreOffice archive without extracting files"]
    fn prepared_libreoffice_profile_streams_with_the_runtime_zip_reader() {
        let lock: serde_json::Value =
            serde_json::from_str(include_str!("../windows-libreoffice-profile.json")).unwrap();
        let archive_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bundled-engine-archives/windows-x64/libreoffice.headless.zip");
        assert_eq!(
            sha256(&archive_path).unwrap(),
            lock["archiveSha256"].as_str().unwrap()
        );
        let mut archive = zip::ZipArchive::new(File::open(archive_path).unwrap()).unwrap();
        let mut bytes = 0;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).unwrap();
            assert!(
                crate::path_safety::archive_relative(entry.name_raw(), entry.is_dir()).is_some()
            );
            bytes += std::io::copy(&mut entry, &mut std::io::sink()).unwrap();
        }
        assert_eq!(archive.len() as u64, lock["fileCount"].as_u64().unwrap());
        assert_eq!(bytes, lock["installedSizeBytes"].as_u64().unwrap());
    }
}
