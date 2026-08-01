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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ocr_progress_keeps_versioned_camel_case_ipc_shape() {
        let value = serde_json::to_value(OcrProgressV1::document(
            "ocr-1",
            37,
            "recognition",
            Some(2),
            Some(4),
        ))
        .unwrap();

        assert_eq!(
            value,
            serde_json::json!({
                "schemaVersion": 1,
                "jobId": "ocr-1",
                "progress": 37,
                "phase": "recognition",
                "pageNumber": 2,
                "pageCount": 4
            })
        );
    }

    #[test]
    fn ocr_document_result_round_trip_keeps_contract_fields() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "jobId": "ocr-1",
            "text": "Bonjour",
            "pages": [{
                "pageNumber": 1,
                "source": "ocr",
                "width": 100,
                "height": 80,
                "text": "Bonjour",
                "blocks": [],
                "warnings": []
            }],
            "warnings": []
        });

        let result: OcrDocumentResultV1 = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(result).unwrap(), value);
    }
}
