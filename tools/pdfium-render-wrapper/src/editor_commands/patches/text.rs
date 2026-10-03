use crate::editor_contracts::PdfEditPatchV1;
use pdfium_render::prelude::*;

use super::{get_page, parse_index};

/// Preserve the source font whenever it can represent the requested text.
/// Embedded subset fonts can silently drop missing glyphs through
/// `FPDFText_SetText()`, so verify the regenerated object and only fall back to
/// a standard PDF font when that exact-text check fails.
pub(super) fn replace_text_object(
    document: &mut PdfDocument<'_>,
    patch: &PdfEditPatchV1,
) -> Result<(), String> {
    let requested = patch.text.as_deref().unwrap_or_default();
    let index = parse_index(patch, 'o')?;
    let snapshot = snapshot_text_object(document, patch.page_number, index)?;
    if set_text_with_existing_font(document, patch.page_number, index, requested)? {
        return Ok(());
    }

    ensure_standard_latin(requested)?;
    let font = document.fonts_mut().helvetica();
    let mut replacement = PdfPageTextObject::new(document, requested, font, snapshot.font_size)
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_FONT:{error}"))?;
    replacement
        .apply_matrix(snapshot.matrix)
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_MATRIX:{error}"))?;
    replacement
        .set_render_mode(snapshot.render_mode)
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_MODE:{error}"))?;
    let mut replacement: PdfPageObject<'_> = replacement.into();
    replacement
        .set_fill_color(snapshot.fill_color)
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_COLOR:{error}"))?;
    replacement
        .set_stroke_color(snapshot.stroke_color)
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_COLOR:{error}"))?;

    let mut page = get_page(document, patch.page_number)?;
    let removed = page
        .objects_mut()
        .remove_object_at_index(index)
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_REPLACE:{error}"))?;
    // The locked PDFium build crashes while destroying a detached source
    // object. The wrapper is a bounded one-shot process, so retain it until
    // process exit before executing any further fallible operation.
    std::mem::forget(removed);
    page.objects_mut()
        .insert_object_at_index(index, replacement)
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_REPLACE:{error}"))?;
    page.regenerate_content()
        .map_err(|error| format!("PDF_EDITOR_PATCH_COMMIT:{error}"))?;

    let expected = if requested.is_empty() { " " } else { requested };
    let actual = match page
        .objects()
        .get(index)
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_VERIFY:{error}"))?
    {
        PdfPageObject::Text(ref text) => text.text(),
        _ => {
            return Err(
                "PDF_EDITOR_PATCH_TEXT_VERIFY:L’objet remplacé n’est plus du texte.".into(),
            );
        }
    };
    if actual != expected {
        return Err(
            "PDF_EDITOR_TEXT_UNREPRESENTABLE:La police PDF sûre ne peut pas représenter exactement ce texte."
                .into(),
        );
    }
    Ok(())
}

fn set_text_with_existing_font(
    document: &mut PdfDocument<'_>,
    page_number: usize,
    index: usize,
    requested: &str,
) -> Result<bool, String> {
    let mut page = get_page(document, page_number)?;
    let mut object = page
        .objects_mut()
        .get(index)
        .map_err(|error| format!("PDF_EDITOR_PATCH_OBJECT:{error}"))?;
    match object {
        PdfPageObject::Text(ref mut text) => {
            if text.set_text(requested).is_err() {
                return Ok(false);
            }
        }
        _ => return Err("PDF_EDITOR_PATCH_TYPE:Seul un objet texte accepte setText.".into()),
    }
    drop(object);
    page.regenerate_content()
        .map_err(|error| format!("PDF_EDITOR_PATCH_COMMIT:{error}"))?;

    let expected = if requested.is_empty() { " " } else { requested };
    let actual = match page
        .objects()
        .get(index)
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_VERIFY:{error}"))?
    {
        PdfPageObject::Text(ref text) => text.text(),
        _ => {
            return Err("PDF_EDITOR_PATCH_TEXT_VERIFY:L’objet modifié n’est plus du texte.".into());
        }
    };
    Ok(actual == expected)
}

struct TextSnapshot {
    matrix: PdfMatrix,
    font_size: PdfPoints,
    fill_color: PdfColor,
    stroke_color: PdfColor,
    render_mode: PdfPageTextRenderMode,
}

fn snapshot_text_object(
    document: &PdfDocument<'_>,
    page_number: usize,
    index: usize,
) -> Result<TextSnapshot, String> {
    let page = get_page(document, page_number)?;
    let object = page
        .objects()
        .get(index)
        .map_err(|error| format!("PDF_EDITOR_PATCH_OBJECT:{error}"))?;
    let fill_color = object
        .fill_color()
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_COLOR:{error}"))?;
    let stroke_color = object
        .stroke_color()
        .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_COLOR:{error}"))?;
    match object {
        PdfPageObject::Text(ref text) => Ok(TextSnapshot {
            matrix: text
                .matrix()
                .map_err(|error| format!("PDF_EDITOR_PATCH_TEXT_MATRIX:{error}"))?,
            font_size: text.unscaled_font_size(),
            fill_color,
            stroke_color,
            render_mode: text.render_mode(),
        }),
        _ => Err("PDF_EDITOR_PATCH_TYPE:Seul un objet texte accepte setText.".into()),
    }
}

fn ensure_standard_latin(text: &str) -> Result<(), String> {
    if text.chars().all(is_win_ansi_character) {
        Ok(())
    } else {
        Err(
            "PDF_EDITOR_TEXT_UNREPRESENTABLE:Ce texte exige une police Unicode incorporable ; aucune modification n’a été écrite."
                .into(),
        )
    }
}

fn is_win_ansi_character(value: char) -> bool {
    matches!(value,
        ' '..='~'
        | '\u{00a0}'..='\u{00ff}'
        | '\u{20ac}' | '\u{201a}' | '\u{0192}' | '\u{201e}' | '\u{2026}'
        | '\u{2020}' | '\u{2021}' | '\u{02c6}' | '\u{2030}' | '\u{0160}'
        | '\u{2039}' | '\u{0152}' | '\u{017d}' | '\u{2018}' | '\u{2019}'
        | '\u{201c}' | '\u{201d}' | '\u{2022}' | '\u{2013}' | '\u{2014}'
        | '\u{02dc}' | '\u{2122}' | '\u{0161}' | '\u{203a}' | '\u{0153}'
        | '\u{017e}' | '\u{0178}'
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standard_latin_is_explicit_and_unicode_outside_it_is_rejected() {
        assert!(ensure_standard_latin("Éditeur — 100 €").is_ok());
        assert!(ensure_standard_latin("日本語").is_err());
        assert!(ensure_standard_latin("line\nbreak").is_err());
    }
}
