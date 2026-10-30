use super::contracts::{OcrDocumentResultV1, OcrTextBlockV1};
use unicode_normalization::UnicodeNormalization;

const MAX_OCR_TEXT_BYTES: usize = 64 * 1024 * 1024;

pub(super) fn normalize_result(result: &mut OcrDocumentResultV1) -> Result<(), String> {
    for page in &mut result.pages {
        for block in &mut page.blocks {
            block.text = normalize_text(&block.text);
        }
        sort_rows(&mut page.blocks);
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

fn sort_rows(blocks: &mut [OcrTextBlockV1]) {
    blocks.sort_by(|left, right| {
        left.bounding_box
            .y
            .total_cmp(&right.bounding_box.y)
            .then_with(|| left.bounding_box.x.total_cmp(&right.bounding_box.x))
            .then_with(|| {
                left.bounding_box
                    .height
                    .total_cmp(&right.bounding_box.height)
            })
            .then_with(|| left.bounding_box.width.total_cmp(&right.bounding_box.width))
            .then_with(|| left.text.cmp(&right.text))
    });
    let mut start = 0;
    while start < blocks.len() {
        // A fixed row anchor avoids the non-transitive pairwise tolerance
        // A~B, B~C, A!~C that made sorting depend on worker input order.
        let anchor_y = blocks[start].bounding_box.y;
        let anchor_height = blocks[start].bounding_box.height;
        let mut end = start + 1;
        while end < blocks.len() {
            let tolerance = anchor_height.min(blocks[end].bounding_box.height) * 0.5;
            if blocks[end].bounding_box.y - anchor_y > tolerance {
                break;
            }
            end += 1;
        }
        blocks[start..end].sort_by(|left, right| {
            left.bounding_box
                .x
                .total_cmp(&right.bounding_box.x)
                .then_with(|| left.bounding_box.y.total_cmp(&right.bounding_box.y))
                .then_with(|| left.text.cmp(&right.text))
        });
        start = end;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_is_nfc_with_lf_and_no_trailing_spaces() {
        assert_eq!(normalize_text("Cafe\u{301}  \r\nSuite \r"), "Café\nSuite");
    }

    #[test]
    fn close_rows_have_the_same_order_for_every_worker_permutation() {
        let templates = [("A", 30.0, 0.0), ("B", 20.0, 4.0), ("C", 10.0, 8.0)];
        for order in [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
        ] {
            let blocks = order.map(|index| {
                let (text, x, y) = templates[index];
                serde_json::json!({
                    "text": text, "confidence": 1.0,
                    "boundingBox": { "x": x, "y": y, "width": 8.0, "height": 10.0 }
                })
            });
            let mut result = serde_json::from_value(serde_json::json!({
                "schemaVersion": 1, "jobId": "row-order-regression", "text": "", "warnings": [],
                "pages": [{ "pageNumber": 1, "source": "ocr", "width": 100, "height": 100,
                    "text": "", "blocks": blocks, "warnings": [] }]
            }))
            .unwrap();
            normalize_result(&mut result).unwrap();
            assert_eq!(result.text, "B\nA\nC", "worker permutation {order:?}");
            assert_eq!(result.pages[0].blocks.len(), 3);
        }
    }
}
