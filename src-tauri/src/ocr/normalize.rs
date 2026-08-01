use super::contracts::{OcrDocumentResultV1, OcrTextBlockV1};
use unicode_normalization::UnicodeNormalization;

const MAX_OCR_TEXT_BYTES: usize = 64 * 1024 * 1024;

pub(super) fn normalize_result(result: &mut OcrDocumentResultV1) -> Result<(), String> {
    for page in &mut result.pages {
        page.blocks.sort_by(reading_order);
        for block in &mut page.blocks {
            block.text = normalize_text(&block.text);
        }
        page.text = page
            .blocks
            .iter()
            .map(|block| block.text.as_str())
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
    }
    result.pages.sort_by_key(|page| page.page_number);
    result.text = result
        .pages
        .iter()
        .map(|page| page.text.as_str())
        .collect::<Vec<_>>()
        .join("\u{000c}");
    if result.text.len() > MAX_OCR_TEXT_BYTES {
        return Err("OCR_TEXT_LIMIT:Le texte reconnu dépasse 64 Mio.".to_string());
    }
    Ok(())
}

pub(super) fn normalize_text(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .nfc()
        .collect::<String>()
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn reading_order(left: &OcrTextBlockV1, right: &OcrTextBlockV1) -> std::cmp::Ordering {
    let row_tolerance = left.bounding_box.height.min(right.bounding_box.height) * 0.5;
    let vertical = left.bounding_box.y - right.bounding_box.y;
    if vertical.abs() <= row_tolerance {
        left.bounding_box
            .x
            .partial_cmp(&right.bounding_box.x)
            .unwrap_or(std::cmp::Ordering::Equal)
    } else {
        left.bounding_box
            .y
            .partial_cmp(&right.bounding_box.y)
            .unwrap_or(std::cmp::Ordering::Equal)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_is_nfc_with_lf_and_no_trailing_spaces() {
        assert_eq!(normalize_text("Cafe\u{301}  \r\nSuite \r"), "Café\nSuite");
    }
}
