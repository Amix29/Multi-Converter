use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRuntimeInfoV1 {
    pub schema_version: u8,
    pub available: bool,
    pub model: String,
    pub runtime: String,
    pub runtime_version: String,
    pub provider: String,
    pub provider_fallback_reason: Option<String>,
    pub languages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrBoundingBoxV1 {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrTextBlockV1 {
    pub text: String,
    pub confidence: f64,
    pub bounding_box: OcrBoundingBoxV1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrWarningV1 {
    pub code: String,
    pub message: String,
    pub page_number: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPageResultV1 {
    pub page_number: u32,
    pub source: String,
    pub width: u32,
    pub height: u32,
    pub text: String,
    pub blocks: Vec<OcrTextBlockV1>,
    pub warnings: Vec<OcrWarningV1>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrDocumentResultV1 {
    pub schema_version: u8,
    pub job_id: String,
    pub text: String,
    pub pages: Vec<OcrPageResultV1>,
    pub warnings: Vec<OcrWarningV1>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrProgressV1 {
    pub schema_version: u8,
    pub job_id: String,
    pub progress: u8,
    pub phase: String,
    pub page_number: Option<u32>,
    pub page_count: Option<u32>,
}

impl OcrProgressV1 {
    pub fn image(job_id: &str, progress: u8, phase: &str) -> Self {
        Self {
            schema_version: 1,
            job_id: job_id.to_string(),
            progress,
            phase: phase.to_string(),
            page_number: Some(1),
            page_count: Some(1),
        }
    }

    pub fn document(
        job_id: &str,
        progress: u8,
        phase: &str,
        page_number: Option<u32>,
        page_count: Option<u32>,
    ) -> Self {
        Self {
            schema_version: 1,
            job_id: job_id.to_string(),
            progress,
            phase: phase.to_string(),
            page_number,
            page_count,
        }
    }
}
