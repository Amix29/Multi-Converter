use super::package::normalize_package_path;
use super::styles::{marks_from_style, normalize_alignment, resolved_style};
use super::types::{AssetContext, StyleCatalog};
use super::xml::{XmlChild, XmlNode};
use super::{NS_DRAW, NS_OFFICE, NS_SVG, NS_TABLE, NS_TEXT, NS_XLINK};
use crate::editor::assets::make_asset;
use crate::editor::document::{CommandResult, EditorCompatibilityWarning, is_supported_image_mime};
use serde_json::{Map, Value, json};
use std::path::Path;

pub(super) fn blocks_to_document(
    container: &XmlNode,
    catalog: &StyleCatalog,
    assets: &mut AssetContext,
) -> CommandResult<Value> {
    let mut content = Vec::new();
    for child in container.child_nodes() {
        if (child.is(NS_TEXT, "p") || child.is(NS_TEXT, "h"))
            && resolved_style(child.attr(NS_TEXT, "style-name"), catalog)?
                .paragraph
                .get("break-before")
                .is_some_and(|value| value == "page")
        {
            content.push(json!({ "type": "pageBreak" }));
        }
        if let Some(block) = block_to_tiptap(child, catalog, assets)? {
            content.push(block);
        }
    }
    if content.is_empty() {
        content.push(json!({ "type": "paragraph" }));
    }
    Ok(json!({ "type": "doc", "content": content }))
}

fn block_to_tiptap(
    node: &XmlNode,
    catalog: &StyleCatalog,
    assets: &mut AssetContext,
) -> CommandResult<Option<Value>> {
    if node.is(NS_TEXT, "p") || node.is(NS_TEXT, "h") {
        let frames = node
            .child_nodes()
            .filter(|child| child.is(NS_DRAW, "frame"))
            .collect::<Vec<_>>();
        let has_meaningful_non_frame = node.children.iter().any(|child| match child {
            XmlChild::Text(text) => !text.trim().is_empty(),
            XmlChild::Node(child) => {
                !child.is(NS_DRAW, "frame")
                    && !matches!(
                        child.name.as_str(),
                        "bookmark" | "bookmark-start" | "bookmark-end"
                    )
            }
        });
        if frames.len() == 1 && !has_meaningful_non_frame {
            return frame_to_image(frames[0], assets).map(Some);
        }
        let style = resolved_style(node.attr(NS_TEXT, "style-name"), catalog)?;
        let mut attrs = Map::new();
        if let Some(align) = style.paragraph.get("text-align") {
            attrs.insert("textAlign".to_string(), json!(normalize_alignment(align)));
        }
        if let Some(line_height) = style.paragraph.get("line-height") {
            attrs.insert("lineHeight".to_string(), json!(line_height));
        }
        if let Some(margin_left) = style.paragraph.get("margin-left") {
            attrs.insert("marginLeft".to_string(), json!(margin_left));
        }
        if let Some(text_indent) = style.paragraph.get("text-indent") {
            attrs.insert("textIndent".to_string(), json!(text_indent));
        }
        let mut value = Map::new();
        if node.is(NS_TEXT, "h") {
            let level = node
                .attr(NS_TEXT, "outline-level")
                .and_then(|value| value.parse::<u8>().ok())
                .unwrap_or(1)
                .clamp(1, 6);
            value.insert("type".to_string(), json!("heading"));
            attrs.insert("level".to_string(), json!(level));
        } else {
            value.insert("type".to_string(), json!("paragraph"));
        }
        if !attrs.is_empty() {
            value.insert("attrs".to_string(), Value::Object(attrs));
        }
        let inline = inline_content(node, catalog, assets, &[])?;
        if !inline.is_empty() {
            value.insert("content".to_string(), Value::Array(inline));
        }
        return Ok(Some(Value::Object(value)));
    }
    if node.is(NS_TEXT, "list") {
        let style_name = node.attr(NS_TEXT, "style-name").unwrap_or_default();
        let ordered = catalog.ordered_lists.contains(style_name);
        let mut items = Vec::new();
        for item in node
            .child_nodes()
            .filter(|child| child.is(NS_TEXT, "list-item"))
        {
            let mut blocks = Vec::new();
            for child in item.child_nodes() {
                if let Some(block) = block_to_tiptap(child, catalog, assets)? {
                    blocks.push(block);
                }
            }
            if blocks.is_empty() {
                blocks.push(json!({ "type": "paragraph" }));
            }
            items.push(json!({ "type": "listItem", "content": blocks }));
        }
        return Ok(Some(json!({
            "type": if ordered { "orderedList" } else { "bulletList" },
            "content": items
        })));
    }
    if node.is(NS_TABLE, "table") {
        let mut rows = Vec::new();
        let mut source_rows = Vec::new();
        collect_table_rows(node, false, &mut source_rows);
        for (row, header_row) in source_rows {
            let mut cells = Vec::new();
            for cell in row.child_nodes().filter(|child| {
                child.is(NS_TABLE, "table-cell") || child.is(NS_TABLE, "covered-table-cell")
            }) {
                if cell.is(NS_TABLE, "covered-table-cell") {
                    continue;
                }
                let mut blocks = Vec::new();
                for child in cell.child_nodes() {
                    if let Some(block) = block_to_tiptap(child, catalog, assets)? {
                        blocks.push(block);
                    }
                }
                if blocks.is_empty() {
                    blocks.push(json!({ "type": "paragraph" }));
                }
                let colspan = cell
                    .attr(NS_TABLE, "number-columns-spanned")
                    .and_then(|value| value.parse::<u32>().ok())
                    .unwrap_or(1);
                let rowspan = cell
                    .attr(NS_TABLE, "number-rows-spanned")
                    .and_then(|value| value.parse::<u32>().ok())
                    .unwrap_or(1);
                let parsed_cell = json!({
                    "type": if header_row { "tableHeader" } else { "tableCell" },
                    "attrs": { "colspan": colspan, "rowspan": rowspan },
                    "content": blocks
                });
                let repeated = cell
                    .attr(NS_TABLE, "number-columns-repeated")
                    .and_then(|value| value.parse::<usize>().ok())
                    .unwrap_or(1)
                    .min(1_000);
                cells.extend(std::iter::repeat_n(parsed_cell, repeated));
            }
            let parsed_row = json!({ "type": "tableRow", "content": cells });
            let repeated = row
                .attr(NS_TABLE, "number-rows-repeated")
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(1)
                .min(1_000);
            rows.extend(std::iter::repeat_n(parsed_row, repeated));
        }
        return Ok(Some(json!({ "type": "table", "content": rows })));
    }
    if node.is(NS_DRAW, "frame") {
        return frame_to_image(node, assets).map(Some);
    }
    if node.namespace == NS_DRAW && matches!(node.name.as_str(), "object" | "object-ole" | "plugin")
    {
        assets.warnings.push(unsupported_warning());
        return Ok(Some(json!({
            "type": "unsupportedObject",
            "attrs": { "label": "Objet incorporé non éditable" }
        })));
    }
    if node.is(NS_TEXT, "section") || node.is(NS_OFFICE, "text") {
        let mut blocks = Vec::new();
        for child in node.child_nodes() {
            if let Some(block) = block_to_tiptap(child, catalog, assets)? {
                blocks.push(block);
            }
        }
        return Ok(Some(json!({ "type": "blockquote", "content": blocks })));
    }
    Ok(None)
}

fn collect_table_rows<'a>(
    node: &'a XmlNode,
    inherited_header: bool,
    output: &mut Vec<(&'a XmlNode, bool)>,
) {
    for child in node.child_nodes() {
        if child.is(NS_TABLE, "table-row") {
            output.push((child, inherited_header));
        } else if child.is(NS_TABLE, "table-header-rows") {
            collect_table_rows(child, true, output);
        } else if child.is(NS_TABLE, "table-rows") || child.is(NS_TABLE, "table-row-group") {
            collect_table_rows(child, inherited_header, output);
        }
    }
}

fn inline_content(
    node: &XmlNode,
    catalog: &StyleCatalog,
    assets: &mut AssetContext,
    inherited_marks: &[Value],
) -> CommandResult<Vec<Value>> {
    let mut output = Vec::new();
    for child in &node.children {
        match child {
            XmlChild::Text(text) => push_text(&mut output, text, inherited_marks),
            XmlChild::Node(child) if child.is(NS_TEXT, "span") => {
                let style = resolved_style(child.attr(NS_TEXT, "style-name"), catalog)?;
                let mut marks = inherited_marks.to_vec();
                marks.extend(marks_from_style(&style));
                output.extend(inline_content(child, catalog, assets, &marks)?);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "a") => {
                let mut marks = inherited_marks.to_vec();
                if let Some(href) = child.attr(NS_XLINK, "href")
                    && (href.starts_with('#')
                        || href.starts_with("http://")
                        || href.starts_with("https://")
                        || href.starts_with("mailto:"))
                {
                    marks.push(json!({ "type": "link", "attrs": { "href": href } }));
                }
                output.extend(inline_content(child, catalog, assets, &marks)?);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "line-break") => {
                output.push(json!({ "type": "hardBreak" }));
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "tab") => {
                push_text(&mut output, "\t", inherited_marks);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "s") => {
                let count = child
                    .attr(NS_TEXT, "c")
                    .and_then(|value| value.parse::<usize>().ok())
                    .unwrap_or(1)
                    .min(1_000);
                push_text(&mut output, &" ".repeat(count), inherited_marks);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "page-number") => {
                push_text(&mut output, "{page}", inherited_marks);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "page-count") => {
                push_text(&mut output, "{total}", inherited_marks);
            }
            XmlChild::Node(child) if child.is(NS_DRAW, "frame") => {
                let image = frame_to_image(child, assets)?;
                let label = image
                    .pointer("/attrs/alt")
                    .and_then(Value::as_str)
                    .unwrap_or("Image");
                assets.warnings.push(EditorCompatibilityWarning {
                    code: "mixedInlineImage".to_string(),
                    message: "Une image mélangée à du texte a été conservée comme repère explicite. Enregistrer sous est obligatoire pour protéger l’original.".to_string(),
                    blocks_overwrite: true,
                });
                push_text(&mut output, &format!("[{label}]"), inherited_marks);
            }
            XmlChild::Node(child)
                if child.namespace == NS_DRAW
                    && matches!(child.name.as_str(), "object" | "object-ole" | "plugin") =>
            {
                assets.warnings.push(unsupported_warning());
                output.push(json!({
                    "type": "unsupportedObject",
                    "attrs": { "label": "Objet incorporé non éditable" }
                }));
            }
            XmlChild::Node(child) => {
                output.extend(inline_content(child, catalog, assets, inherited_marks)?);
            }
        }
    }
    Ok(output)
}

fn push_text(output: &mut Vec<Value>, text: &str, marks: &[Value]) {
    if text.is_empty() {
        return;
    }
    let mut node = Map::new();
    node.insert("type".to_string(), json!("text"));
    node.insert("text".to_string(), json!(text));
    if !marks.is_empty() {
        node.insert("marks".to_string(), Value::Array(marks.to_vec()));
    }
    output.push(Value::Object(node));
}

fn frame_to_image(node: &XmlNode, assets: &mut AssetContext) -> CommandResult<Value> {
    if node.child_nodes().any(|child| {
        child.namespace == NS_DRAW
            && matches!(child.name.as_str(), "object" | "object-ole" | "plugin")
    }) {
        assets.warnings.push(unsupported_warning());
        return Ok(json!({
            "type": "unsupportedObject",
            "attrs": { "label": "Objet incorporé non éditable" }
        }));
    }
    let image = node
        .child_nodes()
        .find(|child| child.is(NS_DRAW, "image"))
        .ok_or_else(|| "ODT_ASSET_INVALID:Image ODT sans contenu.".to_string())?;
    let href = image
        .attr(NS_XLINK, "href")
        .ok_or_else(|| "ODT_ASSET_INVALID:Chemin d’image ODT manquant.".to_string())?;
    let path = normalize_package_path(href)?;
    let asset = if let Some(asset) = assets.imported.get(&path) {
        asset.clone()
    } else {
        let (mime_type, bytes) =
            assets.package_assets.get(&path).cloned().ok_or_else(|| {
                "ODT_ASSET_INVALID:Image ODT référencée mais absente.".to_string()
            })?;
        if !is_supported_image_mime(&mime_type) {
            assets.warnings.push(EditorCompatibilityWarning {
                code: "unsupportedImageFormat".to_string(),
                message: format!("Une image {mime_type} ne peut pas être éditée directement. Elle a été remplacée par un bloc explicite."),
                blocks_overwrite: true,
            });
            return Ok(json!({
                "type": "unsupportedObject",
                "attrs": { "label": format!("Image {mime_type} non éditable") }
            }));
        }
        let name = Path::new(&path)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("image");
        let (asset, bytes) = make_asset(name, &mime_type, bytes)?;
        assets.imported.insert(path, asset.clone());
        assets.assets.push((asset.clone(), bytes));
        asset
    };
    let width = node
        .attr(NS_SVG, "width")
        .map(str::to_string)
        .unwrap_or_else(|| "auto".to_string());
    Ok(json!({
        "type": "image",
        "attrs": {
            "assetId": asset.id,
            "src": format!("mc-asset://{}", asset.id),
            "alt": node.attr(NS_DRAW, "name").unwrap_or(&asset.name),
            "title": node.attr(NS_DRAW, "name").unwrap_or(&asset.name),
            "width": width,
            "align": "center"
        }
    }))
}

fn unsupported_warning() -> EditorCompatibilityWarning {
    EditorCompatibilityWarning {
        code: "unsupportedEmbeddedObject".to_string(),
        message: "Ce document contient un objet incorporé que l’éditeur ne peut pas réexporter fidèlement. Enregistrer sous est obligatoire pour protéger l’original.".to_string(),
        blocks_overwrite: true,
    }
}
