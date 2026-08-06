use crate::editor_contracts::{PdfBoundsV1, PdfEditPatchV1};
use pdfium_render::prelude::*;

use super::{ensure_bounds_on_page, parse_color, parse_index};

pub(super) fn set_contents(page: &mut PdfPage<'_>, patch: &PdfEditPatchV1) -> Result<(), String> {
    let mut annotation = page
        .annotations()
        .get(parse_index(patch, 'a')?)
        .map_err(|error| format!("PDF_EDITOR_PATCH_ANNOTATION:{error}"))?;
    ensure_classic(annotation.annotation_type())?;
    annotation
        .set_contents(patch.text.as_deref().unwrap())
        .map_err(|error| format!("PDF_EDITOR_PATCH_ANNOTATION:{error}"))
}

pub(super) fn create(page: &mut PdfPage<'_>, patch: &PdfEditPatchV1) -> Result<(), String> {
    let bounds = patch.bounds.as_ref().unwrap();
    ensure_bounds_on_page(page, bounds)?;
    let rect = rect(bounds);
    let text = patch.text.as_deref().unwrap_or("");
    match patch.annotation_type.as_deref().unwrap() {
        "text" => {
            let mut annotation = page
                .annotations_mut()
                .create_text_annotation(text)
                .map_err(annotation_error)?;
            configure(&mut annotation, rect, patch)
        }
        "freeText" => {
            let mut annotation = page
                .annotations_mut()
                .create_free_text_annotation(text)
                .map_err(annotation_error)?;
            configure(&mut annotation, rect, patch)
        }
        "square" => {
            let mut annotation = page
                .annotations_mut()
                .create_square_annotation()
                .map_err(annotation_error)?;
            annotation.set_contents(text).map_err(annotation_error)?;
            configure(&mut annotation, rect, patch)
        }
        _ => Err("PDF_EDITOR_ANNOTATION_TYPE:Type d’annotation classique inconnu.".into()),
    }
}

pub(super) fn delete(page: &mut PdfPage<'_>, patch: &PdfEditPatchV1) -> Result<(), String> {
    let annotation = page
        .annotations()
        .get(parse_index(patch, 'a')?)
        .map_err(annotation_error)?;
    ensure_classic(annotation.annotation_type())?;
    page.annotations_mut()
        .delete_annotation(annotation)
        .map_err(annotation_error)
}

fn configure(
    annotation: &mut impl PdfPageAnnotationCommon,
    bounds: PdfRect,
    patch: &PdfEditPatchV1,
) -> Result<(), String> {
    annotation.set_bounds(bounds).map_err(annotation_error)?;
    if let Some(color) = patch.color.as_deref().and_then(parse_color) {
        annotation
            .set_stroke_color(color)
            .map_err(annotation_error)?;
    }
    Ok(())
}

fn ensure_classic(annotation_type: PdfPageAnnotationType) -> Result<(), String> {
    if matches!(
        annotation_type,
        PdfPageAnnotationType::Circle
            | PdfPageAnnotationType::FreeText
            | PdfPageAnnotationType::Highlight
            | PdfPageAnnotationType::Ink
            | PdfPageAnnotationType::Popup
            | PdfPageAnnotationType::Square
            | PdfPageAnnotationType::Squiggly
            | PdfPageAnnotationType::Stamp
            | PdfPageAnnotationType::Strikeout
            | PdfPageAnnotationType::Text
            | PdfPageAnnotationType::Underline
    ) {
        Ok(())
    } else {
        Err("PDF_EDITOR_ACTIVE_CONTENT_PRESERVED:Ce type d’annotation ou formulaire est préservé et n’est pas modifiable par cette opération.".into())
    }
}

fn rect(bounds: &PdfBoundsV1) -> PdfRect {
    PdfRect::new_from_values(
        bounds.y,
        bounds.x,
        bounds.y + bounds.height,
        bounds.x + bounds.width,
    )
}

fn annotation_error(error: impl std::fmt::Display) -> String {
    format!("PDF_EDITOR_PATCH_ANNOTATION:{error}")
}
