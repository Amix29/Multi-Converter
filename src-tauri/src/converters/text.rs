use super::*;

mod archive;
mod pdf;
mod read;
mod serialize;
mod tabular;
pub(in crate::converters) use archive::{TEXT_ARCHIVE_LIMITS, open_validated_text_archive};

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
) -> Result<Vec<ConversionWarning>> {
    if source_format == "pdf" {
        emit_progress(app, job_id, 22, "Extraction du texte PDF");
        let state = app.state::<crate::ocr::OcrState>().inner().clone();
        let result = state
            .recognize_pdf(app, input_path, job_id)
            .map_err(ConvertError::Message)?;
        emit_progress(app, job_id, 88, "Finalisation OCR PDF");
        let mut warnings: Vec<ConversionWarning> = result
            .warnings
            .iter()
            .map(|warning| ConversionWarning {
                code: warning.code.clone(),
                message: warning.message.clone(),
                page_number: warning.page_number,
            })
            .collect();
        warnings.extend(text_fidelity_warnings(source_format, target_format));
        if target_format == "html" {
            fs::write(output_path, crate::ocr::pdf::semantic_html(&result))?;
            return Ok(warnings);
        }
        let content = if result.text.is_empty() && matches!(target_format, "txt" | "md") {
            "\u{feff}"
        } else {
            &result.text
        };
        write_text_content_file(output_path, source_format, target_format, content)?;
        return Ok(warnings);
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
    )?;
    Ok(text_fidelity_warnings(source_format, target_format))
}

fn text_fidelity_warnings(source: &str, target: &str) -> Vec<ConversionWarning> {
    let rich_source = matches!(source, "pdf" | "docx" | "odt" | "rtf" | "html" | "epub");
    let plain_layout = rich_source && target != "txt";
    let one_column = target == "csv" && !matches!(source, "csv" | "json");
    if !plain_layout && !one_column {
        return vec![];
    }
    vec![ConversionWarning {
        code: if one_column { "single-column-table" } else { "text-layout" }.to_string(),
        message: if one_column {
            "Le texte est exporté dans une seule colonne. Les tableaux ne sont pas reconstitués."
        } else {
            "La sortie conserve le texte et une structure simplifiée. La mise en page, les tableaux et les images du document ne sont pas reproduits fidèlement."
        }.to_string(),
        page_number: None,
    }]
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
        "csv" => write_utf8_csv(output_path, &to_csv(content, source_format)?)?,
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
) -> Result<Vec<ConversionWarning>>
where
    F: FnOnce(&AppHandle, &str, &Path, &Path) -> Result<()>,
{
    match convert_external(
        context.app,
        context.job_id,
        context.input_path,
        context.output_path,
    ) {
        Ok(()) => Ok(vec![]),
        Err(_error)
            if can_fallback_to_integrated_text(context.source_format, context.target_format) =>
        {
            runtime_log::write(
                "conversion",
                &format!(
                    "{} failed; target={}; falling back to integrated text extraction",
                    engine_label, context.target_format
                ),
            );
            let _ = fs::remove_file(context.output_path);
            emit_progress(context.app, context.job_id, 30, "Fallback texte intégré");
            let mut warnings = convert_text_document(
                context.app,
                context.job_id,
                context.input_path,
                context.output_path,
                context.source_format,
                context.target_format,
            )?;
            warnings.push(ConversionWarning {
                code: "integrated-text-fallback".to_string(),
                message: format!("{engine_label} n’a pas terminé la conversion. Le texte a été extrait par le moteur intégré ; la mise en page n’est pas conservée."),
                page_number: None,
            });
            Ok(warnings)
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
    ) && target_format == "txt"
}
