use crate::engine_archive;
use crate::engine_distribution;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn resolve_tool(app: Option<&AppHandle>, id: &str) -> Option<PathBuf> {
    if matches!(id, "rust-image" | "resvg" | "rust-text" | "pdf-extract") {
        return None;
    }
    if id == "ffmpeg" {
        return super::bundled_binary(app, "ffmpeg");
    }
    if id == "ffprobe" {
        return super::bundled_binary(app, "ffprobe");
    }
    bundled_engine_binary(app, id)
}

fn bundled_engine_binary(app: Option<&AppHandle>, id: &str) -> Option<PathBuf> {
    let manifest = engine_distribution::load_manifest().ok()?;
    let engine = engine_distribution::manifest_for_platform(&manifest, id)?;
    if let Some(root) = bundled_engines_root(app)
        && let Some(binary) =
            engine_distribution::installed_binary(&root, id, &engine.version, &engine.binary_paths)
    {
        return Some(binary);
    }
    let app = app?;
    if !engine_archive::available(app, &engine) {
        return None;
    }
    let root = engine_archive::ensure_extracted(app, &engine).ok()?;
    engine_distribution::installed_binary(&root, id, &engine.version, &engine.binary_paths)
}

pub(super) fn bundled_engines_root(app: Option<&AppHandle>) -> Option<PathBuf> {
    if let Some(app) = app
        && let Ok(resource_dir) = app.path().resource_dir()
    {
        let candidate = resource_dir.join("engines");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bundled-engines");
    candidate.exists().then_some(candidate)
}
