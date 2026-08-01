use super::*;

pub(in crate::converters) fn convert_text_to_pdf_content(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    content: &str,
) -> Result<()> {
    emit_progress(app, job_id, 35, "Composition du PDF");
    let title = input_path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("Document");
    let pdf = simple_pdf(title, &normalize_pdf_text(content));
    fs::write(output_path, pdf)?;
    emit_progress(app, job_id, 88, "Finalisation du PDF");
    Ok(())
}

pub(in crate::converters) fn normalize_pdf_text(content: &str) -> String {
    content
        .replace('\0', "")
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .chars()
        .filter(|ch| *ch == '\n' || *ch == '\t' || !ch.is_control())
        .collect::<String>()
        .trim_end()
        .to_string()
}

pub(in crate::converters) fn simple_pdf(title: &str, content: &str) -> Vec<u8> {
    let escaped_title = escape_pdf_text(title);
    let lines = wrap_pdf_lines(content, 92);
    let lines_per_page = 52usize;
    let page_count = lines.len().div_ceil(lines_per_page).max(1);
    let page_ids = (0..page_count)
        .map(|index| 4 + index * 2)
        .collect::<Vec<_>>();
    let kids = page_ids
        .iter()
        .map(|id| format!("{id} 0 R"))
        .collect::<Vec<_>>()
        .join(" ");
    let mut objects: Vec<Vec<u8>> = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        format!("<< /Type /Pages /Kids [{}] /Count {} >>", kids, page_count).into_bytes(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    ];

    for (page_index, chunk) in lines.chunks(lines_per_page).enumerate() {
        let page_object_id = 4 + page_index * 2;
        let content_object_id = page_object_id + 1;
        objects.push(format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {} 0 R >>",
            content_object_id
        ).into_bytes());
        let stream = pdf_page_stream(chunk);
        let mut object = format!("<< /Length {} >>\nstream\n", stream.len()).into_bytes();
        object.extend_from_slice(&stream);
        object.extend_from_slice(b"\nendstream");
        objects.push(object);
    }

    let info_object_id = objects.len() + 1;
    objects.push(format!("<< /Title ({}) >>", escaped_title).into_bytes());
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"%PDF-1.4\n");
    let mut offsets = vec![0usize];
    for (index, object) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
        bytes.extend_from_slice(object);
        bytes.extend_from_slice(b"\nendobj\n");
    }
    let xref = bytes.len();
    bytes.extend_from_slice(
        format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes(),
    );
    for offset in offsets.iter().skip(1) {
        bytes.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
    }
    bytes.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R /Info {} 0 R >>\nstartxref\n{}\n%%EOF\n",
            objects.len() + 1,
            info_object_id,
            xref
        )
        .as_bytes(),
    );
    bytes
}

pub(in crate::converters) fn wrap_pdf_lines(content: &str, max_chars: usize) -> Vec<String> {
    let mut output = Vec::new();
    for line in content.lines() {
        if line.is_empty() {
            output.push(String::new());
            continue;
        }
        let mut current = String::new();
        for word in line.split_whitespace() {
            let needs_space = !current.is_empty();
            if current.chars().count() + word.chars().count() + usize::from(needs_space) > max_chars
                && !current.is_empty()
            {
                output.push(current);
                current = String::new();
            }
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
        }
        output.push(current);
    }
    if output.is_empty() {
        output.push(String::new());
    }
    output
}

pub(in crate::converters) fn pdf_page_stream(lines: &[String]) -> Vec<u8> {
    let mut stream = Vec::from("BT /F1 11 Tf 48 790 Td 14 TL ".as_bytes());
    for (index, line) in lines.iter().enumerate() {
        if index > 0 {
            stream.extend_from_slice(b"T* ");
        }
        stream.push(b'(');
        stream.extend_from_slice(&escape_pdf_text_bytes(line));
        stream.extend_from_slice(b") Tj ");
    }
    stream.extend_from_slice(b"ET");
    stream
}

pub(in crate::converters) fn escape_pdf_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

pub(in crate::converters) fn escape_pdf_text_bytes(value: &str) -> Vec<u8> {
    let (encoded, _, _) = WINDOWS_1252.encode(value);
    let mut output = Vec::new();
    for byte in encoded.as_ref() {
        match *byte {
            b'\\' | b'(' | b')' => {
                output.push(b'\\');
                output.push(*byte);
            }
            b'\n' => output.extend_from_slice(b"\\n"),
            b'\r' => output.extend_from_slice(b"\\r"),
            b'\t' => output.extend_from_slice(b"\\t"),
            0x20..=0x7e => output.push(*byte),
            other => output.extend_from_slice(format!("\\{:03o}", other).as_bytes()),
        }
    }
    output
}
