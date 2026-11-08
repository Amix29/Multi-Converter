use super::*;

#[derive(Debug, Error)]
pub enum ConvertError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Image(#[from] image::ImageError),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Csv(#[from] csv::Error),
}

pub type Result<T> = std::result::Result<T, ConvertError>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDescription {
    pub path: String,
    pub name: String,
    pub base_name: String,
    pub extension: String,
    pub category: String,
    pub category_id: String,
    pub source_format: Option<String>,
    pub directory: String,
    pub size: u64,
    pub modified_at: String,
    pub warnings: Vec<FileWarning>,
    pub targets: Vec<crate::registry::TargetFormat>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportOriginV1 {
    pub kind: ImportOriginKind,
    pub root_id: String,
    pub root_name: String,
    pub relative_path: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ImportOriginKind {
    File,
    Folder,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFileDescription {
    #[serde(flatten)]
    pub description: FileDescription,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub import_origin: Option<ImportOriginV1>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchResult {
    pub files: Vec<ImportedFileDescription>,
    pub rejected: Vec<ImportRejection>,
    pub unsupported_count: usize,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRejection {
    pub path: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWarning {
    pub code: &'static str,
    pub severity: &'static str,
    pub limit_bytes: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionJob {
    pub id: String,
    pub input_path: String,
    pub target_format: String,
    pub output_dir: Option<String>,
    pub batch_concurrency: Option<usize>,
    #[serde(default)]
    pub quality_profile: QualityProfile,
    #[serde(default)]
    pub media_mode: MediaMode,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MediaMode {
    #[default]
    Convert,
    Copy,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QualityProfile {
    Compact,
    #[default]
    Balanced,
    High,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionResult {
    pub output_path: String,
    pub engine: String,
    pub warnings: Vec<ConversionWarning>,
    pub input_bytes: u64,
    pub output_bytes: u64,
    pub duration_ms: u64,
    pub quality_profile: QualityProfile,
    pub media_mode: MediaMode,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionWarning {
    pub code: String,
    pub message: String,
    pub page_number: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub job_id: String,
    pub progress: u8,
    pub phase: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversion_job_keeps_camel_case_ipc_shape() {
        let job: ConversionJob = serde_json::from_value(serde_json::json!({
            "id": "job-1",
            "inputPath": "entrée.txt",
            "targetFormat": "pdf",
            "outputDir": null,
            "batchConcurrency": 2
        }))
        .unwrap();

        assert_eq!(job.id, "job-1");
        assert_eq!(job.input_path, "entrée.txt");
        assert_eq!(job.target_format, "pdf");
        assert_eq!(job.batch_concurrency, Some(2));
    }

    #[test]
    fn conversion_result_and_progress_keep_camel_case_ipc_shape() {
        let result = serde_json::to_value(ConversionResult {
            output_path: "sortie.pdf".to_string(),
            engine: "rust-text".to_string(),
            warnings: vec![],
            input_bytes: 100,
            output_bytes: 200,
            duration_ms: 42,
            quality_profile: QualityProfile::Balanced,
            media_mode: MediaMode::Convert,
        })
        .unwrap();
        let progress = serde_json::to_value(ProgressPayload {
            job_id: "job-1".to_string(),
            progress: 42,
            phase: "Conversion".to_string(),
        })
        .unwrap();

        assert_eq!(
            result,
            serde_json::json!({ "outputPath": "sortie.pdf", "engine": "rust-text", "warnings": [],
                "inputBytes": 100, "outputBytes": 200, "durationMs": 42, "qualityProfile": "balanced", "mediaMode": "convert" })
        );
        assert_eq!(
            progress,
            serde_json::json!({ "jobId": "job-1", "progress": 42, "phase": "Conversion" })
        );
    }

    #[test]
    fn import_origin_serializes_without_a_root_path() {
        let value = serde_json::to_value(ImportOriginV1 {
            kind: ImportOriginKind::Folder,
            root_id: "9ceef0c0-9ef9-44c0-92c7-88500cdf67de".to_string(),
            root_name: "travail".to_string(),
            relative_path: "images/photo.png".to_string(),
        })
        .unwrap();

        assert_eq!(
            value,
            serde_json::json!({
                "kind": "folder",
                "rootId": "9ceef0c0-9ef9-44c0-92c7-88500cdf67de",
                "rootName": "travail",
                "relativePath": "images/photo.png"
            })
        );
        assert!(value.get("rootPath").is_none());
    }
}
