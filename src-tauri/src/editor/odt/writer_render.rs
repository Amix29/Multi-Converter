use super::styles::style_key_from_marks;
use super::types::WriterStyleCatalog;
use super::writer::odt_asset_path;
use super::xml::xml_escape;
use crate::editor::document::{CommandResult, EditorAssetRef, EditorDocument, EditorPageSettings};
use serde_json::Value;

pub(super) fn render_odt_blocks(
    value: &Value,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
) -> CommandResult<String> {
    let nodes = if value.get("type").and_then(Value::as_str) == Some("doc") {
        value
            .get("content")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    } else {
        std::slice::from_ref(value)
    };
    let mut output = String::new();
    for node in nodes {
        render_odt_block(node, document, styles, &mut output)?;
    }
    Ok(output)
}

fn render_odt_block(
    node: &Value,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
    output: &mut String,
) -> CommandResult<()> {
    let node_type = node.get("type").and_then(Value::as_str).unwrap_or_default();
    match node_type {
        "paragraph" | "heading" => {
            let tag = if node_type == "heading" {
                "text:h"
            } else {
                "text:p"
            };
            let align = node
                .pointer("/attrs/textAlign")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let style = match align {
                "center" => "Center",
                "right" => "Right",
                _ => "Standard",
            };
            output.push_str(&format!("<{tag} text:style-name=\"{style}\""));
            if node_type == "heading" {
                let level = node
                    .pointer("/attrs/level")
                    .and_then(Value::as_u64)
                    .unwrap_or(1)
                    .clamp(1, 6);
                output.push_str(&format!(" text:outline-level=\"{level}\""));
            }
            output.push('>');
            render_odt_inline_nodes(
                node.get("content").and_then(Value::as_array),
                document,
                styles,
                output,
            )?;
            output.push_str(&format!("</{tag}>"));
        }
        "bulletList" | "orderedList" => {
            let style = if node_type == "orderedList" {
                "NumberList"
            } else {
                "BulletList"
            };
            output.push_str(&format!("<text:list text:style-name=\"{style}\">"));
            for item in node
                .get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                output.push_str("<text:list-item>");
                for block in item
                    .get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    render_odt_block(block, document, styles, output)?;
                }
                output.push_str("</text:list-item>");
            }
            output.push_str("</text:list>");
        }
        "blockquote" => {
            for block in node
                .get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                render_odt_block(block, document, styles, output)?;
            }
        }
        "table" => {
            output.push_str("<table:table table:name=\"Table1\">");
            let rows = node
                .get("content")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default();
            let column_count = rows
                .iter()
                .map(|row| {
                    row.get("content")
                        .and_then(Value::as_array)
                        .map(|cells| {
                            cells
                                .iter()
                                .map(|cell| {
                                    cell.pointer("/attrs/colspan")
                                        .and_then(Value::as_u64)
                                        .unwrap_or(1) as usize
                                })
                                .sum::<usize>()
                        })
                        .unwrap_or_default()
                })
                .max()
                .unwrap_or(0);
            if column_count > 0 {
                output.push_str(&format!(
                    "<table:table-column table:number-columns-repeated=\"{column_count}\"/>"
                ));
            }
            for row in rows {
                output.push_str("<table:table-row>");
                for cell in row
                    .get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    let colspan = cell
                        .pointer("/attrs/colspan")
                        .and_then(Value::as_u64)
                        .unwrap_or(1);
                    let rowspan = cell
                        .pointer("/attrs/rowspan")
                        .and_then(Value::as_u64)
                        .unwrap_or(1);
                    output.push_str("<table:table-cell");
                    if colspan > 1 {
                        output.push_str(&format!(" table:number-columns-spanned=\"{colspan}\""));
                    }
                    if rowspan > 1 {
                        output.push_str(&format!(" table:number-rows-spanned=\"{rowspan}\""));
                    }
                    output.push('>');
                    for block in cell
                        .get("content")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                    {
                        render_odt_block(block, document, styles, output)?;
                    }
                    output.push_str("</table:table-cell>");
                }
                output.push_str("</table:table-row>");
            }
            output.push_str("</table:table>");
        }
        "image" | "documentImage" => {
            output.push_str("<text:p>");
            render_odt_image(node, document, output)?;
            output.push_str("</text:p>");
        }
        "pageBreak" => output.push_str("<text:p text:style-name=\"PageBreak\"/>"),
        "horizontalRule" => output.push_str("<text:p>────────────────</text:p>"),
        "unsupportedObject" => output.push_str("<text:p>[Objet incorporé non éditable]</text:p>"),
        _ => {
            for child in node
                .get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                render_odt_block(child, document, styles, output)?;
            }
        }
    }
    Ok(())
}

fn render_odt_inline_nodes(
    nodes: Option<&Vec<Value>>,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
    output: &mut String,
) -> CommandResult<()> {
    for node in nodes.into_iter().flatten() {
        let node_type = node.get("type").and_then(Value::as_str).unwrap_or_default();
        match node_type {
            "text" => render_odt_text(node, styles, output),
            "hardBreak" => output.push_str("<text:line-break/>"),
            "image" | "documentImage" => render_odt_image(node, document, output)?,
            "pageBreak" => output.push_str("<text:line-break/>"),
            "unsupportedObject" => output.push_str("[Objet incorporé non éditable]"),
            _ => {}
        }
    }
    Ok(())
}

fn render_odt_text(node: &Value, styles: &WriterStyleCatalog, output: &mut String) {
    let text = node.get("text").and_then(Value::as_str).unwrap_or_default();
    let marks = node.get("marks").and_then(Value::as_array);
    let link = marks
        .into_iter()
        .flatten()
        .find(|mark| mark.get("type").and_then(Value::as_str) == Some("link"));
    let style_name = style_key_from_marks(marks).and_then(|key| styles.names.get(&key));
    if let Some(link) = link
        && let Some(href) = link.pointer("/attrs/href").and_then(Value::as_str)
    {
        output.push_str(&format!("<text:a xlink:href=\"{}\">", xml_escape(href)));
    }
    if let Some(style_name) = style_name {
        output.push_str(&format!(
            "<text:span text:style-name=\"{}\">",
            xml_escape(style_name)
        ));
    }
    render_text_with_page_fields(text, output);
    if style_name.is_some() {
        output.push_str("</text:span>");
    }
    if link.is_some() {
        output.push_str("</text:a>");
    }
}

pub(super) fn render_text_with_page_fields(text: &str, output: &mut String) {
    let mut remaining = text;
    while let Some(index) = remaining.find(['{']) {
        output.push_str(&xml_escape(&remaining[..index]));
        let tail = &remaining[index..];
        if let Some(rest) = tail.strip_prefix("{page}") {
            output.push_str("<text:page-number text:select-page=\"current\">1</text:page-number>");
            remaining = rest;
        } else if let Some(rest) = tail.strip_prefix("{total}") {
            output.push_str("<text:page-count>1</text:page-count>");
            remaining = rest;
        } else {
            output.push('{');
            remaining = &tail[1..];
        }
    }
    output.push_str(&xml_escape(remaining));
}

fn render_odt_image(
    node: &Value,
    document: &EditorDocument,
    output: &mut String,
) -> CommandResult<()> {
    let asset_id = node
        .pointer("/attrs/assetId")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            "EDITOR_ASSET_INVALID:Identifiant d’image manquant pendant l’export.".to_string()
        })?;
    let asset = document
        .assets
        .iter()
        .find(|asset| asset.id == asset_id)
        .ok_or_else(|| "EDITOR_ASSET_MISSING:Image introuvable pendant l’export.".to_string())?;
    let width = node
        .pointer("/attrs/width")
        .and_then(Value::as_str)
        .filter(|value| value.ends_with("cm") || value.ends_with("mm") || value.ends_with("in"))
        .unwrap_or("15cm");
    let title = node
        .pointer("/attrs/title")
        .and_then(Value::as_str)
        .unwrap_or(&asset.name);
    let height = image_height_for_width(width, asset);
    output.push_str(&format!(
        "<draw:frame draw:name=\"{}\" text:anchor-type=\"as-char\" svg:width=\"{}\" svg:height=\"{}\"><draw:image xlink:href=\"{}\" xlink:type=\"simple\" xlink:show=\"embed\" xlink:actuate=\"onLoad\"/></draw:frame>",
        xml_escape(title),
        xml_escape(width),
        xml_escape(&height),
        xml_escape(&odt_asset_path(asset))
    ));
    Ok(())
}

fn image_height_for_width(width: &str, asset: &EditorAssetRef) -> String {
    let Some(width_cm) = width
        .strip_suffix("cm")
        .and_then(|value| value.parse::<f32>().ok())
    else {
        return "10cm".to_string();
    };
    let ratio = match (asset.width, asset.height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => height as f32 / width as f32,
        _ => 2.0 / 3.0,
    };
    format!("{:.3}cm", (width_cm * ratio).clamp(0.1, 100.0))
}

pub(super) fn page_dimensions_mm(page: &EditorPageSettings) -> (f32, f32) {
    let (width, height) = match page.format.as_str() {
        "a3" => (297.0, 420.0),
        "a5" => (148.0, 210.0),
        "letter" => (215.9, 279.4),
        "legal" => (215.9, 355.6),
        _ => (210.0, 297.0),
    };
    if page.orientation == "landscape" {
        (height, width)
    } else {
        (width, height)
    }
}

pub(super) fn contains_page_placeholder(value: Option<&Value>) -> bool {
    fn visit(value: &Value) -> bool {
        if value
            .get("text")
            .and_then(Value::as_str)
            .is_some_and(|text| text.contains("{page}"))
        {
            return true;
        }
        value
            .get("content")
            .and_then(Value::as_array)
            .is_some_and(|children| children.iter().any(visit))
    }
    value.is_some_and(visit)
}
