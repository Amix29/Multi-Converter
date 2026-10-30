use super::{CommandResult, ExportResult, MAX_EXPORT_FILES, copy_files_to_folder, source};
use crate::converters::{MediaMode, QualityProfile};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::Path};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BatchReportRow {
    source_name: String,
    target_format: String,
    status: ReportStatus,
    engine: Option<String>,
    quality_profile: Option<QualityProfile>,
    media_mode: Option<MediaMode>,
    input_bytes: u64,
    duration_ms: Option<u64>,
    warning_codes: Vec<String>,
    #[serde(skip_serializing)]
    output_path: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum ReportStatus {
    Done,
    Error,
    Canceled,
    NotRun,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportEntry {
    #[serde(flatten)]
    row: BatchReportRow,
    output_name: Option<String>,
    output_bytes: Option<u64>,
    output_sha256: Option<String>,
}

#[tauri::command]
pub(crate) async fn export_batch_report(
    output_dir: String,
    destination_dir: String,
    rows: Vec<BatchReportRow>,
) -> CommandResult<ExportResult> {
    tauri::async_runtime::spawn_blocking(move || {
        export_report(Path::new(&output_dir), Path::new(&destination_dir), rows)
    })
    .await
    .map_err(|_| "Préparation du bilan interrompue.".to_string())?
}

fn export_report(
    root: &Path,
    destination: &Path,
    rows: Vec<BatchReportRow>,
) -> CommandResult<ExportResult> {
    if destination.as_os_str().is_empty() {
        return Err("Dossier de destination vide.".to_string());
    }
    if rows.is_empty() || rows.len() > MAX_EXPORT_FILES {
        return Err("Le bilan doit contenir entre 1 et 2 000 fichiers.".to_string());
    }
    let metadata =
        fs::symlink_metadata(root).map_err(|_| "Lot temporaire indisponible.".to_string())?;
    if !super::super::is_managed_temp_output_folder(root)
        || !metadata.is_dir()
        || super::paths::is_link_or_reparse_point(&metadata)
    {
        return Err("Lot temporaire invalide.".to_string());
    }
    let entries = rows
        .into_iter()
        .map(|row| report_entry(root, row))
        .collect::<CommandResult<Vec<_>>>()?;
    let report = serde_json::json!({
        "schemaVersion": 1,
        "qualityProfileSchemaVersion": 1,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "createdAtUnixSeconds": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "Horloge système invalide.".to_string())?.as_secs(),
        "files": entries,
    });
    let temporary = crate::private_temp::builder(".batch-report-")
        .tempdir_in(root)
        .map_err(|_| "Bilan temporaire indisponible.".to_string())?;
    let file = temporary.path().join("conversion-report.json");
    let bytes = serde_json::to_vec_pretty(&report).map_err(|_| "Bilan invalide.".to_string())?;
    fs::write(&file, bytes).map_err(|_| "Écriture du bilan impossible.".to_string())?;
    copy_files_to_folder(
        &[file.to_string_lossy().into_owned()],
        destination,
        Some(&root.to_string_lossy()),
        None,
    )
}

fn report_entry(root: &Path, mut row: BatchReportRow) -> CommandResult<ReportEntry> {
    if !basename(&row.source_name)
        || !code(&row.target_format)
        || row.engine.as_deref().is_some_and(|engine| !code(engine))
        || row.warning_codes.len() > 32
        || row.warning_codes.iter().any(|warning| !code(warning))
    {
        return Err("Métadonnées du bilan invalides.".to_string());
    }
    row.warning_codes.sort();
    row.warning_codes.dedup();
    if row.media_mode == Some(MediaMode::Copy) {
        row.quality_profile = None;
    }
    let output = match (&row.status, row.output_path.as_deref()) {
        (ReportStatus::Done, Some(path)) => {
            let path =
                source::ensure_exportable_conversion_file_in_root(Path::new(path), Some(root))?;
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .filter(|name| basename(name))
                .ok_or_else(|| "Nom de sortie invalide.".to_string())?
                .to_string();
            let (bytes, hash) = fingerprint(&path)?;
            Some((name, bytes, hash))
        }
        (ReportStatus::Done, None) => return Err("Sortie du bilan manquante.".to_string()),
        (_, Some(_)) => return Err("Sortie inattendue dans le bilan.".to_string()),
        (_, None) => None,
    };
    Ok(ReportEntry {
        row,
        output_name: output.as_ref().map(|(name, _, _)| name.clone()),
        output_bytes: output.as_ref().map(|(_, bytes, _)| *bytes),
        output_sha256: output.map(|(_, _, hash)| hash),
    })
}

fn fingerprint(path: &Path) -> CommandResult<(u64, String)> {
    let mut input =
        fs::File::open(path).map_err(|_| "Lecture de la sortie impossible.".to_string())?;
    let mut hasher = Sha256::new();
    let mut count = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let bytes = input
            .read(&mut buffer)
            .map_err(|_| "Lecture de la sortie interrompue.".to_string())?;
        if bytes == 0 {
            break;
        }
        hasher.update(&buffer[..bytes]);
        count += bytes as u64;
    }
    Ok((count, format!("{:x}", hasher.finalize())))
}

fn basename(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 1024
        && !matches!(value, "." | "..")
        && !value.contains(['/', '\\'])
        && !value.chars().any(char::is_control)
}

fn code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn row(path: &Path) -> BatchReportRow {
        BatchReportRow {
            source_name: "source.txt".into(),
            target_format: "txt".into(),
            status: ReportStatus::Done,
            engine: Some("rust-text".into()),
            quality_profile: Some(QualityProfile::Balanced),
            media_mode: Some(MediaMode::Convert),
            input_bytes: 3,
            duration_ms: Some(1),
            warning_codes: vec![],
            output_path: Some(path.to_string_lossy().into_owned()),
        }
    }
    #[test]
    fn report_hashes_real_outputs_without_paths_or_content_and_never_overwrites() {
        let root = crate::private_temp::builder("multi-converter-report-test-")
            .tempdir()
            .unwrap();
        let destination = tempfile::tempdir().unwrap();
        let output = root.path().join("output.txt");
        fs::write(&output, b"abc").unwrap();
        let first = export_report(root.path(), destination.path(), vec![row(&output)]).unwrap();
        let second = export_report(root.path(), destination.path(), vec![row(&output)]).unwrap();
        assert_ne!(first.files, second.files);
        let text = fs::read_to_string(&first.files[0]).unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            json["files"][0]["outputSha256"],
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(json["files"][0]["outputBytes"], 3);
        assert!(json["files"][0].get("outputPath").is_none());
        assert!(!text.contains(&root.path().to_string_lossy().to_string()));
        assert_eq!(fs::read(&output).unwrap(), b"abc");
    }
    #[test]
    fn report_refuses_outputs_from_another_batch_and_paths_as_source_names() {
        let root = crate::private_temp::builder("multi-converter-report-test-")
            .tempdir()
            .unwrap();
        let foreign = crate::private_temp::builder("multi-converter-other-test-")
            .tempdir()
            .unwrap();
        let output = foreign.path().join("output.txt");
        fs::write(&output, b"abc").unwrap();
        assert!(report_entry(root.path(), row(&output)).is_err());
        let mut invalid = row(&output);
        invalid.source_name = "C:\\private\\source.txt".into();
        assert!(report_entry(root.path(), invalid).is_err());
    }
    #[test]
    fn failed_batches_can_be_reported_without_outputs_or_raw_errors() {
        let root = crate::private_temp::builder("multi-converter-report-test-")
            .tempdir()
            .unwrap();
        let destination = tempfile::tempdir().unwrap();
        let mut failed = row(Path::new("unused"));
        failed.status = ReportStatus::Error;
        failed.output_path = None;
        let result = export_report(root.path(), destination.path(), vec![failed]).unwrap();
        let json: serde_json::Value =
            serde_json::from_slice(&fs::read(&result.files[0]).unwrap()).unwrap();
        assert_eq!(json["files"][0]["status"], "error");
        assert!(json["files"][0]["outputSha256"].is_null());
        assert!(json["files"][0].get("error").is_none());
    }
}
