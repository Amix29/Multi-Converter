use super::*;

mod archive;
mod pdf;
mod read;
mod serialize;

#[cfg(test)]
pub(in crate::converters) use archive::validate_text_archive_limits_for_test;

pub(in crate::converters) use pdf::*;
pub(in crate::converters) use read::*;
pub(in crate::converters) use serialize::*;

pub(in crate::converters) fn convert_text_document(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    source_format: &str,
    target_format: &str,
) -> Result<()> {
    if source_format == "pdf" {
        emit_progress(app, job_id, 22, "Extraction du texte PDF");
        let state = app.state::<crate::ocr::OcrState>().inner().clone();
        let result = state
            .recognize_pdf(app, input_path, job_id)
            .map_err(ConvertError::Message)?;
        emit_progress(app, job_id, 88, "Finalisation OCR PDF");
        if target_format == "html" {
            fs::write(output_path, crate::ocr::pdf::semantic_html(&result))?;
            return Ok(());
        }
        let content = if result.text.is_empty() && matches!(target_format, "txt" | "md") {
            "\u{feff}"
        } else {
            &result.text
        };
        return write_text_content_file(output_path, source_format, target_format, content);
    }
    let content = read_document_text(input_path, source_format)?;
    assert_readable_document_content(input_path, source_format, &content)?;
    write_text_content(
        app,
        job_id,
        input_path,
        output_path,
        source_format,
        target_format,
        &content,
    )
}

pub(in crate::converters) fn write_text_content(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    source_format: &str,
    target_format: &str,
    content: &str,
) -> Result<()> {
    if target_format == "pdf" {
        return convert_text_to_pdf_content(app, job_id, input_path, output_path, content);
    }
    emit_progress(app, job_id, 45, "Conversion texte");
    write_text_content_file(output_path, source_format, target_format, content)?;
    emit_progress(app, job_id, 88, "Finalisation");
    Ok(())
}

pub(in crate::converters) fn write_text_content_file(
    output_path: &Path,
    source_format: &str,
    target_format: &str,
    content: &str,
) -> Result<()> {
    match target_format {
        "txt" => fs::write(output_path, to_plain_text(content, source_format))?,
        "md" => fs::write(output_path, to_markdown(content, source_format))?,
        "html" => fs::write(output_path, to_html(content, source_format))?,
        "rtf" => fs::write(output_path, to_rtf(content, source_format))?,
        "csv" => write_utf8_csv(output_path, &to_csv(content, source_format))?,
        "json" => fs::write(output_path, to_json(content, source_format)?)?,
        "xml" => fs::write(output_path, to_xml(content, source_format))?,
        "docx" => write_docx(output_path, content, source_format)?,
        "odt" => write_odt(output_path, content, source_format)?,
        "epub" => write_epub(output_path, content, source_format)?,
        _ => {
            return Err(ConvertError::Message(format!(
                "Conversion texte vers {} non supportée.",
                target_format.to_uppercase()
            )));
        }
    }
    Ok(())
}

pub(in crate::converters) struct ExternalDocumentFallbackContext<'a> {
    pub(in crate::converters) app: &'a AppHandle,
    pub(in crate::converters) job_id: &'a str,
    pub(in crate::converters) input_path: &'a Path,
    pub(in crate::converters) output_path: &'a Path,
    pub(in crate::converters) source_format: &'a str,
    pub(in crate::converters) target_format: &'a str,
}

pub(in crate::converters) fn convert_external_document_with_text_fallback<F>(
    context: ExternalDocumentFallbackContext<'_>,
    engine_label: &str,
    convert_external: F,
) -> Result<()>
where
    F: FnOnce(&AppHandle, &str, &Path, &Path) -> Result<()>,
{
    match convert_external(
        context.app,
        context.job_id,
        context.input_path,
        context.output_path,
    ) {
        Ok(()) => Ok(()),
        Err(error)
            if can_fallback_to_integrated_text(context.source_format, context.target_format) =>
        {
            runtime_log::write(
                "conversion",
                &format!(
                    "{} failed for {} -> {}; falling back to integrated text extraction: {}",
                    engine_label,
                    runtime_log::path(context.input_path),
                    context.target_format,
                    error
                ),
            );
            let _ = fs::remove_file(context.output_path);
            emit_progress(context.app, context.job_id, 30, "Fallback texte intégré");
            convert_text_document(
                context.app,
                context.job_id,
                context.input_path,
                context.output_path,
                context.source_format,
                context.target_format,
            )
        }
        Err(error) => Err(error),
    }
}

pub(in crate::converters) fn can_fallback_to_integrated_text(
    source_format: &str,
    target_format: &str,
) -> bool {
    matches!(
        source_format,
        "pdf" | "txt" | "md" | "html" | "csv" | "json" | "xml" | "rtf" | "docx" | "odt" | "epub"
    ) && matches!(
        target_format,
        "txt" | "md" | "html" | "csv" | "json" | "xml" | "rtf" | "docx" | "odt" | "epub" | "pdf"
    )
}
