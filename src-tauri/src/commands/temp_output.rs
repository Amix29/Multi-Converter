use super::CommandResult;
use crate::runtime_log;
use std::{
    env,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

#[tauri::command]
pub(crate) fn create_temp_output_folder() -> CommandResult<String> {
    let path = tempfile::Builder::new()
        .prefix("multi-converter-")
        .tempdir()
        .map_err(|error| error.to_string())?
        .keep();
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn cleanup_temp_output_folder(folder: String) -> CommandResult<bool> {
    let path = PathBuf::from(folder);
    if !is_managed_temp_output_folder(&path) {
        return Ok(false);
    }
    if !path.exists() {
        return Ok(false);
    }
    fs::remove_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(true)
}

pub(super) fn is_managed_temp_output_folder(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(OsStr::to_str) else {
        return false;
    };
    if !name.starts_with("multi-converter-") {
        return false;
    }
    let Ok(temp_root) = env::temp_dir().canonicalize() else {
        return false;
    };
    let Some(parent) = path.parent() else {
        return false;
    };
    parent.canonicalize().is_ok_and(|value| value == temp_root)
}
pub(crate) fn cleanup_stale_temp_output_folders() {
    let Ok(entries) = fs::read_dir(env::temp_dir()) else {
        return;
    };
    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(24 * 60 * 60))
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_managed_temp_output_folder(&path) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if modified <= cutoff
            && let Err(error) = fs::remove_dir_all(&path)
        {
            runtime_log::write(
                "cleanup",
                &format!(
                    "temp cleanup failed for {}: {}",
                    runtime_log::path(&path),
                    error
                ),
            );
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_only_accepts_managed_temp_folder_names() {
        let managed = env::temp_dir().join("multi-converter-test-cleanup");
        let unmanaged = env::temp_dir().join("other-tool-test-cleanup");

        assert!(is_managed_temp_output_folder(&managed));
        assert!(!is_managed_temp_output_folder(&unmanaged));
        assert!(!is_managed_temp_output_folder(Path::new(
            "multi-converter-relative"
        )));
    }
    #[test]
    fn cleanup_temp_output_folder_removes_only_managed_temp_folders() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let managed = env::temp_dir().join(format!("multi-converter-test-cleanup-{unique}"));
        let unmanaged = env::temp_dir().join(format!("other-tool-test-cleanup-{unique}"));
        fs::create_dir_all(&managed).unwrap();
        fs::create_dir_all(&unmanaged).unwrap();
        fs::write(managed.join("result.txt"), "temporary output").unwrap();
        fs::write(unmanaged.join("keep.txt"), "user output").unwrap();

        assert!(cleanup_temp_output_folder(managed.to_string_lossy().to_string()).unwrap());
        assert!(!managed.exists());
        assert!(!cleanup_temp_output_folder(unmanaged.to_string_lossy().to_string()).unwrap());
        assert!(unmanaged.exists());

        fs::remove_dir_all(unmanaged).unwrap();
    }
}
