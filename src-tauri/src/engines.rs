mod catalog;
mod contracts;
mod health;
mod platform;
mod policy;
mod process;
mod resolution;

pub use catalog::tool_label;
// Preserve the pre-refactor domain facade for crate-local consumers and characterization tests.
#[allow(unused_imports)]
pub use contracts::{
    DependencyBootstrap, DependencyCheck, EngineMode, EngineSelection, EngineState, ToolStatus,
};
#[allow(unused_imports)]
pub use health::{bootstrap_dependencies, is_available, tool_statuses};
pub use policy::{decorate_target, select_engine};
#[allow(unused_imports)]
pub(crate) use process::smoke_test_external_path;
pub use resolution::resolve_tool;

use crate::engine_distribution;
use std::env;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const FFMPEG_REQUIRED_VERSION: &str = "8.1.1";

pub(crate) fn tool_env_root() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|path| path.join("Multi-Converter").join("tool-env"))
        .ok_or_else(|| "Dossier local de l'application introuvable.".to_string())
}

pub(crate) fn internet_available() -> bool {
    engine_distribution::https_url_available("https://github.com/")
        || engine_distribution::https_url_available("https://www.microsoft.com/")
}

fn bundled_binary(app: Option<&AppHandle>, stem: &str) -> Option<PathBuf> {
    let binary_name = binary_name(stem);
    let universal_binary_name = universal_binary_name(stem);
    let sidecar_name = if cfg!(target_os = "windows") {
        format!("{stem}.exe")
    } else {
        stem.to_string()
    };
    if let Ok(current_exe) = env::current_exe()
        && let Some(exe_dir) = current_exe.parent()
    {
        for candidate in [
            exe_dir.join(&sidecar_name),
            exe_dir.join(&universal_binary_name),
            exe_dir.join(&binary_name),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    if let Some(app) = app
        && let Ok(resource_dir) = app.path().resource_dir()
    {
        for candidate in [
            resource_dir.join(&sidecar_name),
            resource_dir.join(&universal_binary_name),
            resource_dir.join(&binary_name),
            resource_dir.join("binaries").join(&universal_binary_name),
            resource_dir.join("binaries").join(&binary_name),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    let manifest_binaries_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    [
        manifest_binaries_dir.join(&universal_binary_name),
        manifest_binaries_dir.join(binary_name),
    ]
    .into_iter()
    .find(|candidate| candidate.exists())
}

fn binary_name(stem: &str) -> String {
    binary_name_for(stem, env::consts::OS, env::consts::ARCH)
}

fn binary_name_for(stem: &str, os: &str, arch: &str) -> String {
    platform::binary_name_for(stem, os, arch)
}

fn universal_binary_name(stem: &str) -> String {
    universal_binary_name_for(stem, env::consts::OS, env::consts::ARCH)
}

fn universal_binary_name_for(stem: &str, os: &str, arch: &str) -> String {
    platform::universal_binary_name_for(stem, os, arch)
}

#[cfg(test)]
mod tests;
