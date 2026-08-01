use crate::engines::EngineMode;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineManifest {
    pub manifest_version: u32,
    pub generated_at: String,
    pub engines: Vec<ManifestEngine>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEngine {
    pub id: String,
    pub display_name: String,
    pub mode: EngineMode,
    pub version: String,
    pub platform: String,
    pub archive_type: ArchiveType,
    pub download_url: String,
    pub sha256: String,
    pub compressed_size_bytes: u64,
    pub installed_size_bytes: u64,
    pub binary_paths: Vec<String>,
    pub health_check: String,
    pub license_name: String,
    pub license_url: Option<String>,
    #[serde(default = "default_published")]
    pub published: bool,
    pub required: bool,
    pub dependencies: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArchiveType {
    Zip,
    SevenZ,
    TarGz,
}

fn default_published() -> bool {
    true
}
