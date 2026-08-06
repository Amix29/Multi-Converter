mod annotations;
mod forms;
mod identity;
mod media;
mod ocr;
mod pages;
mod text;

use crate::editor_contracts::{PdfBoundsV1, PdfEditPatchV1, PdfPermissionV1};
use pdfium_render::prelude::*;
use std::collections::HashMap;

const MAX_TEXT_BYTES: usize = 1024 * 1024;
const MAX_OCR_BLOCKS: usize = 10_000;
const MAX_OCR_TEXT_BYTES: usize = 8 * 1024 * 1024;

pub(super) fn validate_patches(patches: &[PdfEditPatchV1]) -> Result<(), String> {
    for patch in patches {
        super::io::validate_schema(patch.schema_version)?;
        if patch.page_number == 0 {
            return Err("PDF_EDITOR_PATCH_PAGE:Numéro de page invalide.".into());
        }
        validate_common_values(patch)?;
        match patch.operation.as_str() {
            "setText" if patch.text.is_some() => validate_object_id(patch)?,
            "transformObject" if patch.matrix.is_some() => validate_object_id(patch)?,
            "setFillColor" | "setStrokeColor"
                if patch.color.as_deref().and_then(parse_color).is_some() =>
            {
                validate_object_id(patch)?
            }
            "setAnnotationContents" | "setFormValue" if patch.text.is_some() => {
                validate_annotation_id(patch)?
            }
            "deleteObject" => validate_object_id(patch)?,
            "replaceImage" if patch.image_path.is_some() => validate_object_id(patch)?,
            "moveObjectForward" | "moveObjectBackward" | "bringObjectFront"
            | "sendObjectBack" => validate_object_id(patch)?,
            "insertImage" if patch.image_path.is_some() && patch.bounds.is_some() => {}
            "createAnnotation"
                if patch.bounds.is_some()
                    && matches!(
                        patch.annotation_type.as_deref(),
                        Some("text" | "freeText" | "square")
                    ) => {}
            "deleteAnnotation" => validate_annotation_id(patch)?,
            "insertPage" if patch.width_points.is_some() && patch.height_points.is_some() => {}
            "duplicatePage" | "movePage" if patch.target_page_number.is_some() => {}
            "addOcrTextLayer" if patch.ocr_blocks.as_ref().is_some_and(|v| !v.is_empty()) => {}
            "rotatePage" if matches!(patch.rotation_degrees, Some(0 | 90 | 180 | 270)) => {}
            "deletePage" => {}
            "addSignature" => return Err("PDF_EDITOR_SIGNATURE_CREATION_UNSUPPORTED:Multi-Converter ne crée pas de signature cryptographique PDF.".into()),
            _ => return Err(format!(
                "PDF_EDITOR_PATCH_UNSUPPORTED:Opération incomplète ou non prise en charge : {}",
                patch.operation
            )),
        }
    }
    Ok(())
}

fn validate_common_values(patch: &PdfEditPatchV1) -> Result<(), String> {
    if patch
        .text
        .as_ref()
        .is_some_and(|text| text.len() > MAX_TEXT_BYTES)
    {
        return Err("PDF_EDITOR_PATCH_TEXT_LIMIT:Texte de patch trop volumineux.".into());
    }
    if patch.matrix.is_some_and(|values| {
        values
            .iter()
            .any(|value| !value.is_finite() || value.abs() > 1_000_000.0)
    }) {
        return Err("PDF_EDITOR_PATCH_MATRIX:Transformation non finie ou hors limites.".into());
    }
    if let Some(bounds) = patch.bounds.as_ref() {
        validate_bounds(bounds)?;
    }
    if let (Some(width), Some(height)) = (patch.width_points, patch.height_points) {
        validate_page_size(width, height)?;
    }
    if let Some(blocks) = patch.ocr_blocks.as_ref() {
        if blocks.len() > MAX_OCR_BLOCKS
            || blocks.iter().map(|block| block.text.len()).sum::<usize>() > MAX_OCR_TEXT_BYTES
        {
            return Err(
                "PDF_EDITOR_OCR_LIMIT:Le calque OCR dépasse les limites autorisées.".into(),
            );
        }
        for block in blocks {
            validate_bounds(&block.bounds)?;
            if block.text.is_empty() || block.text.len() > MAX_TEXT_BYTES {
                return Err("PDF_EDITOR_OCR_TEXT:Un bloc OCR est vide ou trop volumineux.".into());
            }
            if block
                .font_size_points
                .is_some_and(|value| !value.is_finite() || !(1.0..=400.0).contains(&value))
            {
                return Err("PDF_EDITOR_OCR_FONT_SIZE:Taille de texte OCR invalide.".into());
            }
        }
    }
    Ok(())
}

pub(super) fn enforce_permissions(
    permissions: &PdfPermissionV1,
    patches: &[PdfEditPatchV1],
) -> Result<(), String> {
    for patch in patches {
        let allowed = match patch.operation.as_str() {
            "setAnnotationContents" | "createAnnotation" | "deleteAnnotation" => {
                permissions.can_annotate
            }
            "setFormValue" => permissions.can_fill_forms,
            "rotatePage" | "deletePage" | "insertPage" | "duplicatePage" | "movePage" => {
                permissions.can_assemble
            }
            _ => permissions.can_modify,
        };
        if !allowed {
            return Err(format!(
                "PDF_EDITOR_PERMISSION_DENIED:{} est interdit par les permissions ou DocMDP.",
                patch.operation
            ));
        }
    }
    Ok(())
}

pub(super) struct PatchApplication {
    pub layer_moves: Vec<(usize, usize, usize)>,
    pub text_expectations: Vec<TextExpectation>,
}

pub(super) struct TextExpectation {
    pub page_number: usize,
    pub object_index: usize,
    pub text: String,
}

pub(super) fn apply_document_patches<'a>(
    pdfium: &'a Pdfium,
    document: &mut PdfDocument<'a>,
    patches: &[PdfEditPatchV1],
) -> Result<PatchApplication, String> {
    let mut identities = identity::PatchIdentityMap::new(document)?;
    let mut text_expectations = HashMap::<String, String>::new();
    for source_patch in patches {
        let resolved = identities.resolve(source_patch)?;
        let patch = &resolved.patch;
        if matches!(
            patch.operation.as_str(),
            "moveObjectForward" | "moveObjectBackward" | "bringObjectFront" | "sendObjectBack"
        ) {
            identities.record_success(&resolved)?;
            continue;
        }
        match patch.operation.as_str() {
            "setText" => {
                text::replace_text_object(document, patch)?;
                let alias = resolved.alias.clone().ok_or_else(|| {
                    "PDF_EDITOR_PATCH_IDENTITY:L’identité du texte est introuvable.".to_string()
                })?;
                let requested = patch.text.as_deref().unwrap_or_default();
                text_expectations.insert(
                    alias,
                    if requested.is_empty() {
                        " ".to_string()
                    } else {
                        requested.to_string()
                    },
                );
                identities.record_success(&resolved)?;
                continue;
            }
            "insertPage" | "duplicatePage" | "movePage" | "deletePage" => {
                pages::apply_page_patch(pdfium, document, patch)?;
                identities.record_success(&resolved)?;
                continue;
            }
            "insertImage" | "replaceImage" => {
                media::apply_image_patch(document, patch)?;
                identities.record_success(&resolved)?;
                continue;
            }
            "addOcrTextLayer" => {
                ocr::add_text_layer(document, patch)?;
                identities.record_success(&resolved)?;
                continue;
            }
            _ => {}
        }

        let mut page = get_page(document, patch.page_number)?;
        let mut removed_object = None;
        match patch.operation.as_str() {
            "rotatePage" => page.set_rotation(rotation(patch.rotation_degrees.unwrap())),
            "setAnnotationContents" => annotations::set_contents(&mut page, patch)?,
            "createAnnotation" => annotations::create(&mut page, patch)?,
            "deleteAnnotation" => annotations::delete(&mut page, patch)?,
            "setFormValue" => forms::set_value(&mut page, patch)?,
            "deleteObject" => {
                removed_object = Some(
                    page.objects_mut()
                        .remove_object_at_index(parse_index(patch, 'o')?)
                        .map_err(|error| format!("PDF_EDITOR_PATCH_DELETE:{error}"))?,
                );
            }
            _ => {
                let mut object = page
                    .objects()
                    .get(parse_index(patch, 'o')?)
                    .map_err(|error| format!("PDF_EDITOR_PATCH_OBJECT:{error}"))?;
                apply_object_patch(&mut object, patch)?;
            }
        }
        page.regenerate_content()
            .map_err(|error| format!("PDF_EDITOR_PATCH_COMMIT:{error}"))?;
        if let Some(removed) = removed_object {
            // The locked PDFium build crashes while destroying a detached source object.
            // This wrapper is a bounded one-shot process, so retain it until process exit.
            std::mem::forget(removed);
        }
        identities.record_success(&resolved)?;
    }
    if document.pages().is_empty() {
        return Err("PDF_EDITOR_EMPTY:Un PDF doit conserver au moins une page.".into());
    }
    let text_expectations = text_expectations
        .into_iter()
        .filter_map(|(alias, text)| {
            identities
                .final_text_location(&alias)
                .map(|(page_number, object_index)| TextExpectation {
                    page_number,
                    object_index,
                    text,
                })
        })
        .collect();
    Ok(PatchApplication {
        layer_moves: identities.layer_moves()?,
        text_expectations,
    })
}

pub(super) fn apply_layer_moves(
    document: &mut PdfDocument<'_>,
    moves: &[(usize, usize, usize)],
) -> Result<(), String> {
    for &(page_index, source, target) in moves {
        let mut page = get_page(document, page_index + 1)?;
        reorder_object_to(&mut page, source, target)?;
        page.regenerate_content()
            .map_err(|error| format!("PDF_EDITOR_PATCH_COMMIT:{error}"))?;
    }
    Ok(())
}

pub(super) fn get_page<'a>(
    document: &PdfDocument<'a>,
    page_number: usize,
) -> Result<PdfPage<'a>, String> {
    document
        .pages()
        .get((page_number - 1) as i32)
        .map_err(|error| format!("PDF_EDITOR_PATCH_PAGE:{page_number}:{error}"))
}

pub(super) fn parse_index(patch: &PdfEditPatchV1, kind: char) -> Result<usize, String> {
    let expected = format!("p{}-{kind}", patch.page_number);
    patch
        .object_id
        .as_deref()
        .and_then(|id| id.strip_prefix(&expected))
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| {
            "PDF_EDITOR_PATCH_OBJECT:L’identifiant d’objet ne correspond pas à la page.".into()
        })
}

pub(super) fn parse_color(value: &str) -> Option<PdfColor> {
    let value = value.strip_prefix('#')?;
    if value.len() != 6 && value.len() != 8 {
        return None;
    }
    let red = u8::from_str_radix(&value[0..2], 16).ok()?;
    let green = u8::from_str_radix(&value[2..4], 16).ok()?;
    let blue = u8::from_str_radix(&value[4..6], 16).ok()?;
    let alpha = if value.len() == 8 {
        u8::from_str_radix(&value[6..8], 16).ok()?
    } else {
        255
    };
    Some(PdfColor::new(red, green, blue, alpha))
}

pub(super) fn validate_bounds(bounds: &PdfBoundsV1) -> Result<(), String> {
    let values = [bounds.x, bounds.y, bounds.width, bounds.height];
    if values.iter().any(|value| !value.is_finite())
        || bounds.x.abs() > 1_000_000.0
        || bounds.y.abs() > 1_000_000.0
        || !(1.0..=1_000_000.0).contains(&bounds.width)
        || !(1.0..=1_000_000.0).contains(&bounds.height)
    {
        return Err("PDF_EDITOR_PATCH_BOUNDS:Rectangle non fini ou hors limites.".into());
    }
    Ok(())
}

pub(super) fn ensure_bounds_on_page(
    page: &PdfPage<'_>,
    bounds: &PdfBoundsV1,
) -> Result<(), String> {
    let epsilon = 0.01;
    if bounds.x < -epsilon
        || bounds.y < -epsilon
        || bounds.x + bounds.width > page.width().value + epsilon
        || bounds.y + bounds.height > page.height().value + epsilon
    {
        return Err("PDF_EDITOR_PATCH_BOUNDS:Le rectangle dépasse la page.".into());
    }
    Ok(())
}

fn validate_object_id(patch: &PdfEditPatchV1) -> Result<(), String> {
    patch
        .object_id
        .as_deref()
        .filter(|value| identity::valid_object_alias(value, 'o'))
        .map(|_| ())
        .ok_or_else(|| "PDF_EDITOR_PATCH_OBJECT:Identifiant d’objet invalide.".into())
}

fn validate_annotation_id(patch: &PdfEditPatchV1) -> Result<(), String> {
    patch
        .object_id
        .as_deref()
        .filter(|value| identity::valid_object_alias(value, 'a'))
        .map(|_| ())
        .ok_or_else(|| "PDF_EDITOR_PATCH_OBJECT:Identifiant d’annotation invalide.".into())
}

fn validate_page_size(width: f32, height: f32) -> Result<(), String> {
    if !width.is_finite()
        || !height.is_finite()
        || !(18.0..=14_400.0).contains(&width)
        || !(18.0..=14_400.0).contains(&height)
    {
        return Err("PDF_EDITOR_PAGE_SIZE:Dimensions de page hors limites.".into());
    }
    Ok(())
}

fn reorder_object_to(page: &mut PdfPage<'_>, index: usize, target: usize) -> Result<(), String> {
    if index >= page.objects().len() || target >= page.objects().len() {
        return Err("PDF_EDITOR_PATCH_OBJECT:Objet de calque introuvable.".into());
    }
    let selected = page
        .objects_mut()
        .remove_object_at_index(index)
        .map_err(|error| format!("PDF_EDITOR_PATCH_LAYER:{error}"))?;
    page.objects_mut()
        .insert_object_at_index(target, selected)
        .map_err(|error| format!("PDF_EDITOR_PATCH_LAYER:{error}"))?;
    Ok(())
}

fn apply_object_patch(
    object: &mut PdfPageObject<'_>,
    patch: &PdfEditPatchV1,
) -> Result<(), String> {
    match patch.operation.as_str() {
        "transformObject" => {
            let [a, b, c, d, e, f] = patch.matrix.unwrap();
            object
                .transform(a, b, c, d, e, f)
                .map_err(|error| format!("PDF_EDITOR_PATCH_TRANSFORM:{error}"))
        }
        "setFillColor" => object
            .set_fill_color(parse_color(patch.color.as_deref().unwrap()).unwrap())
            .map_err(|error| format!("PDF_EDITOR_PATCH_COLOR:{error}")),
        "setStrokeColor" => object
            .set_stroke_color(parse_color(patch.color.as_deref().unwrap()).unwrap())
            .map_err(|error| format!("PDF_EDITOR_PATCH_COLOR:{error}")),
        _ => Err("PDF_EDITOR_PATCH_UNSUPPORTED:Opération objet non prise en charge.".into()),
    }
}

fn rotation(degrees: u16) -> PdfPageRenderRotation {
    match degrees {
        90 => PdfPageRenderRotation::Degrees90,
        180 => PdfPageRenderRotation::Degrees180,
        270 => PdfPageRenderRotation::Degrees270,
        _ => PdfPageRenderRotation::None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch(operation: &str) -> PdfEditPatchV1 {
        PdfEditPatchV1 {
            schema_version: 1,
            operation: operation.into(),
            page_number: 2,
            object_id: Some("p2-o3".into()),
            text: None,
            matrix: None,
            color: None,
            rotation_degrees: None,
            bounds: None,
            image_path: None,
            annotation_type: None,
            target_page_number: None,
            width_points: None,
            height_points: None,
            ocr_blocks: None,
        }
    }

    #[test]
    fn object_ids_are_bound_to_their_page() {
        assert_eq!(parse_index(&patch("deleteObject"), 'o').unwrap(), 3);
        let mut invalid = patch("deleteObject");
        invalid.object_id = Some("p1-o3".into());
        assert!(
            parse_index(&invalid, 'o')
                .unwrap_err()
                .contains("identifiant")
        );
    }

    #[test]
    fn transformations_must_be_finite_and_bounded() {
        let mut value = patch("transformObject");
        value.matrix = Some([1.0, 0.0, 0.0, 1.0, f32::NAN, 0.0]);
        assert!(
            validate_patches(&[value])
                .unwrap_err()
                .contains("Transformation")
        );
    }
}
