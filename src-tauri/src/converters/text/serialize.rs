use super::*;

pub(in crate::converters) fn to_plain_text(content: &str, source_format: &str) -> String {
    if source_format == "html" {
        html_to_visible_text(content)
    } else {
        content.to_string()
    }
}

pub(in crate::converters) fn html_to_visible_text(content: &str) -> String {
    let mut cleaned = content.to_string();
    for tag in ["head", "script", "style", "noscript"] {
        loop {
            let lower = cleaned.to_ascii_lowercase();
            let Some(start) = lower.find(&format!("<{tag}")) else {
                break;
            };
            let Some(rel_end) = lower[start..].find(&format!("</{tag}>")) else {
                break;
            };
            let end = start + rel_end + tag.len() + 3;
            cleaned.replace_range(start..end, "");
        }
    }
    cleaned = cleaned
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</p>", "\n")
        .replace("</div>", "\n")
        .replace("</li>", "\n")
        .replace("</tr>", "\n");
    html_escape::decode_html_entities(&cleaned.replace_xml_tags())
        .replace('\u{a0}', " ")
        .split('\n')
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub(in crate::converters) fn to_markdown(content: &str, source_format: &str) -> String {
    let plain = to_plain_text(content, source_format);
    if source_format == "pdf" {
        pdf_text_to_markdown(&plain)
    } else {
        plain
    }
}

pub(in crate::converters) fn pdf_text_to_markdown(content: &str) -> String {
    let normalized = content.replace('\u{c}', "\n\n---\n\n");
    let lines = normalized.lines().collect::<Vec<_>>();
    let mut output = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index].trim();
        if line.is_empty() {
            if output.last().is_some_and(|item: &String| !item.is_empty()) {
                output.push(String::new());
            }
            index += 1;
            continue;
        }

        if let Some(first_row) = split_pdf_table_columns(line) {
            let column_count = first_row.len();
            let mut rows = vec![first_row];
            let mut next = index + 1;
            while next < lines.len() {
                while next < lines.len() && lines[next].trim().is_empty() {
                    next += 1;
                }
                if next >= lines.len() {
                    break;
                }
                let Some(row) = split_pdf_table_columns(lines[next].trim()) else {
                    break;
                };
                if row.len() != column_count {
                    break;
                }
                rows.push(row);
                next += 1;
            }

            if rows.len() >= 2 {
                output.push(markdown_table_row(&rows[0]));
                output.push(markdown_table_row(&vec!["---".to_string(); column_count]));
                output.extend(rows.iter().skip(1).map(|row| markdown_table_row(row)));
                output.push(String::new());
                index = next;
                continue;
            }
        }

        output.push(line.to_string());
        index += 1;
    }

    while output.last().is_some_and(String::is_empty) {
        output.pop();
    }
    output.join("\n")
}

pub(in crate::converters) fn split_pdf_table_columns(line: &str) -> Option<Vec<String>> {
    let mut columns = Vec::new();
    let mut current = String::new();
    let mut whitespace = 0usize;

    for ch in line.chars() {
        if ch == '\t' || ch == ' ' {
            whitespace += 1;
            continue;
        }

        if whitespace > 0 {
            if whitespace >= 2 || line.contains('\t') {
                if !current.trim().is_empty() {
                    columns.push(current.trim().to_string());
                    current.clear();
                }
            } else {
                current.push(' ');
            }
            whitespace = 0;
        }
        current.push(ch);
    }

    if !current.trim().is_empty() {
        columns.push(current.trim().to_string());
    }
    (columns.len() >= 2).then_some(columns)
}

pub(in crate::converters) fn markdown_table_row(columns: &[String]) -> String {
    format!(
        "| {} |",
        columns
            .iter()
            .map(|column| column.replace('|', "\\|"))
            .collect::<Vec<_>>()
            .join(" | ")
    )
}

pub(in crate::converters) fn to_html(content: &str, source_format: &str) -> String {
    if source_format == "html" {
        return content.to_string();
    }
    let paragraphs = escape_html(content)
        .split("\n\n")
        .map(|paragraph| format!("<p>{}</p>", paragraph.replace('\n', "<br>")))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "<!doctype html>\n<html lang=\"fr\">\n<head><meta charset=\"utf-8\"><title>Document</title></head>\n<body>\n{}\n</body>\n</html>\n",
        paragraphs
    )
}

pub(in crate::converters) fn to_csv(content: &str, source_format: &str) -> String {
    if source_format == "csv" {
        return content.to_string();
    }
    content
        .lines()
        .map(|line| format!("\"{}\"", line.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join("\n")
}

pub(in crate::converters) fn write_utf8_csv(output_path: &Path, content: &str) -> Result<()> {
    let mut file = File::create(output_path)?;
    file.write_all(b"\xef\xbb\xbf")?;
    file.write_all(content.as_bytes())?;
    Ok(())
}

pub(in crate::converters) fn to_rtf(content: &str, source_format: &str) -> String {
    let text = escape_rtf_text(&to_plain_text(content, source_format));
    format!(
        "{{\\rtf1\\ansi\\ansicpg1252\\deff0\n{{\\fonttbl{{\\f0 Calibri;}}}}\n\\f0\\fs22\n{}\n}}\n",
        text
    )
}

pub(in crate::converters) fn escape_rtf_text(value: &str) -> String {
    let mut output = String::new();
    for ch in value.chars() {
        match ch {
            '\\' => output.push_str("\\\\"),
            '{' => output.push_str("\\{"),
            '}' => output.push_str("\\}"),
            '\n' => output.push_str("\\par\n"),
            '\r' => {}
            '\t' => output.push_str("\\tab "),
            ch if ch.is_ascii() => output.push(ch),
            ch => {
                let mut units = [0u16; 2];
                for unit in ch.encode_utf16(&mut units) {
                    output.push_str(&format!("\\u{}?", *unit as i16));
                }
            }
        }
    }
    output
}

pub(in crate::converters) fn to_json(content: &str, source_format: &str) -> Result<String> {
    if source_format == "json" {
        let value: serde_json::Value = serde_json::from_str(content)?;
        return Ok(serde_json::to_string_pretty(&value)?);
    }
    if source_format == "csv" {
        let mut reader = csv::ReaderBuilder::new()
            .flexible(true)
            .from_reader(content.as_bytes());
        let headers = reader
            .headers()?
            .iter()
            .enumerate()
            .map(|(index, header)| {
                let trimmed = header.trim();
                if trimmed.is_empty() {
                    format!("col{}", index + 1)
                } else {
                    trimmed.to_string()
                }
            })
            .collect::<Vec<_>>();
        let mut rows = Vec::new();
        for record in reader.records() {
            let record = record?;
            let mut object = serde_json::Map::new();
            for (index, cell) in record.iter().enumerate() {
                object.insert(
                    headers
                        .get(index)
                        .cloned()
                        .unwrap_or_else(|| format!("col{}", index + 1)),
                    serde_json::Value::String(cell.trim().to_string()),
                );
            }
            rows.push(serde_json::Value::Object(object));
        }
        return Ok(serde_json::to_string_pretty(&rows)?);
    }
    Ok(serde_json::to_string_pretty(
        &serde_json::json!({ "content": content }),
    )?)
}

pub(in crate::converters) fn to_xml(content: &str, source_format: &str) -> String {
    if source_format == "xml" {
        return content.to_string();
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<document>\n  <content>{}</content>\n</document>\n",
        escape_xml(content)
    )
}

pub(in crate::converters) fn write_docx(
    output_path: &Path,
    content: &str,
    source_format: &str,
) -> Result<()> {
    let mut zip = zip::ZipWriter::new(File::create(output_path)?);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let paragraphs = to_plain_text(content, source_format)
        .lines()
        .map(|line| {
            format!(
                "<w:p><w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
                escape_xml(line)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    zip.start_file("[Content_Types].xml", options)?;
    zip.write_all(b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>")?;
    zip.add_directory("_rels/", options)?;
    zip.start_file("_rels/.rels", options)?;
    zip.write_all(b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>")?;
    zip.add_directory("word/", options)?;
    zip.start_file("word/document.xml", options)?;
    zip.write_all(format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>{}<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/></w:sectPr></w:body></w:document>", paragraphs).as_bytes())?;
    zip.finish()?;
    Ok(())
}

pub(in crate::converters) fn write_odt(
    output_path: &Path,
    content: &str,
    source_format: &str,
) -> Result<()> {
    let mut zip = zip::ZipWriter::new(File::create(output_path)?);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let paragraphs = to_plain_text(content, source_format)
        .lines()
        .map(|line| format!("<text:p>{}</text:p>", escape_xml(line)))
        .collect::<Vec<_>>()
        .join("");
    zip.start_file("mimetype", stored)?;
    zip.write_all(b"application/vnd.oasis.opendocument.text")?;
    zip.add_directory("META-INF/", deflated)?;
    zip.start_file("META-INF/manifest.xml", deflated)?;
    zip.write_all(b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"><manifest:file-entry manifest:media-type=\"application/vnd.oasis.opendocument.text\" manifest:full-path=\"/\"/><manifest:file-entry manifest:media-type=\"text/xml\" manifest:full-path=\"content.xml\"/></manifest:manifest>")?;
    zip.start_file("content.xml", deflated)?;
    zip.write_all(format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><office:document-content xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" office:version=\"1.2\"><office:body><office:text>{}</office:text></office:body></office:document-content>", paragraphs).as_bytes())?;
    zip.finish()?;
    Ok(())
}

pub(in crate::converters) fn write_epub(
    output_path: &Path,
    content: &str,
    source_format: &str,
) -> Result<()> {
    let mut zip = zip::ZipWriter::new(File::create(output_path)?);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let html = to_html(content, source_format).replace("<!doctype html>", "");
    let identifier = format!("urn:uuid:{}", uuid::Uuid::new_v4());
    zip.start_file("mimetype", stored)?;
    zip.write_all(b"application/epub+zip")?;
    zip.add_directory("META-INF/", deflated)?;
    zip.start_file("META-INF/container.xml", deflated)?;
    zip.write_all(b"<?xml version=\"1.0\"?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>")?;
    zip.add_directory("OEBPS/", deflated)?;
    zip.start_file("OEBPS/chapter.xhtml", deflated)?;
    zip.write_all(format!("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n{}", html).as_bytes())?;
    zip.start_file("OEBPS/content.opf", deflated)?;
    zip.write_all(format!("<?xml version=\"1.0\" encoding=\"utf-8\"?><package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"bookid\"><metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:identifier id=\"bookid\">{}</dc:identifier><dc:title>Document</dc:title><dc:language>fr</dc:language></metadata><manifest><item id=\"chapter\" href=\"chapter.xhtml\" media-type=\"application/xhtml+xml\"/></manifest><spine><itemref idref=\"chapter\"/></spine></package>", identifier).as_bytes())?;
    zip.finish()?;
    Ok(())
}

pub(in crate::converters) fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub(in crate::converters) fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
