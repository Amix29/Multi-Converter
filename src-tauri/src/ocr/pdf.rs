use super::contracts::{
    OcrBoundingBoxV1, OcrDocumentResultV1, OcrPageResultV1, OcrProgressV1, OcrTextBlockV1,
    OcrWarningV1,
};
use super::pdf_image::crop_light_page_border;
use super::supervisor::{OcrState, emit};
use super::{normalize, runtime, validation};
use crate::converters::{self, ExternalCommandProgress};
use serde::Deserialize;
use std::fs;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use tauri::AppHandle;

const MAX_PDF_BYTES: u64 = 128 * 1024 * 1024;
const MAX_PDF_PAGES: usize = 2_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PdfTextInspection {
    schema_version: u8,
    page_count: usize,
    pages: Vec<PdfTextPage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PdfTextPage {
    page_number: usize,
    width_points: f32,
    height_points: f32,
    text: String,
    alphanumeric_characters: usize,
    invalid_character_ratio: f64,
    usable: bool,
}

pub(super) fn recognize_pdf(
    state: &OcrState,
    app: &AppHandle,
    source: &Path,
    job_id: &str,
    canceled: Arc<AtomicBool>,
) -> Result<OcrDocumentResultV1, String> {
    validate_pdf(source)?;
    emit(
        app,
        OcrProgressV1::document(job_id, 3, "inspecting", None, None),
    );
    let pdfium = converters::engine_path(app, "pdfium").map_err(|error| error.to_string())?;
    let temporary = tempfile::Builder::new()
        .prefix("multi-converter-ocr-pdf-")
        .tempdir()
        .map_err(|error| error.to_string())?;
    let inspection_path = temporary.path().join("inspection.json");
    converters::run_external_command_with_progress(
        converters::engine_command(&pdfium)
            .arg("--inspect-text")
            .arg(source)
            .arg(&inspection_path),
        "PDFium",
        Duration::from_secs(180),
        ExternalCommandProgress {
            app,
            job_id,
            phase: "Inspection PDFium",
            start: 4,
            max: 12,
        },
    )
    .map_err(|error| classify_pdfium_error(&error.to_string()))?;
    let inspection = read_inspection(&inspection_path)?;
    let selected = inspection
        .pages
        .iter()
        .any(|page| !page.usable)
        .then(|| runtime::selected_runtime(app))
        .transpose()?;
    let mut pages = Vec::with_capacity(inspection.page_count);
    let mut warnings = Vec::new();

    for inspected in inspection.pages {
        let page_number = u32::try_from(inspected.page_number)
            .map_err(|_| "OCR_PDF_PAGES:Numéro de page invalide.".to_string())?;
        let progress = 12 + ((inspected.page_number * 80) / inspection.page_count.max(1)) as u8;
        emit(
            app,
            OcrProgressV1::document(
                job_id,
                progress.min(92),
                if inspected.usable {
                    "native-text"
                } else {
                    "recognizing"
                },
                Some(page_number),
                Some(inspection.page_count as u32),
            ),
        );
        let page = if inspected.usable {
            native_page(inspected, page_number)
        } else {
            recognize_scanned_page(
                state,
                app,
                selected.as_ref().ok_or_else(|| {
                    "OCR_RUNTIME_MISSING:Le runtime OCR requis est absent.".to_string()
                })?,
                source,
                temporary.path(),
                inspected,
                page_number,
                job_id,
                canceled.clone(),
            )?
        };
        warnings.extend(page.warnings.iter().cloned());
        pages.push(page);
    }

    let mut result = OcrDocumentResultV1 {
        schema_version: 1,
        job_id: job_id.to_string(),
        text: String::new(),
        pages,
        warnings,
    };
    normalize::normalize_result(&mut result)?;
    emit(
        app,
        OcrProgressV1::document(
            job_id,
            100,
            "completed",
            Some(inspection.page_count as u32),
            Some(inspection.page_count as u32),
        ),
    );
    Ok(result)
}

#[allow(clippy::too_many_arguments)]
fn recognize_scanned_page(
    state: &OcrState,
    app: &AppHandle,
    selected: &runtime::ResolvedRuntime,
    source: &Path,
    temporary: &Path,
    inspected: PdfTextPage,
    page_number: u32,
    job_id: &str,
    canceled: Arc<AtomicBool>,
) -> Result<OcrPageResultV1, String> {
    let rendered = temporary.join(format!("page-{page_number:04}.png"));
    converters::run_external_command_with_progress(
        converters::engine_command(
            &converters::engine_path(app, "pdfium").map_err(|error| error.to_string())?,
        )
        .arg("--render")
        .arg(source)
        .arg(&rendered)
        .arg("--page")
        .arg(page_number.to_string())
        .arg("--format")
        .arg("png")
        .arg("--dpi")
        .arg("300"),
        "PDFium",
        Duration::from_secs(180),
        ExternalCommandProgress {
            app,
            job_id,
            phase: "Rendu OCR PDF",
            start: 12,
            max: 90,
        },
    )
    .map_err(|error| classify_pdfium_error(&error.to_string()))?;
    let cropped = crop_light_page_border(
        &rendered,
        &temporary.join(format!("page-{page_number:04}-cropped.png")),
    )?;
    let prepared = validation::prepare_image(&cropped.to_string_lossy())?;
    let output = temporary.join(format!("page-{page_number:04}-ocr.json"));
    state.execute_worker(selected, &prepared.path, &output, job_id, canceled)?;
    let bytes = fs::read(&output).map_err(|error| format!("OCR_RESULT_MISSING:{error}"))?;
    let result: OcrDocumentResultV1 =
        serde_json::from_slice(&bytes).map_err(|error| format!("OCR_RESULT_INVALID:{error}"))?;
    let mut page = result
        .pages
        .into_iter()
        .next()
        .ok_or_else(|| "OCR_RESULT_INVALID:Le moteur n’a renvoyé aucune page.".to_string())?;
    page.page_number = page_number;
    page.width = prepared.width;
    page.height = prepared.height;
    if page.text.trim().is_empty() && inspected.alphanumeric_characters > 0 {
        page.text = normalize::normalize_text(&inspected.text);
        page.blocks = native_blocks(&page.text, prepared.width, prepared.height);
        page.source = "native-fallback".to_string();
        page.warnings.push(OcrWarningV1 {
            code: "ocr-empty-native-fallback".to_string(),
            message: "L’OCR de cette page est vide ; le fragment de texte natif a été conservé."
                .to_string(),
            page_number: Some(page_number),
        });
    }
    Ok(page)
}

fn native_page(inspected: PdfTextPage, page_number: u32) -> OcrPageResultV1 {
    let text = normalize::normalize_text(&inspected.text);
    let width = inspected.width_points.max(0.0).round() as u32;
    let height = inspected.height_points.max(0.0).round() as u32;
    OcrPageResultV1 {
        page_number,
        source: "native".to_string(),
        width,
        height,
        blocks: native_blocks(&text, width, height),
        text,
        warnings: Vec::new(),
    }
}

fn native_blocks(text: &str, width: u32, height: u32) -> Vec<OcrTextBlockV1> {
    if text.is_empty() {
        return Vec::new();
    }
    vec![OcrTextBlockV1 {
        text: text.to_string(),
        confidence: 1.0,
        bounding_box: OcrBoundingBoxV1 {
            x: 0.0,
            y: 0.0,
            width: f64::from(width),
            height: f64::from(height),
        },
    }]
}

fn validate_pdf(source: &Path) -> Result<(), String> {
    if !source.is_absolute() || !source.is_file() {
        return Err("OCR_SOURCE_INVALID:Le PDF est introuvable.".to_string());
    }
    let metadata = fs::metadata(source).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_PDF_BYTES {
        return Err("OCR_SOURCE_LIMIT:Le PDF dépasse 128 Mio.".to_string());
    }
    let mut header = [0u8; 5];
    File::open(source)
        .and_then(|mut file| file.read_exact(&mut header))
        .map_err(|error| format!("OCR_PDF_CORRUPT:{error}"))?;
    if &header != b"%PDF-" {
        return Err("OCR_PDF_TYPE:Le type réel du fichier n’est pas PDF.".to_string());
    }
    Ok(())
}

fn read_inspection(path: &Path) -> Result<PdfTextInspection, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("OCR_PDF_INSPECT:{error}"))?;
    if metadata.len() > 64 * 1024 * 1024 {
        return Err("OCR_TEXT_LIMIT:L’inspection PDF dépasse 64 Mio.".to_string());
    }
    let inspection: PdfTextInspection = serde_json::from_slice(
        &fs::read(path).map_err(|error| format!("OCR_PDF_INSPECT:{error}"))?,
    )
    .map_err(|error| format!("OCR_PDF_INSPECT:{error}"))?;
    if inspection.schema_version != 1
        || inspection.page_count == 0
        || inspection.page_count > MAX_PDF_PAGES
        || inspection.pages.len() != inspection.page_count
    {
        return Err("OCR_PDF_PAGES:Nombre de pages PDF invalide.".to_string());
    }
    for page in &inspection.pages {
        if page.page_number == 0
            || page.page_number > inspection.page_count
            || page.invalid_character_ratio.is_nan()
            || page.usable
                != (page.alphanumeric_characters >= 12 && page.invalid_character_ratio < 0.02)
        {
            return Err("OCR_PDF_INSPECT:Inspection de page incohérente.".to_string());
        }
    }
    Ok(inspection)
}

fn classify_pdfium_error(error: &str) -> String {
    let lower = error.to_ascii_lowercase();
    if lower.contains("password") || lower.contains("mot de passe") {
        "OCR_PDF_PASSWORD:Les PDF protégés par mot de passe ne sont pas pris en charge.".to_string()
    } else {
        format!("OCR_PDF_CORRUPT:{error}")
    }
}

pub(crate) fn semantic_html(result: &OcrDocumentResultV1) -> String {
    let sections = result
        .pages
        .iter()
        .map(|page| {
            let escaped = html_escape::encode_text(&page.text).replace('\n', "<br>\n");
            format!(
                "<section data-page=\"{}\" aria-label=\"Page {}\"><p>{}</p></section>",
                page.page_number, page.page_number, escaped
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "<!doctype html>\n<html lang=\"fr\">\n<head><meta charset=\"utf-8\"><title>Document OCR</title></head>\n<body>\n{sections}\n</body>\n</html>\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspection_threshold_is_revalidated() {
        let page = PdfTextPage {
            page_number: 1,
            width_points: 595.0,
            height_points: 842.0,
            text: "douze lettres utiles".to_string(),
            alphanumeric_characters: 18,
            invalid_character_ratio: 0.0,
            usable: true,
        };
        assert_eq!(native_page(page, 1).source, "native");
    }
}
