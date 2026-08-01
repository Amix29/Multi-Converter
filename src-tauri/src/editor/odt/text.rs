use serde_json::Value;

pub(in crate::editor) fn render_plain_text(value: &Value) -> String {
    let mut output = String::new();
    fn visit(value: &Value, output: &mut String) {
        if let Some(text) = value.get("text").and_then(Value::as_str) {
            output.push_str(text);
        }
        if matches!(value.get("type").and_then(Value::as_str), Some("hardBreak")) {
            output.push('\n');
        }
        if matches!(
            value.get("type").and_then(Value::as_str),
            Some("image" | "documentImage")
        ) {
            let alt = value
                .pointer("/attrs/alt")
                .and_then(Value::as_str)
                .unwrap_or("Image");
            output.push_str(&format!("[{alt}]"));
        }
        for child in value
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            visit(child, output);
        }
        if matches!(
            value.get("type").and_then(Value::as_str),
            Some("paragraph" | "heading" | "listItem" | "tableRow")
        ) {
            output.push('\n');
        }
    }
    visit(value, &mut output);
    output.trim_end().to_string()
}

pub(in crate::editor) fn render_markdown(value: &Value) -> String {
    fn inline(node: &Value) -> String {
        let kind = node.get("type").and_then(Value::as_str).unwrap_or_default();
        if kind == "text" {
            let mut text = node
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .replace('\\', "\\\\")
                .replace('*', "\\*")
                .replace('_', "\\_");
            for mark in node
                .get("marks")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                match mark.get("type").and_then(Value::as_str).unwrap_or_default() {
                    "bold" => text = format!("**{text}**"),
                    "italic" => text = format!("*{text}*"),
                    "strike" => text = format!("~~{text}~~"),
                    "link" => {
                        if let Some(href) = mark.pointer("/attrs/href").and_then(Value::as_str) {
                            text = format!("[{text}]({href})");
                        }
                    }
                    _ => {}
                }
            }
            return text;
        }
        if kind == "hardBreak" {
            return "  \n".to_string();
        }
        if matches!(kind, "image" | "documentImage") {
            let alt = node
                .pointer("/attrs/alt")
                .and_then(Value::as_str)
                .unwrap_or("Image");
            return format!("[{alt}]");
        }
        node.get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(inline)
            .collect()
    }

    fn block(node: &Value, indent: usize) -> String {
        let kind = node.get("type").and_then(Value::as_str).unwrap_or_default();
        let children = node.get("content").and_then(Value::as_array);
        match kind {
            "doc" => children
                .into_iter()
                .flatten()
                .map(|child| block(child, indent))
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n"),
            "heading" => format!(
                "{} {}",
                "#".repeat(
                    node.pointer("/attrs/level")
                        .and_then(Value::as_u64)
                        .unwrap_or(1)
                        .clamp(1, 6) as usize
                ),
                children
                    .into_iter()
                    .flatten()
                    .map(inline)
                    .collect::<String>()
            ),
            "paragraph" => children.into_iter().flatten().map(inline).collect(),
            "bulletList" | "orderedList" => children
                .into_iter()
                .flatten()
                .enumerate()
                .map(|(index, item)| {
                    let marker = if kind == "orderedList" {
                        format!("{}. ", index + 1)
                    } else {
                        "- ".to_string()
                    };
                    format!(
                        "{}{}{}",
                        "  ".repeat(indent),
                        marker,
                        block(item, indent + 1).replace('\n', "\n  ")
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"),
            "listItem" | "blockquote" => children
                .into_iter()
                .flatten()
                .map(|child| block(child, indent))
                .collect::<Vec<_>>()
                .join("\n"),
            "pageBreak" | "horizontalRule" => "---".to_string(),
            "image" | "documentImage" => inline(node),
            "unsupportedObject" => "[Objet incorporé non éditable]".to_string(),
            _ => children
                .into_iter()
                .flatten()
                .map(|child| block(child, indent))
                .collect::<Vec<_>>()
                .join("\n"),
        }
    }

    block(value, 0)
}
