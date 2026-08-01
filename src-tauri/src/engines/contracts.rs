use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineMode {
    Base,
    Advanced,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineState {
    Ready,
    Missing,
    BadVersion,
    TestFailed,
    Repairing,
    Disabled,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub id: &'static str,
    pub label: &'static str,
    pub role: &'static str,
    pub description: &'static str,
    pub mode: EngineMode,
    pub available: bool,
    pub path: Option<String>,
    pub engine_kind: &'static str,
    pub managed: bool,
    pub version: Option<String>,
    pub expected_version: &'static str,
    pub version_status: &'static str,
    pub status: EngineState,
    pub status_label: String,
    pub estimated_size: &'static str,
    pub installed_size_bytes: u64,
    pub estimated_installed_size_bytes: u64,
    pub download_size_bytes: u64,
    pub update_available: bool,
    pub commands: &'static [&'static str],
    pub categories: &'static [&'static str],
    pub conversions: &'static [&'static str],
    pub dependencies: &'static [&'static str],
    pub capabilities: &'static [&'static str],
    pub unavailable_reason: Option<String>,
    pub action_label: &'static str,
}

#[derive(Clone, Debug)]
pub struct EngineSelection {
    pub id: String,
    pub label: String,
    pub available: bool,
    pub plan: Vec<String>,
    #[cfg(test)]
    pub required_engine_ids: Vec<String>,
    pub reason: String,
}

pub(super) struct ToolDef {
    pub(super) id: &'static str,
    pub(super) label: &'static str,
    pub(super) role: &'static str,
    pub(super) description: &'static str,
    pub(super) mode: EngineMode,
    pub(super) commands: &'static [&'static str],
    pub(super) engine_kind: &'static str,
    pub(super) managed: bool,
    pub(super) expected_version: &'static str,
    pub(super) estimated_size: &'static str,
    pub(super) categories: &'static [&'static str],
    pub(super) conversions: &'static [&'static str],
    pub(super) capabilities: &'static [&'static str],
    pub(super) action_label: &'static str,
    pub(super) dependencies: &'static [&'static str],
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyBootstrap {
    pub env_dir: String,
    pub ok: bool,
    pub mode: &'static str,
    pub internet_available: bool,
    pub checks: Vec<DependencyCheck>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyCheck {
    pub id: &'static str,
    pub label: &'static str,
    pub role: &'static str,
    pub description: &'static str,
    pub mode: EngineMode,
    pub required_version: &'static str,
    pub detected_version: Option<String>,
    pub path: Option<String>,
    pub status: &'static str,
    pub detail: String,
    pub engine_kind: &'static str,
    pub managed: bool,
    pub available: bool,
    pub version_status: &'static str,
    pub estimated_size: &'static str,
    pub installed_size_bytes: u64,
    pub estimated_installed_size_bytes: u64,
    pub download_size_bytes: u64,
    pub update_available: bool,
    pub commands: &'static [&'static str],
    pub categories: &'static [&'static str],
    pub conversions: &'static [&'static str],
    pub dependencies: &'static [&'static str],
    pub capabilities: &'static [&'static str],
    pub blocked_reason: Option<String>,
    pub action_label: &'static str,
}
