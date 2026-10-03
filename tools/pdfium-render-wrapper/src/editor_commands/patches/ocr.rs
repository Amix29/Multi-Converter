use crate::editor_contracts::{PdfEditPatchV1, PdfOcrTextBlockV1};
use pdfium_render::prelude::*;

use super::{ensure_bounds_on_page, get_page};

pub(super) fn add_text_layer(
    document: &mut PdfDocument<'_>,
    patch: &PdfEditPatchV1,
) -> Result<(), String> {
    let blocks = patch.ocr_blocks.as_ref().unwrap();
    if let Some(character) = blocks
        .iter()
        .flat_map(|block| block.text.chars())
        .find(|character| !helvetica_supports(*character))
    {
        return Err(format!(
            "PDF_EDITOR_OCR_FONT_COVERAGE:Le calque OCR sûr intégré ne couvre pas U+{:04X}; aucune substitution silencieuse n’a été faite.",
            character as u32
        ));
    }

    let font = document.fonts_mut().helvetica();
    let mut page = get_page(document, patch.page_number)?;
    for block in blocks {
        ensure_bounds_on_page(&page, &block.bounds)?;
        let object = create_invisible_object(document, block, font)?;
        page.objects_mut()
            .add_text_object(object)
            .map_err(|error| format!("PDF_EDITOR_OCR_LAYER:{error}"))?;
    }
    page.regenerate_content()
        .map_err(|error| format!("PDF_EDITOR_PATCH_COMMIT:{error}"))
}

fn create_invisible_object<'a>(
    document: &PdfDocument<'a>,
    block: &PdfOcrTextBlockV1,
    font: PdfFontToken,
) -> Result<PdfPageTextObject<'a>, String> {
    let font_size = block
        .font_size_points
        .unwrap_or(block.bounds.height.clamp(1.0, 400.0));
    let mut object = PdfPageTextObject::new(document, &block.text, font, PdfPoints::new(font_size))
        .map_err(|error| format!("PDF_EDITOR_OCR_LAYER:{error}"))?;
    object
        .set_render_mode(PdfPageTextRenderMode::Invisible)
        .map_err(|error| format!("PDF_EDITOR_OCR_LAYER:{error}"))?;

    let initial = object
        .bounds()
        .map_err(|error| format!("PDF_EDITOR_OCR_BOUNDS:{error}"))?;
    let initial_width = initial.width().value.max(0.01);
    let initial_height = initial.height().value.max(0.01);
    let scale_x = block.bounds.width / initial_width;
    let scale_y = block.bounds.height / initial_height;
    object
        .transform(
            scale_x,
            0.0,
            0.0,
            scale_y,
            block.bounds.x - initial.left().value * scale_x,
            block.bounds.y - initial.bottom().value * scale_y,
        )
        .map_err(|error| format!("PDF_EDITOR_OCR_TRANSFORM:{error}"))?;
    Ok(object)
}

fn helvetica_supports(character: char) -> bool {
    if character.is_ascii() || ('\u{00A0}'..='\u{00FF}').contains(&character) {
        return !character.is_control();
    }
    matches!(
        character,
        '\u{0152}'
            | '\u{0153}'
            | '\u{0160}'
            | '\u{0161}'
            | '\u{0178}'
            | '\u{017D}'
            | '\u{017E}'
            | '\u{0192}'
            | '\u{02C6}'
            | '\u{02DC}'
            | '\u{2013}'
            | '\u{2014}'
            | '\u{2018}'
            | '\u{2019}'
            | '\u{201A}'
            | '\u{201C}'
            | '\u{201D}'
            | '\u{201E}'
            | '\u{2020}'
            | '\u{2021}'
            | '\u{2022}'
            | '\u{2026}'
            | '\u{2030}'
            | '\u{2039}'
            | '\u{203A}'
            | '\u{20AC}'
            | '\u{2122}'
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_builtin_font_coverage_is_explicit() {
        assert!("Français — déjà 10 €".chars().all(helvetica_supports));
        assert!(!"日本語".chars().all(helvetica_supports));
    }
}
