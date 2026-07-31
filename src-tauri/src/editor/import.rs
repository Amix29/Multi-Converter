use super::document::{
    CommandResult, EditorCompatibilityWarning, EditorDocument, EditorImportResult, EditorSource,
    EditorTransientContent, MAX_IMPORT_BYTES, SUPPORTED_INPUTS, new_document,
    normalized_input_format, plain_text_to_document,
};
use super::odt::parse_odt;
use super::storage::commit_import;
use crate::converters::{self, ConversionJob};
use std::fs;
use std::path::Path;
use tauri::AppHandle;

pub(super) fn import_document_inner(
    app: &AppHandle,
    path: &Path,
) -> CommandResult<EditorImportResult> {
    if !path.is_file() {
        return Err("EDITOR_IMPORT_MISSING:Le document sélectionné est introuvable.".to_string());
    }
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_IMPORT_BYTES {
        return Err(
            "EDITOR_IMPORT_LIMIT:Ce document est trop volumineux pour l'éditeur.".to_string(),
        );
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension == "pdf" {
        return Err(
            "EDITOR_PDF_OCR_REQUIRED:L'ouverture des PDF sera disponible avec le moteur OCR."
                .to_string(),
        );
    }
    if !SUPPORTED_INPUTS.contains(&extension.as_str()) {
        return Err(format!(
            "EDITOR_FORMAT_UNSUPPORTED:Le format .{extension} n'est pas éditable."
        ));
    }

    let title = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Document")
        .to_string();
    let mut document = new_document(&title);
    document.source = Some(EditorSource {
        path: path.to_string_lossy().to_string(),
        format: normalized_input_format(&extension).to_string(),
        size: metadata.len(),
        modified_at: super::document::modified_stamp(&metadata),
    });

    let mut imported_assets = Vec::new();
    let transient_content = match extension.as_str() {
        "txt" => {
            let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
            document.content = plain_text_to_document(&text);
            None
        }
        "html" | "htm" => Some(EditorTransientContent {
            kind: "html".to_string(),
            value: fs::read_to_string(path).map_err(|error| error.to_string())?,
        }),
        "md" | "markdown" => {
            let temp = tempfile::Builder::new()
                .prefix("multi-converter-editor-markdown-")
                .tempdir()
                .map_err(|error| error.to_string())?;
            let result = converters::convert(
                app,
                ConversionJob {
                    id: format!("editor-markdown-{}", uuid::Uuid::new_v4()),
                    input_path: path.to_string_lossy().to_string(),
                    target_format: "html".to_string(),
                    output_dir: Some(temp.path().to_string_lossy().to_string()),
                    batch_concurrency: Some(1),
                },
            )
            .map_err(|error| error.to_string())?;
            Some(EditorTransientContent {
                kind: "html".to_string(),
                value: fs::read_to_string(result.output_path).map_err(|error| error.to_string())?,
            })
        }
        "odt" | "docx" | "rtf" => {
            let parsed = if extension == "odt" {
                parse_odt(path)?
            } else {
                let temp = tempfile::Builder::new()
                    .prefix("multi-converter-editor-office-")
                    .tempdir()
                    .map_err(|error| error.to_string())?;
                let output = temp.path().join("office-import.odt");
                converters::convert_office_document_strict(
                    app,
                    &format!("editor-office-import-{}", uuid::Uuid::new_v4()),
                    path,
                    &output,
                    "odt",
                )
                .map_err(|error| {
                    format!("EDITOR_OFFICE_IMPORT_FAILED:La conversion Office vers ODT a échoué: {error}")
                })?;
                parse_odt(&output)?
            };
            document.content = parsed.content;
            document.header = parsed.header;
            document.footer = parsed.footer;
            document.page = parsed.page;
            document.assets = parsed
                .assets
                .iter()
                .map(|(asset, _)| asset.clone())
                .collect();
            document.warnings.extend(parsed.warnings);
            imported_assets = parsed.assets;
            None
        }
        _ => unreachable!("supported input checked above"),
    };

    document
        .warnings
        .extend(detect_source_compatibility_warnings(path, &extension)?);
    deduplicate_warnings(&mut document);
    let document = commit_import(document, &imported_assets)?;
    Ok(EditorImportResult {
        document,
        transient_content,
    })
}

fn detect_source_compatibility_warnings(
    path: &Path,
    extension: &str,
) -> CommandResult<Vec<EditorCompatibilityWarning>> {
    let mut unsupported = false;
    if extension == "docx" {
        let file = fs::File::open(path).map_err(|error| error.to_string())?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|error| format!("EDITOR_OFFICE_IMPORT_FAILED:{error}"))?;
        if archive.len() > 10_000 {
            return Err(
                "EDITOR_IMPORT_LIMIT:Le document Office contient trop d’entrées.".to_string(),
            );
        }
        for index in 0..archive.len() {
            let entry = archive.by_index(index).map_err(|error| error.to_string())?;
            let name = entry.name().to_ascii_lowercase();
            if name.contains("/embeddings/")
                || name.contains("/charts/")
                || name.contains("3dmodel")
            {
                unsupported = true;
                break;
            }
        }
    } else if extension == "rtf" {
        let source = fs::read(path).map_err(|error| error.to_string())?;
        let source = &source[..source.len().min(4 * 1024 * 1024)];
        unsupported = source.windows(7).any(|value| value == b"\\object")
            || source.windows(8).any(|value| value == b"\\objdata");
    }
    Ok(if unsupported {
        vec![EditorCompatibilityWarning {
            code: "unsupportedEmbeddedObject".to_string(),
            message: "Ce document contient un graphique, un modèle 3D ou un objet incorporé que l’éditeur ne peut pas réexporter fidèlement. Enregistrer sous est obligatoire pour protéger l’original.".to_string(),
            blocks_overwrite: true,
        }]
    } else {
        Vec::new()
    })
}

fn deduplicate_warnings(document: &mut EditorDocument) {
    let mut codes = std::collections::HashSet::new();
    document
        .warnings
        .retain(|warning| codes.insert(warning.code.clone()));
}
