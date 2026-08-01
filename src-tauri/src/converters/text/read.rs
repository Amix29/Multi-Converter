use super::archive::{TEXT_ARCHIVE_LIMITS, open_validated_text_archive};
use super::*;

const MAX_DOCX_SECONDARY_PARTS: usize = 512;

pub(in crate::converters) fn assert_readable_document_content(
    input_path: &Path,
    source_format: &str,
    content: &str,
) -> Result<()> {
    if !content.is_empty() {
        return Ok(());
    }
    if fs::metadata(input_path)?.len() == 0 {
        return Err(ConvertError::Message(
            "Le fichier source est vide : aucun contenu à convertir.".to_string(),
        ));
    }
    if source_format == "pdf" {
        return Err(ConvertError::Message(
            "Aucun texte extractible trouvé dans ce PDF.".to_string(),
        ));
    }
    Err(ConvertError::Message(
        "Aucun texte lisible trouvé dans ce fichier. Vérifiez son contenu ou son encodage."
            .to_string(),
    ))
}

pub(in crate::converters) fn read_document_text(
    input_path: &Path,
    source_format: &str,
) -> Result<String> {
    ensure_integrated_memory_budget(input_path, "document")?;
    match source_format {
        "pdf" => Ok(pdf_extract::extract_text(input_path)
            .map_err(|err| ConvertError::Message(err.to_string()))?
            .trim()
            .to_string()),
        "docx" => read_docx_text(input_path),
        "odt" => read_zip_text(input_path, "content.xml", "</text:p>"),
        "epub" => read_epub_text(input_path),
        "html" => Ok(html_to_visible_text(&read_text_file(input_path)?)),
        "rtf" => Ok(strip_rtf(&read_text_file(input_path)?)),
        _ => read_text_file(input_path),
    }
}

pub(in crate::converters) fn read_text_file(input_path: &Path) -> Result<String> {
    ensure_integrated_memory_budget(input_path, "texte")?;
    let buffer = fs::read(input_path)?;
    Ok(decode_text_buffer(&buffer))
}

pub(in crate::converters) fn ensure_integrated_memory_budget(
    input_path: &Path,
    label: &str,
) -> Result<()> {
    let size = fs::metadata(input_path)?.len();
    if size > INTEGRATED_MEMORY_LIMIT_BYTES {
        return Err(ConvertError::Message(format!(
            "Ce fichier {label} est trop volumineux pour le moteur intégré actuel (limite: 512 Mo). Utilisez un moteur externe adapté ou un fichier plus petit."
        )));
    }
    Ok(())
}

pub(in crate::converters) fn decode_text_buffer(buffer: &[u8]) -> String {
    if buffer.is_empty() {
        return String::new();
    }
    if buffer.starts_with(&[0xff, 0xfe]) {
        return decode_utf16_bytes(&buffer[2..], true);
    }
    if buffer.starts_with(&[0xfe, 0xff]) {
        return decode_utf16_bytes(&buffer[2..], false);
    }
    if buffer.starts_with(&[0xef, 0xbb, 0xbf]) {
        return String::from_utf8_lossy(&buffer[3..])
            .trim_start_matches('\u{feff}')
            .to_string();
    }
    if looks_like_utf16_le(buffer) {
        return decode_utf16_bytes(buffer, true);
    }
    if looks_like_utf16_be(buffer) {
        return decode_utf16_bytes(buffer, false);
    }
    match std::str::from_utf8(buffer) {
        Ok(value) => value.trim_start_matches('\u{feff}').to_string(),
        Err(_) => {
            let (value, _, _) = WINDOWS_1252.decode(buffer);
            value.trim_start_matches('\u{feff}').to_string()
        }
    }
}

pub(in crate::converters) fn decode_utf16_bytes(buffer: &[u8], little_endian: bool) -> String {
    let mut values = Vec::new();
    for chunk in buffer.chunks_exact(2) {
        values.push(if little_endian {
            u16::from_le_bytes([chunk[0], chunk[1]])
        } else {
            u16::from_be_bytes([chunk[0], chunk[1]])
        });
    }
    String::from_utf16_lossy(&values)
        .trim_start_matches('\u{feff}')
        .to_string()
}

pub(in crate::converters) fn looks_like_utf16_le(buffer: &[u8]) -> bool {
    looks_like_utf16(buffer, 1)
}

pub(in crate::converters) fn looks_like_utf16_be(buffer: &[u8]) -> bool {
    looks_like_utf16(buffer, 0)
}

pub(in crate::converters) fn looks_like_utf16(buffer: &[u8], nul_offset: usize) -> bool {
    if buffer.len() < 4 || !buffer.len().is_multiple_of(2) {
        return false;
    }
    let pairs = buffer.len() / 2;
    let nul_count = buffer
        .chunks_exact(2)
        .filter(|chunk| chunk[nul_offset] == 0)
        .count();
    nul_count * 100 / pairs >= 60
}

pub(in crate::converters) fn read_docx_text(input_path: &Path) -> Result<String> {
    let mut archive = open_validated_text_archive(input_path, "DOCX", true, TEXT_ARCHIVE_LIMITS)?;
    let mut parts = Vec::new();
    let mut total_bytes = 0u64;
    let preferred = [
        "word/document.xml",
        "word/footnotes.xml",
        "word/endnotes.xml",
        "word/comments.xml",
    ];

    for name in preferred {
        if let Ok(mut entry) = archive.by_name(name) {
            append_zip_xml_text_part(&mut entry, &mut parts, &mut total_bytes, "DOCX")?;
        }
    }

    let mut secondary_names = Vec::new();
    for index in 0..archive.len() {
        let file = archive.by_index(index)?;
        let name = file.name().to_ascii_lowercase();
        if (name.starts_with("word/header") || name.starts_with("word/footer"))
            && name.ends_with(".xml")
        {
            secondary_names.push(file.name().to_string());
        }
    }
    secondary_names.sort();
    if secondary_names.len() > MAX_DOCX_SECONDARY_PARTS {
        return Err(ConvertError::Message(
            "Le fichier DOCX contient trop de parties d’en-tête ou de pied de page.".to_string(),
        ));
    }
    for name in secondary_names {
        let mut entry = archive.by_name(&name)?;
        append_zip_xml_text_part(&mut entry, &mut parts, &mut total_bytes, "DOCX")?;
    }

    Ok(docx_xml_to_visible_text(&parts.join("\n\n")))
}

pub(in crate::converters) fn append_zip_xml_text_part<R: Read>(
    entry: &mut zip::read::ZipFile<'_, R>,
    parts: &mut Vec<String>,
    total_bytes: &mut u64,
    label: &str,
) -> Result<()> {
    ensure_extracted_text_budget(entry.size(), label)?;
    let remaining = MAX_EXTRACTED_TEXT_BYTES.saturating_sub(*total_bytes);
    if remaining == 0 {
        ensure_extracted_text_budget(MAX_EXTRACTED_TEXT_BYTES + 1, label)?;
    }
    let mut content = String::new();
    entry.take(remaining + 1).read_to_string(&mut content)?;
    *total_bytes = total_bytes.saturating_add(content.len() as u64);
    ensure_extracted_text_budget(*total_bytes, label)?;
    parts.push(content);
    Ok(())
}

pub(in crate::converters) fn docx_xml_to_visible_text(content: &str) -> String {
    zip_xml_to_visible_text(
        content,
        &[
            ("</w:p>", "\n"),
            ("</w:tc>", "\t"),
            ("</w:tr>", "\n"),
            ("<w:tab/>", "\t"),
            ("<w:tab />", "\t"),
            ("<w:br/>", "\n"),
            ("<w:br />", "\n"),
            ("<w:cr/>", "\n"),
            ("<w:cr />", "\n"),
        ],
    )
}

pub(in crate::converters) fn read_zip_text(
    input_path: &Path,
    name: &str,
    paragraph_tag: &str,
) -> Result<String> {
    let mut archive =
        open_validated_text_archive(input_path, "document", false, TEXT_ARCHIVE_LIMITS)?;
    let mut content = String::new();
    let mut entry = archive.by_name(name)?;
    ensure_extracted_text_budget(entry.size(), "document")?;
    (&mut entry)
        .take(MAX_EXTRACTED_TEXT_BYTES + 1)
        .read_to_string(&mut content)?;
    ensure_extracted_text_budget(content.len() as u64, "document")?;
    Ok(zip_xml_to_visible_text(&content, &[(paragraph_tag, "\n")]))
}

pub(in crate::converters) fn zip_xml_to_visible_text(
    content: &str,
    replacements: &[(&str, &str)],
) -> String {
    let mut normalized = content.to_string();
    for (from, to) in replacements {
        normalized = normalized.replace(from, to);
    }
    normalized = normalized
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("<br>", "\n");
    html_escape::decode_html_entities(&normalized)
        .replace_xml_tags()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

pub(in crate::converters) trait StripXmlTags {
    fn replace_xml_tags(&self) -> String;
}

impl StripXmlTags for str {
    fn replace_xml_tags(&self) -> String {
        let mut result = String::new();
        let mut in_tag = false;
        for ch in self.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => result.push(ch),
                _ => {}
            }
        }
        result
    }
}

pub(in crate::converters) fn read_epub_text(input_path: &Path) -> Result<String> {
    let mut archive = open_validated_text_archive(input_path, "ePub", false, TEXT_ARCHIVE_LIMITS)?;
    let mut parts = Vec::new();
    let mut total_bytes = 0u64;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index)?;
        let name = file.name().to_ascii_lowercase();
        if name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm") {
            ensure_extracted_text_budget(file.size(), "ePub")?;
            let remaining = MAX_EXTRACTED_TEXT_BYTES.saturating_sub(total_bytes);
            if remaining == 0 {
                ensure_extracted_text_budget(MAX_EXTRACTED_TEXT_BYTES + 1, "ePub")?;
            }
            let mut content = String::new();
            (&mut file)
                .take(remaining + 1)
                .read_to_string(&mut content)?;
            total_bytes = total_bytes.saturating_add(content.len() as u64);
            ensure_extracted_text_budget(total_bytes, "ePub")?;
            parts.push(content);
        }
    }
    Ok(html_to_visible_text(&parts.join("\n\n")))
}

pub(in crate::converters) fn ensure_extracted_text_budget(size: u64, label: &str) -> Result<()> {
    if size > MAX_EXTRACTED_TEXT_BYTES {
        return Err(ConvertError::Message(format!(
            "Le contenu décompressé du fichier {label} est trop volumineux pour le moteur intégré actuel."
        )));
    }
    Ok(())
}

pub(in crate::converters) fn strip_rtf(content: &str) -> String {
    let mut result = String::new();
    let mut group_depth = 0usize;
    let mut chars = content.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '{' => group_depth += 1,
            '}' => group_depth = group_depth.saturating_sub(1),
            '\\' => match chars.peek().copied() {
                Some('\'') => {
                    chars.next();
                    let hex = [chars.next().unwrap_or('0'), chars.next().unwrap_or('0')]
                        .iter()
                        .collect::<String>();
                    if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                        let bytes = [byte];
                        let (value, _, _) = WINDOWS_1252.decode(&bytes);
                        result.push_str(&value);
                    }
                }
                Some('u') => {
                    chars.next();
                    let mut number = String::new();
                    if matches!(chars.peek(), Some('-')) {
                        number.push(chars.next().unwrap_or('-'));
                    }
                    while chars.peek().is_some_and(|item| item.is_ascii_digit()) {
                        number.push(chars.next().unwrap_or_default());
                    }
                    if chars.peek().is_some_and(|item| item.is_whitespace()) {
                        chars.next();
                    }
                    if let Ok(value) = number.parse::<i32>() {
                        let unit = value as i16 as u16;
                        if let Some(decoded) =
                            char::decode_utf16([unit]).next().and_then(|item| item.ok())
                        {
                            result.push(decoded);
                        }
                    }
                    chars.next();
                }
                Some('\n') | Some('\r') => {
                    chars.next();
                }
                Some(item) if item.is_ascii_alphabetic() => {
                    let mut word = String::new();
                    while chars.peek().is_some_and(|item| item.is_ascii_alphabetic()) {
                        word.push(chars.next().unwrap_or_default());
                    }
                    while chars
                        .peek()
                        .is_some_and(|item| item.is_ascii_digit() || *item == '-')
                    {
                        chars.next();
                    }
                    if chars.peek().is_some_and(|item| item.is_whitespace()) {
                        chars.next();
                    }
                    if word == "par" || word == "line" {
                        result.push('\n');
                    }
                }
                Some(other) => {
                    chars.next();
                    if group_depth > 0 && matches!(other, '\\' | '{' | '}') {
                        result.push(other);
                    }
                }
                None => {}
            },
            ch => {
                if group_depth > 0 {
                    result.push(ch);
                }
            }
        }
    }
    result.trim().to_string()
}
