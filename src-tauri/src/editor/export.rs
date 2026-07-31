use super::document::{
    CommandResult, EditorDocument, EditorSource, EditorWriteRequest, EditorWriteResult,
    MAX_DRAFT_BYTES, modified_stamp, normalize_output_format, safe_file_stem, validate_document,
};
use super::odt::{render_html_document, render_markdown, render_plain_text, write_odt};
use super::storage::{ensure_source_unchanged, replace_file_safely, save_draft_inner};
use crate::converters;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const OFFICE_INTERMEDIATE_STEM: &str = "editor-document";

pub(super) async fn write_document_with_picker(
    app: AppHandle,
    request: EditorWriteRequest,
    title: &str,
    associate_source: bool,
) -> CommandResult<Option<EditorWriteResult>> {
    if let Some(destination) = request
        .destination_path
        .clone()
        .filter(|value| !value.trim().is_empty())
    {
        return write_document(app, request, PathBuf::from(destination), associate_source)
            .await
            .map(Some);
    }
    let target = normalize_output_format(&request.target_format)?;
    let suggested = format!("{}.{}", safe_file_stem(&request.document.title), target);
    let Some(handle) = rfd::AsyncFileDialog::new()
        .set_title(title)
        .set_file_name(&suggested)
        .add_filter(target.to_ascii_uppercase(), &[target.as_str()])
        .save_file()
        .await
    else {
        return Ok(None);
    };
    write_document(app, request, handle.path().to_path_buf(), associate_source)
        .await
        .map(Some)
}

pub(super) async fn write_document(
    app: AppHandle,
    request: EditorWriteRequest,
    destination: PathBuf,
    associate_source: bool,
) -> CommandResult<EditorWriteResult> {
    validate_document(&request.document, true)?;
    let encoded = serde_json::to_vec(&request.document).map_err(|error| error.to_string())?;
    if encoded.len() > MAX_DRAFT_BYTES {
        return Err(
            "EDITOR_DRAFT_LIMIT:Le document est trop volumineux pour être exporté.".to_string(),
        );
    }
    let target = normalize_output_format(&request.target_format)?;
    let document = request.document;
    let generated = tauri::async_runtime::spawn_blocking(move || {
        generate_editor_output(&app, &document, &target).map(|output| (document, target, output))
    })
    .await
    .map_err(|error| error.to_string())??;

    let (mut document, target, output) = generated;
    // Conflict detection is repeated after the potentially slow office conversion,
    // immediately before the atomic replacement.
    ensure_source_unchanged(&document, &destination)?;
    if document
        .source
        .as_ref()
        .is_some_and(|source| Path::new(&source.path) == destination)
        && document
            .warnings
            .iter()
            .any(|warning| warning.blocks_overwrite)
    {
        return Err("EDITOR_OVERWRITE_BLOCKED:Ce document contient des éléments qui imposent Enregistrer sous.".to_string());
    }
    replace_file_safely(&output, &destination)?;

    if associate_source {
        let metadata = fs::metadata(&destination).map_err(|error| error.to_string())?;
        document.title = destination
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(&document.title)
            .to_string();
        document.source = Some(EditorSource {
            path: destination.to_string_lossy().to_string(),
            format: target,
            size: metadata.len(),
            modified_at: modified_stamp(&metadata),
        });
    }
    let document = save_draft_inner(document)?;
    Ok(EditorWriteResult {
        path: destination.to_string_lossy().to_string(),
        document,
    })
}

fn generate_editor_output(
    app: &AppHandle,
    document: &EditorDocument,
    target: &str,
) -> CommandResult<PathBuf> {
    let temp = tempfile::Builder::new()
        .prefix("multi-converter-editor-export-")
        .tempdir()
        .map_err(|error| error.to_string())?;
    let stem = safe_file_stem(&document.title);
    match target {
        "odt" => {
            let output = temp.path().join(format!("{stem}.odt"));
            write_odt(document, &output)?;
            let persisted = temp.keep();
            Ok(persisted.join(format!("{stem}.odt")))
        }
        "docx" | "rtf" | "pdf" => {
            // Some portable LibreOffice builds mishandle non-ASCII temporary
            // input names even though the ODT payload is valid. Keep the
            // internal bridge deterministic and ASCII-only; the user-facing
            // destination keeps the document title chosen in the picker.
            let generated_dir = temp.path().join("generated");
            fs::create_dir_all(&generated_dir).map_err(|error| error.to_string())?;
            let generated = generated_dir.join(format!("{OFFICE_INTERMEDIATE_STEM}.odt"));
            write_odt(document, &generated)?;
            let normalized = temp.path().join(format!("{OFFICE_INTERMEDIATE_STEM}.odt"));
            converters::convert_office_document_strict(
                app,
                &format!("editor-office-normalize-{}", uuid::Uuid::new_v4()),
                &generated,
                &normalized,
                "odt",
            )
            .map_err(|error| format!("EDITOR_OFFICE_EXPORT_FAILED:{error}"))?;
            let output = temp
                .path()
                .join(format!("{OFFICE_INTERMEDIATE_STEM}.{target}"));
            converters::convert_office_document_strict(
                app,
                &format!("editor-office-export-{}", uuid::Uuid::new_v4()),
                &normalized,
                &output,
                target,
            )
            .map_err(|error| format!("EDITOR_OFFICE_EXPORT_FAILED:{error}"))?;
            let persisted = temp.keep();
            Ok(persisted.join(format!("{OFFICE_INTERMEDIATE_STEM}.{target}")))
        }
        "html" => {
            let output = temp.path().join(format!("{stem}.html"));
            fs::write(&output, render_html_document(document)?)
                .map_err(|error| error.to_string())?;
            let persisted = temp.keep();
            Ok(persisted.join(format!("{stem}.html")))
        }
        "txt" => {
            let output = temp.path().join(format!("{stem}.txt"));
            fs::write(&output, render_text_document(document, false))
                .map_err(|error| error.to_string())?;
            let persisted = temp.keep();
            Ok(persisted.join(format!("{stem}.txt")))
        }
        "md" => {
            let output = temp.path().join(format!("{stem}.md"));
            fs::write(&output, render_text_document(document, true))
                .map_err(|error| error.to_string())?;
            let persisted = temp.keep();
            Ok(persisted.join(format!("{stem}.md")))
        }
        _ => Err(format!(
            "EDITOR_FORMAT_UNSUPPORTED:Le format {target} n'est pas exportable."
        )),
    }
}

fn render_text_document(document: &EditorDocument, markdown: bool) -> String {
    let render = |value: &serde_json::Value| {
        if markdown {
            render_markdown(value)
        } else {
            render_plain_text(value)
        }
    };
    let mut sections = Vec::new();
    if let Some(header) = &document.header {
        let value = render(header);
        if !value.trim().is_empty() {
            sections.push(value);
        }
    }
    sections.push(render(&document.content));
    if let Some(footer) = &document.footer {
        let value = render(footer);
        if !value.trim().is_empty() {
            sections.push(value);
        }
    }
    sections.join("\n\n---\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::editor::document::new_document;

    #[test]
    fn direct_text_export_comes_from_tiptap_json() {
        let mut document = new_document("Texte");
        document.content = serde_json::json!({
            "type": "doc",
            "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Éditeur local" }] }]
        });
        assert_eq!(render_plain_text(&document.content), "Éditeur local");
    }

    #[test]
    fn office_bridge_uses_a_portable_ascii_intermediate_name() {
        assert!(OFFICE_INTERMEDIATE_STEM.is_ascii());
        assert_eq!(OFFICE_INTERMEDIATE_STEM, "editor-document");
    }
}
