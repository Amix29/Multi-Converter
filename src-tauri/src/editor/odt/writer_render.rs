use super::styles::style_key_from_marks;
use super::types::WriterStyleCatalog;
use super::writer_image::render_image;
use super::xml::xml_escape;
use crate::editor::document::{CommandResult, EditorDocument, EditorPageSettings};
use serde_json::Value;

pub(super) struct RenderedOdtBlocks {
    pub(super) body: String,
    pub(super) automatic_styles: String,
}

struct RenderState {
    scope: String,
    next_table_index: usize,
    next_image_index: usize,
    automatic_styles: String,
}

pub(super) fn render_odt_blocks(
    value: &Value,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
    scope: &str,
) -> CommandResult<RenderedOdtBlocks> {
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
    let mut state = RenderState {
        scope: scope.to_string(),
        next_table_index: 0,
        next_image_index: 0,
        automatic_styles: String::new(),
    };
    for node in nodes {
        render_odt_block(node, document, styles, &mut state, &mut output)?;
    }
    Ok(RenderedOdtBlocks {
        body: output,
        automatic_styles: state.automatic_styles,
    })
}

fn render_odt_block(
    node: &Value,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
    state: &mut RenderState,
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
                "justify" => "Justify",
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
                state,
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
                    render_odt_block(block, document, styles, state, output)?;
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
                render_odt_block(block, document, styles, state, output)?;
            }
        }
        "table" => render_odt_table(node, document, styles, state, output)?,
        "image" | "documentImage" => {
            state.next_image_index += 1;
            let style_name = format!("{}Image{}", state.scope, state.next_image_index);
            let image = render_image(node, document, &style_name)?;
            state.automatic_styles.push_str(&image.automatic_style);
            output.push_str(&format!(
                "<text:p text:style-name=\"{}\">",
                image.paragraph_style
            ));
            output.push_str(&image.frame);
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
                render_odt_block(child, document, styles, state, output)?;
            }
        }
    }
    Ok(())
}

fn render_odt_table(
    node: &Value,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
    state: &mut RenderState,
    output: &mut String,
) -> CommandResult<()> {
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
                .into_iter()
                .flatten()
                .map(|cell| cell_span(cell, "colspan"))
                .sum::<usize>()
        })
        .max()
        .unwrap_or(0)
        .clamp(1, 100);
    state.next_table_index += 1;
    let table_name = format!("{}Table{}", state.scope, state.next_table_index);
    let column_widths = table_column_widths(rows, column_count, document);
    state.automatic_styles.push_str(&table_styles(
        &table_name,
        &column_widths,
        column_widths.iter().sum(),
    ));
    output.push_str(&format!(
        "<table:table table:name=\"{table_name}\" table:style-name=\"{table_name}\">"
    ));
    for index in 0..column_count {
        output.push_str(&format!(
            "<table:table-column table:style-name=\"{table_name}.Column{}\"/>",
            index + 1
        ));
    }

    let mut row_spans = vec![0usize; column_count];
    for row in rows {
        let current_spans = row_spans.clone();
        let mut next_spans = current_spans
            .iter()
            .map(|remaining| remaining.saturating_sub(1))
            .collect::<Vec<_>>();
        let mut column = 0usize;
        output.push_str("<table:table-row>");
        for cell in row
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            while column < column_count && current_spans[column] > 0 {
                output.push_str("<table:covered-table-cell/>");
                column += 1;
            }
            if column >= column_count {
                break;
            }
            let colspan = cell_span(cell, "colspan").min(column_count - column);
            let rowspan = cell_span(cell, "rowspan");
            let style = if cell.get("type").and_then(Value::as_str) == Some("tableHeader") {
                "TableHeaderCell"
            } else {
                "TableCell"
            };
            output.push_str(&format!(
                "<table:table-cell table:style-name=\"{style}\" office:value-type=\"string\""
            ));
            if colspan > 1 {
                output.push_str(&format!(" table:number-columns-spanned=\"{colspan}\""));
            }
            if rowspan > 1 {
                output.push_str(&format!(" table:number-rows-spanned=\"{rowspan}\""));
                for span in &mut next_spans[column..column + colspan] {
                    *span = (*span).max(rowspan - 1);
                }
            }
            output.push('>');
            let mut rendered_content = false;
            for block in cell
                .get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                rendered_content = true;
                render_odt_block(block, document, styles, state, output)?;
            }
            if !rendered_content {
                output.push_str("<text:p/>");
            }
            output.push_str("</table:table-cell>");
            for _ in 1..colspan {
                output.push_str("<table:covered-table-cell/>");
            }
            column += colspan;
        }
        while column < column_count {
            if current_spans[column] > 0 {
                output.push_str("<table:covered-table-cell/>");
            } else {
                output.push_str(
                    "<table:table-cell table:style-name=\"TableCell\" office:value-type=\"string\"><text:p/></table:table-cell>",
                );
            }
            column += 1;
        }
        output.push_str("</table:table-row>");
        row_spans = next_spans;
    }
    output.push_str("</table:table>");
    Ok(())
}

fn cell_span(cell: &Value, name: &str) -> usize {
    cell.pointer(&format!("/attrs/{name}"))
        .and_then(Value::as_u64)
        .unwrap_or(1)
        .clamp(1, 100) as usize
}

fn table_column_widths(rows: &[Value], column_count: usize, document: &EditorDocument) -> Vec<f32> {
    let mut weights = vec![None; column_count];
    for row in rows {
        let mut column = 0usize;
        for cell in row
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let colspan = cell_span(cell, "colspan").min(column_count.saturating_sub(column));
            if colspan == 0 {
                break;
            }
            if let Some(widths) = cell.pointer("/attrs/colwidth").and_then(Value::as_array)
                && widths.len() == colspan
            {
                for (offset, width) in widths.iter().enumerate() {
                    if let Some(width) = width.as_u64().filter(|width| (1..=4_096).contains(width))
                    {
                        weights[column + offset].get_or_insert(width as f32);
                    }
                }
            }
            column += colspan;
        }
        if weights.iter().all(Option::is_some) {
            break;
        }
    }
    let (page_width, _) = page_dimensions_mm(&document.page);
    let available =
        (page_width - document.page.margins_mm.left - document.page.margins_mm.right).max(10.0);
    let weights = weights
        .into_iter()
        .map(|width| width.unwrap_or(100.0))
        .collect::<Vec<_>>();
    let total = weights.iter().sum::<f32>().max(1.0);
    weights
        .into_iter()
        .map(|weight| available * weight / total)
        .collect()
}

fn table_styles(name: &str, widths: &[f32], total_width: f32) -> String {
    let mut output = format!(
        "<style:style style:name=\"{name}\" style:family=\"table\"><style:table-properties style:width=\"{total_width:.3}mm\" table:align=\"margins\"/></style:style>"
    );
    for (index, width) in widths.iter().enumerate() {
        output.push_str(&format!(
            "<style:style style:name=\"{name}.Column{}\" style:family=\"table-column\"><style:table-column-properties style:column-width=\"{width:.3}mm\"/></style:style>",
            index + 1
        ));
    }
    output
}

fn render_odt_inline_nodes(
    nodes: Option<&Vec<Value>>,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
    state: &mut RenderState,
    output: &mut String,
) -> CommandResult<()> {
    for node in nodes.into_iter().flatten() {
        let node_type = node.get("type").and_then(Value::as_str).unwrap_or_default();
        match node_type {
            "text" => render_odt_text(node, styles, output),
            "hardBreak" => output.push_str("<text:line-break/>"),
            "image" | "documentImage" => {
                state.next_image_index += 1;
                let style_name = format!("{}Image{}", state.scope, state.next_image_index);
                let image = render_image(node, document, &style_name)?;
                state.automatic_styles.push_str(&image.automatic_style);
                output.push_str(&image.frame);
            }
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
