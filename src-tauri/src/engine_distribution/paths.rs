use crate::engines;
use std::env;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

pub fn installed_binary(
    root: &Path,
    engine_id: &str,
    version: &str,
    binary_paths: &[String],
) -> Option<PathBuf> {
    binary_paths
        .iter()
        .map(|relative| root.join(engine_id).join(version).join(relative))
        .filter(|candidate| candidate.is_file())
        .max_by_key(|candidate| executable_candidate_score(candidate))
}

pub fn installed_size(root: &Path, engine_id: &str, version: &str) -> u64 {
    directory_size(&root.join(engine_id).join(version)).unwrap_or(0)
}

pub fn cleanup_stale_installing_dirs() -> Result<(), String> {
    let root = engines::tool_env_root()?;
    let work_root = root.join(".installing");
    if !work_root.exists() {
        return Ok(());
    }
    assert_under(&work_root, &root)?;
    fs::remove_dir_all(&work_root).map_err(|error| error.to_string())
}

fn executable_candidate_score(path: &Path) -> u8 {
    executable_candidate_score_for(path, env::consts::OS, env::consts::ARCH)
}

pub(super) fn executable_candidate_score_for(path: &Path, os: &str, arch: &str) -> u8 {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if os == "windows" {
        if extension.eq_ignore_ascii_case("exe") {
            return 20;
        }
        if extension.eq_ignore_ascii_case("com") {
            return 10;
        }
        return 0;
    }

    if matches!(
        extension.as_str(),
        "dll" | "dylib" | "so" | "a" | "traineddata"
    ) {
        return 0;
    }

    let path_text = path
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    10 + architecture_score(&path_text, os, arch)
}

fn architecture_score(path_text: &str, os: &str, arch: &str) -> u8 {
    if !matches!(os, "macos" | "linux") {
        return 5;
    }
    let native_arm = matches!(arch, "aarch64" | "arm64");
    let has_arm = path_text.contains("aarch64") || path_text.contains("arm64");
    let has_x64 = path_text.contains("x86_64") || path_text.contains("x64");
    let has_universal = path_text.contains("universal") || path_text.contains("univ");

    if native_arm && has_arm {
        return 30;
    }
    if !native_arm && has_x64 {
        return 30;
    }
    if os == "macos" && has_universal {
        return 25;
    }
    if has_arm || has_x64 {
        return 1;
    }
    15
}

fn directory_size(path: &Path) -> io::Result<u64> {
    if !path.exists() {
        return Ok(0);
    }
    let mut total = 0;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            total += directory_size(&entry.path())?;
        } else {
            total += metadata.len();
        }
    }
    Ok(total)
}

fn assert_under(path: &Path, root: &Path) -> Result<(), String> {
    let root = absolute_lexical(root);
    let candidate = absolute_lexical(path);
    if candidate.starts_with(&root) {
        Ok(())
    } else {
        Err("Opération refusée : chemin hors du dossier tool-env.".to_string())
    }
}

fn absolute_lexical(path: &Path) -> PathBuf {
    let raw = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    };
    let mut normalized = PathBuf::new();
    for component in raw.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}
