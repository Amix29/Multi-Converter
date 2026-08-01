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
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionResult {
    pub output_path: String,
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
        })
        .unwrap();
        let progress = serde_json::to_value(ProgressPayload {
            job_id: "job-1".to_string(),
            progress: 42,
            phase: "Conversion".to_string(),
        })
        .unwrap();

        assert_eq!(result, serde_json::json!({ "outputPath": "sortie.pdf" }));
        assert_eq!(
            progress,
            serde_json::json!({ "jobId": "job-1", "progress": 42, "phase": "Conversion" })
        );
    }
}
