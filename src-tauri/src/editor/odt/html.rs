use super::styles::{valid_color, valid_style_measure};
use super::writer_render::page_dimensions_mm;
use super::xml::xml_escape;
use crate::editor::assets::asset_file_for_export;
use crate::editor::document::{CommandResult, EditorDocument};
use base64::Engine;
use serde_json::Value;
use std::fs;

pub(in crate::editor) fn render_html_document(document: &EditorDocument) -> CommandResult<String> {
    let header = document
        .header
        .as_ref()
        .map(|value| render_html_blocks(value, document))
        .transpose()?
        .unwrap_or_default();
    let body = render_html_blocks(&document.content, document)?;
    let footer = document
        .footer
        .as_ref()
        .map(|value| render_html_blocks(value, document))
        .transpose()?
        .unwrap_or_default();
    let (width, height) = page_dimensions_mm(&document.page);
    Ok(format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><style>@page{{size:{width}mm {height}mm;margin:{}mm {}mm {}mm {}mm}}body{{font-family:Arial,sans-serif;line-height:1.45}}header,footer{{color:#465148}}img{{max-width:100%}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #999;padding:4px}}</style></head><body><header>{header}</header><main>{body}</main><footer>{footer}</footer></body></html>",
        document.page.margins_mm.top,
        document.page.margins_mm.right,
        document.page.margins_mm.bottom,
        document.page.margins_mm.left,
    ))
}

fn render_html_blocks(value: &Value, document: &EditorDocument) -> CommandResult<String> {
    let mut output = String::new();
    let nodes = value
        .get("content")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    for node in nodes {
        render_html_node(node, document, &mut output)?;
    }
    Ok(output)
}

fn render_html_node(
    node: &Value,
    document: &EditorDocument,
    output: &mut String,
) -> CommandResult<()> {
    let kind = node.get("type").and_then(Value::as_str).unwrap_or_default();
    let (open, close) = match kind {
        "paragraph" => ("<p>".to_string(), "</p>"),
        "heading" => {
            let level = node
                .pointer("/attrs/level")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 6);
            (
                format!("<h{level}>"),
                if level == 1 {
                    "</h1>"
                } else if level == 2 {
                    "</h2>"
                } else if level == 3 {
                    "</h3>"
                } else if level == 4 {
                    "</h4>"
                } else if level == 5 {
                    "</h5>"
                } else {
                    "</h6>"
                },
            )
        }
        "bulletList" => ("<ul>".to_string(), "</ul>"),
        "orderedList" => ("<ol>".to_string(), "</ol>"),
        "listItem" => ("<li>".to_string(), "</li>"),
        "blockquote" => ("<blockquote>".to_string(), "</blockquote>"),
        "table" => ("<table>".to_string(), "</table>"),
        "tableRow" => ("<tr>".to_string(), "</tr>"),
        "tableCell" | "tableHeader" => ("<td>".to_string(), "</td>"),
        "horizontalRule" => {
            output.push_str("<hr>");
            return Ok(());
        }
        "hardBreak" => {
            output.push_str("<br>");
            return Ok(());
        }
        "pageBreak" => {
            output.push_str("<div style=\"break-before:page\"></div>");
            return Ok(());
        }
        "image" | "documentImage" => {
            render_html_image(node, document, output)?;
            return Ok(());
        }
        "text" => {
            render_html_text(node, output);
            return Ok(());
        }
        "unsupportedObject" => {
            output.push_str("<aside>[Objet incorporé non éditable]</aside>");
            return Ok(());
        }
        _ => (String::new(), ""),
    };
    output.push_str(&open);
    for child in node
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        render_html_node(child, document, output)?;
    }
    output.push_str(close);
    Ok(())
}

fn render_html_text(node: &Value, output: &mut String) {
    let text = node.get("text").and_then(Value::as_str).unwrap_or_default();
    let marks = node.get("marks").and_then(Value::as_array);
    let mut closing = Vec::new();
    for mark in marks.into_iter().flatten() {
        match mark.get("type").and_then(Value::as_str).unwrap_or_default() {
            "bold" => {
                output.push_str("<strong>");
                closing.push("</strong>");
            }
            "italic" => {
                output.push_str("<em>");
                closing.push("</em>");
            }
            "underline" => {
                output.push_str("<u>");
                closing.push("</u>");
            }
            "strike" => {
                output.push_str("<s>");
                closing.push("</s>");
            }
            "link" => {
                if let Some(href) =
                    mark.pointer("/attrs/href")
                        .and_then(Value::as_str)
                        .filter(|href| {
                            href.starts_with('#')
                                || href.starts_with("http://")
                                || href.starts_with("https://")
                                || href.starts_with("mailto:")
                        })
                {
                    output.push_str(&format!("<a href=\"{}\">", xml_escape(href)));
                    closing.push("</a>");
                }
            }
            "textStyle" | "highlight" => {
                let mut css = Vec::new();
                if let Some(font) = mark.pointer("/attrs/fontFamily").and_then(Value::as_str) {
                    css.push(format!("font-family:{}", html_css_value(font)));
                }
                if let Some(size) = mark
                    .pointer("/attrs/fontSize")
                    .and_then(Value::as_str)
                    .filter(|value| valid_style_measure(value))
                {
                    css.push(format!("font-size:{size}"));
                }
                if let Some(color) = mark
                    .pointer("/attrs/color")
                    .and_then(Value::as_str)
                    .filter(|value| valid_color(value))
                {
                    let property = if mark.get("type").and_then(Value::as_str) == Some("highlight")
                    {
                        "background-color"
                    } else {
                        "color"
                    };
                    css.push(format!("{property}:{color}"));
                }
                if !css.is_empty() {
                    output.push_str(&format!("<span style=\"{}\">", xml_escape(&css.join(";"))));
                    closing.push("</span>");
                }
            }
            _ => {}
        }
    }
    output.push_str(&xml_escape(text));
    for tag in closing.into_iter().rev() {
        output.push_str(tag);
    }
}

fn html_css_value(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            character.is_alphanumeric() || matches!(character, ' ' | '-' | '_' | ',')
        })
        .take(120)
        .collect()
}

fn render_html_image(
    node: &Value,
    document: &EditorDocument,
    output: &mut String,
) -> CommandResult<()> {
    let id = node
        .pointer("/attrs/assetId")
        .and_then(Value::as_str)
        .ok_or_else(|| "EDITOR_ASSET_INVALID:Image sans identifiant.".to_string())?;
    let asset = document
        .assets
        .iter()
        .find(|asset| asset.id == id)
        .ok_or_else(|| "EDITOR_ASSET_MISSING:Image introuvable.".to_string())?;
    let bytes =
        fs::read(asset_file_for_export(&document.id, asset)?).map_err(|error| error.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let alt = node
        .pointer("/attrs/alt")
        .and_then(Value::as_str)
        .unwrap_or(&asset.name);
    output.push_str(&format!(
        "<img src=\"data:{};base64,{}\" alt=\"{}\">",
        asset.mime_type,
        encoded,
        xml_escape(alt)
    ));
    Ok(())
}
