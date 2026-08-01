use super::contracts::{EngineManifest, ManifestEngine};
use std::env;
use std::fs;

const EMBEDDED_MANIFEST_JSON: &str = include_str!("../../engines-manifest.json");

pub fn load_manifest() -> Result<EngineManifest, String> {
    if let Ok(path) = env::var("MULTI_CONVERTER_ENGINE_MANIFEST") {
        let content = fs::read_to_string(&path)
            .map_err(|error| format!("Manifest moteurs illisible ({path}) : {error}"))?;
        return parse_manifest(&content);
    }
    parse_manifest(EMBEDDED_MANIFEST_JSON)
}

fn parse_manifest(content: &str) -> Result<EngineManifest, String> {
    serde_json::from_str(content).map_err(|error| error.to_string())
}

pub fn manifest_for_platform(manifest: &EngineManifest, engine_id: &str) -> Option<ManifestEngine> {
    manifest_for_platform_id(manifest, engine_id, current_platform_id())
}

pub fn current_platform_id() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "windows-x64"
    } else if cfg!(target_os = "macos") {
        "macos-universal"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "linux-x64"
    } else {
        "unsupported"
    }
}

pub(super) fn manifest_for_platform_id(
    manifest: &EngineManifest,
    engine_id: &str,
    platform: &str,
) -> Option<ManifestEngine> {
    manifest
        .engines
        .iter()
        .find(|engine| engine.id == engine_id && engine.platform == platform)
        .cloned()
}
