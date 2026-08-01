use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Format {
    pub id: &'static str,
    pub format: &'static str,
    pub label: &'static str,
    pub extensions: &'static [&'static str],
    pub extension: &'static str,
    pub category: &'static str,
    pub category_id: &'static str,
    pub detail: &'static str,
    pub rank: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetFormat {
    pub format: String,
    pub label: String,
    pub extensions: Vec<String>,
    pub extension: String,
    pub category: String,
    pub category_id: String,
    pub detail: String,
    pub rank: usize,
    pub engine: String,
    pub engine_label: String,
    pub engine_available: bool,
    pub availability: String,
}
