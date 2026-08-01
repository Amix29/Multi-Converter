use super::types::{StyleCatalog, StyleInfo, WriterStyleCatalog};
use super::xml::{XmlNode, xml_escape};
use super::{MAX_STYLES, MAX_XML_DEPTH, NS_FO, NS_STYLE, NS_TEXT};
use crate::editor::document::{CommandResult, EditorDocument, EditorMargins, EditorPageSettings};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};

pub(super) fn collect_styles(root: &XmlNode, catalog: &mut StyleCatalog) -> CommandResult<()> {
    let mut nodes = vec![root];
    root.descendants(&mut nodes);
    for node in nodes {
        if node.is(NS_STYLE, "style") {
            let Some(name) = node.attr(NS_STYLE, "name") else {
                continue;
            };
            if catalog.styles.len() >= MAX_STYLES {
                return Err("ODT_XML_LIMIT:Le document contient trop de styles.".to_string());
            }
            let mut style = StyleInfo {
                parent: node.attr(NS_STYLE, "parent-style-name").map(str::to_string),
                family: node
                    .attr(NS_STYLE, "family")
                    .unwrap_or_default()
                    .to_string(),
                ..StyleInfo::default()
            };
            for child in node.child_nodes() {
                if child.is(NS_STYLE, "text-properties") {
                    collect_property_attributes(child, &mut style.text);
                } else if child.is(NS_STYLE, "paragraph-properties") {
                    collect_property_attributes(child, &mut style.paragraph);
                }
            }
            catalog.styles.insert(name.to_string(), style);
        } else if node.is(NS_TEXT, "list-style") {
            if let Some(name) = node.attr(NS_STYLE, "name")
                && node
                    .child_nodes()
                    .any(|child| child.is(NS_TEXT, "list-level-style-number"))
            {
                catalog.ordered_lists.insert(name.to_string());
            }
        } else if node.is(NS_STYLE, "page-layout") {
            if let Some(name) = node.attr(NS_STYLE, "name")
                && let Some(properties) = node
                    .child_nodes()
                    .find(|child| child.is(NS_STYLE, "page-layout-properties"))
            {
                catalog
                    .page_layouts
                    .insert(name.to_string(), page_settings_from_properties(properties));
            }
        } else if node.is(NS_STYLE, "master-page") && catalog.master_layout.is_none() {
            catalog.master_layout = node.attr(NS_STYLE, "page-layout-name").map(str::to_string);
            catalog.header = node
                .child_nodes()
                .find(|child| child.is(NS_STYLE, "header"))
                .cloned();
            catalog.footer = node
                .child_nodes()
                .find(|child| child.is(NS_STYLE, "footer"))
                .cloned();
        }
    }
    Ok(())
}

fn collect_property_attributes(node: &XmlNode, target: &mut HashMap<String, String>) {
    for ((namespace, name), value) in &node.attrs {
        if namespace == NS_FO || namespace == NS_STYLE {
            target.insert(name.clone(), value.clone());
        }
    }
}

fn page_settings_from_properties(properties: &XmlNode) -> EditorPageSettings {
    let width_mm = parse_length_mm(properties.attr(NS_FO, "page-width")).unwrap_or(210.0);
    let height_mm = parse_length_mm(properties.attr(NS_FO, "page-height")).unwrap_or(297.0);
    let orientation = properties
        .attr(NS_STYLE, "print-orientation")
        .unwrap_or(if width_mm > height_mm {
            "landscape"
        } else {
            "portrait"
        })
        .to_string();
    let format = page_format(width_mm, height_mm);
    EditorPageSettings {
        format,
        orientation,
        margins_mm: EditorMargins {
            top: parse_length_mm(properties.attr(NS_FO, "margin-top")).unwrap_or(25.0),
            right: parse_length_mm(properties.attr(NS_FO, "margin-right")).unwrap_or(20.0),
            bottom: parse_length_mm(properties.attr(NS_FO, "margin-bottom")).unwrap_or(25.0),
            left: parse_length_mm(properties.attr(NS_FO, "margin-left")).unwrap_or(20.0),
        },
        numbering: "bottom-center".to_string(),
    }
}

pub(super) fn default_page_settings() -> EditorPageSettings {
    EditorPageSettings {
        format: "a4".to_string(),
        orientation: "portrait".to_string(),
        margins_mm: EditorMargins {
            top: 25.0,
            right: 20.0,
            bottom: 25.0,
            left: 20.0,
        },
        numbering: "bottom-center".to_string(),
    }
}

fn parse_length_mm(value: Option<&str>) -> Option<f32> {
    let value = value?.trim();
    for (suffix, factor) in [("mm", 1.0), ("cm", 10.0), ("in", 25.4), ("pt", 25.4 / 72.0)] {
        if let Some(number) = value.strip_suffix(suffix) {
            return number
                .trim()
                .parse::<f32>()
                .ok()
                .map(|number| number * factor);
        }
    }
    None
}

fn page_format(width: f32, height: f32) -> String {
    let (short, long) = if width <= height {
        (width, height)
    } else {
        (height, width)
    };
    let candidates = [
        ("a3", 297.0, 420.0),
        ("a4", 210.0, 297.0),
        ("a5", 148.0, 210.0),
        ("letter", 215.9, 279.4),
        ("legal", 215.9, 355.6),
    ];
    candidates
        .into_iter()
        .min_by(|(_, aw, ah), (_, bw, bh)| {
            ((short - aw).abs() + (long - ah).abs())
                .total_cmp(&((short - bw).abs() + (long - bh).abs()))
        })
        .map(|(name, _, _)| name.to_string())
        .unwrap_or_else(|| "a4".to_string())
}

pub(super) fn find_descendant<'a>(
    root: &'a XmlNode,
    namespace: &str,
    name: &str,
) -> Option<&'a XmlNode> {
    if root.is(namespace, name) {
        return Some(root);
    }
    root.child_nodes()
        .find_map(|child| find_descendant(child, namespace, name))
}

pub(super) fn resolved_style(
    name: Option<&str>,
    catalog: &StyleCatalog,
) -> CommandResult<StyleInfo> {
    let Some(name) = name else {
        return Ok(StyleInfo::default());
    };
    let mut visited = HashSet::new();
    resolve_style_recursive(name, catalog, &mut visited, 0)
}

fn resolve_style_recursive(
    name: &str,
    catalog: &StyleCatalog,
    visited: &mut HashSet<String>,
    depth: usize,
) -> CommandResult<StyleInfo> {
    if depth >= MAX_XML_DEPTH || !visited.insert(name.to_string()) {
        return Err("ODT_STYLE_CYCLE:Cycle détecté dans les styles ODT.".to_string());
    }
    let Some(style) = catalog.styles.get(name) else {
        visited.remove(name);
        return Ok(StyleInfo::default());
    };
    let mut resolved = if let Some(parent) = style.parent.as_deref() {
        resolve_style_recursive(parent, catalog, visited, depth + 1)?
    } else {
        StyleInfo::default()
    };
    resolved.family = style.family.clone();
    resolved.text.extend(style.text.clone());
    resolved.paragraph.extend(style.paragraph.clone());
    visited.remove(name);
    Ok(resolved)
}

pub(super) fn marks_from_style(style: &StyleInfo) -> Vec<Value> {
    let mut marks = Vec::new();
    if style.text.get("font-weight").is_some_and(|value| {
        value == "bold" || value.parse::<u16>().is_ok_and(|weight| weight >= 600)
    }) {
        marks.push(json!({ "type": "bold" }));
    }
    if style
        .text
        .get("font-style")
        .is_some_and(|value| value == "italic")
    {
        marks.push(json!({ "type": "italic" }));
    }
    if style
        .text
        .get("text-underline-style")
        .is_some_and(|value| value != "none")
    {
        marks.push(json!({ "type": "underline" }));
    }
    if style
        .text
        .get("text-line-through-style")
        .is_some_and(|value| value != "none")
    {
        marks.push(json!({ "type": "strike" }));
    }
    let mut attrs = Map::new();
    if let Some(value) = style.text.get("color") {
        attrs.insert("color".to_string(), json!(value));
    }
    if let Some(value) = style.text.get("font-size") {
        attrs.insert("fontSize".to_string(), json!(value));
    }
    if let Some(value) = style.text.get("font-name") {
        attrs.insert("fontFamily".to_string(), json!(value));
    }
    if !attrs.is_empty() {
        marks.push(json!({ "type": "textStyle", "attrs": attrs }));
    }
    if let Some(value) = style.text.get("background-color")
        && value != "transparent"
    {
        marks.push(json!({ "type": "highlight", "attrs": { "color": value } }));
    }
    marks
}

pub(super) fn normalize_alignment(value: &str) -> &str {
    match value {
        "start" => "left",
        "end" => "right",
        other => other,
    }
}

pub(super) fn automatic_styles(styles: &WriterStyleCatalog) -> String {
    format!(
        "<style:style style:name=\"PageBreak\" style:family=\"paragraph\" style:parent-style-name=\"Standard\"><style:paragraph-properties fo:break-before=\"page\"/></style:style><style:style style:name=\"Center\" style:family=\"paragraph\"><style:paragraph-properties fo:text-align=\"center\"/></style:style><style:style style:name=\"Right\" style:family=\"paragraph\"><style:paragraph-properties fo:text-align=\"right\"/></style:style><text:list-style style:name=\"BulletList\"><text:list-level-style-bullet text:level=\"1\" text:bullet-char=\"•\"/></text:list-style><text:list-style style:name=\"NumberList\"><text:list-level-style-number text:level=\"1\" style:num-format=\"1\"/></text:list-style>{}",
        styles.declarations
    )
}

pub(super) fn named_styles(styles: &WriterStyleCatalog) -> String {
    format!(
        "<style:default-style style:family=\"paragraph\"><style:text-properties style:font-name=\"Arial\" fo:font-size=\"11pt\"/></style:default-style><style:style style:name=\"Standard\" style:family=\"paragraph\" style:class=\"text\"/><style:style style:name=\"Center\" style:family=\"paragraph\" style:parent-style-name=\"Standard\"><style:paragraph-properties fo:text-align=\"center\"/></style:style><style:style style:name=\"Right\" style:family=\"paragraph\" style:parent-style-name=\"Standard\"><style:paragraph-properties fo:text-align=\"right\"/></style:style>{}",
        styles.declarations
    )
}

pub(super) fn writer_style_catalog(document: &EditorDocument) -> WriterStyleCatalog {
    let mut keys = HashMap::<String, Vec<Value>>::new();
    fn visit(value: &Value, keys: &mut HashMap<String, Vec<Value>>) {
        if value.get("type").and_then(Value::as_str) == Some("text")
            && let Some(marks) = value.get("marks").and_then(Value::as_array)
            && let Some(key) = style_key_from_marks(Some(marks))
        {
            keys.entry(key).or_insert_with(|| marks.clone());
        }
        for child in value
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            visit(child, keys);
        }
    }
    visit(&document.content, &mut keys);
    if let Some(header) = &document.header {
        visit(header, &mut keys);
    }
    if let Some(footer) = &document.footer {
        visit(footer, &mut keys);
    }

    let mut catalog = WriterStyleCatalog::default();
    let mut sorted = keys.into_iter().collect::<Vec<_>>();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    for (key, marks) in sorted {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        key.hash(&mut hasher);
        let name = format!("T{:x}", hasher.finish());
        let properties = odt_text_properties(&marks);
        if properties.is_empty() {
            continue;
        }
        catalog.declarations.push_str(&format!(
            "<style:style style:name=\"{}\" style:family=\"text\"><style:text-properties {properties}/></style:style>",
            xml_escape(&name)
        ));
        catalog.names.insert(key, name);
    }
    catalog
}

pub(super) fn style_key_from_marks(marks: Option<&Vec<Value>>) -> Option<String> {
    let mut parts = marks
        .into_iter()
        .flatten()
        .filter_map(|mark| {
            let kind = mark.get("type").and_then(Value::as_str)?;
            if !matches!(
                kind,
                "bold" | "italic" | "underline" | "strike" | "textStyle" | "highlight"
            ) {
                return None;
            }
            Some(format!(
                "{}:{}",
                kind,
                mark.get("attrs").cloned().unwrap_or(Value::Null)
            ))
        })
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return None;
    }
    parts.sort();
    Some(parts.join("|"))
}

fn odt_text_properties(marks: &[Value]) -> String {
    let mut properties = Vec::new();
    for mark in marks {
        match mark.get("type").and_then(Value::as_str).unwrap_or_default() {
            "bold" => properties.push("fo:font-weight=\"bold\"".to_string()),
            "italic" => properties.push("fo:font-style=\"italic\"".to_string()),
            "underline" => properties.push(
                "style:text-underline-style=\"solid\" style:text-underline-width=\"auto\""
                    .to_string(),
            ),
            "strike" => properties.push("style:text-line-through-style=\"solid\"".to_string()),
            "textStyle" => {
                if let Some(font) = mark.pointer("/attrs/fontFamily").and_then(Value::as_str) {
                    properties.push(format!("style:font-name=\"{}\"", xml_escape(font)));
                }
                if let Some(size) = mark
                    .pointer("/attrs/fontSize")
                    .and_then(Value::as_str)
                    .filter(|value| valid_style_measure(value))
                {
                    properties.push(format!("fo:font-size=\"{}\"", xml_escape(size)));
                }
                if let Some(color) = mark
                    .pointer("/attrs/color")
                    .and_then(Value::as_str)
                    .filter(|value| valid_color(value))
                {
                    properties.push(format!("fo:color=\"{}\"", xml_escape(color)));
                }
            }
            "highlight" => {
                if let Some(color) = mark
                    .pointer("/attrs/color")
                    .and_then(Value::as_str)
                    .filter(|value| valid_color(value))
                {
                    properties.push(format!("fo:background-color=\"{}\"", xml_escape(color)));
                }
            }
            _ => {}
        }
    }
    properties.join(" ")
}

pub(super) fn valid_style_measure(value: &str) -> bool {
    value.len() <= 16
        && value.chars().all(|character| {
            character.is_ascii_digit()
                || matches!(character, '.' | '%' | 'p' | 't' | 'x' | 'e' | 'm')
        })
}

pub(super) fn valid_color(value: &str) -> bool {
    value.len() <= 32
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(character, '#' | '(' | ')' | ',' | '.' | '%' | ' ' | '-')
        })
}
