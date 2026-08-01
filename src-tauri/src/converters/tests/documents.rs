use super::*;

#[cfg(target_os = "windows")]
#[test]
fn libreoffice_conversions_prefer_the_synchronous_console_launcher() {
    let dir = tempfile::tempdir().unwrap();
    let configured = dir.path().join("soffice.exe");
    let console = dir.path().join("soffice.com");
    fs::write(&configured, b"exe").unwrap();
    assert_eq!(libreoffice_conversion_launcher(&configured), configured);
    fs::write(&console, b"com").unwrap();
    assert_eq!(libreoffice_conversion_launcher(&configured), console);
}

#[test]
fn text_encodings_decode_utf8_utf16_and_windows_1252() {
    assert_eq!(decode_text_buffer(b"\xef\xbb\xbfbonjour"), "bonjour");
    assert_eq!(decode_text_buffer(&[0xff, 0xfe, b'o', 0, b'k', 0]), "ok");
    assert_eq!(decode_text_buffer(&[b'o', 0, b'k', 0]), "ok");
    assert_eq!(decode_text_buffer(&[0xE9]), "é");
}

#[test]
fn rtf_output_preserves_non_ascii_text() {
    let rtf = to_rtf("J’ai déposé un fichier aperçu façade.", "txt");
    assert!(rtf.contains("\\ansicpg1252"));
    assert!(rtf.contains("\\u8217?"));
    assert!(rtf.contains("\\u233?"));
    assert!(rtf.contains("\\u231?"));
    assert!(!rtf.contains("Jâ"));
}

#[test]
fn rtf_reader_decodes_hex_and_unicode_escapes() {
    assert_eq!(strip_rtf("{\\rtf1\\ansi caf\\'e9 \\u233?}"), "café é");
}

#[test]
fn document_serializers_include_source_content() {
    let content = "PDFTEXTMARKERPAGEONE2026\nPDFTEXTMARKERPAGETWO2026";
    assert!(to_html(content, "txt").contains("PDFTEXTMARKERPAGEONE2026"));
    assert!(to_rtf(content, "txt").contains("PDFTEXTMARKERPAGETWO2026"));
    assert!(
        to_json(content, "txt")
            .unwrap()
            .contains("PDFTEXTMARKERPAGEONE2026")
    );
    assert!(to_xml(content, "txt").contains("PDFTEXTMARKERPAGETWO2026"));
}

#[test]
fn complex_docx_extracts_text_for_layoutless_targets() {
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("complex.docx");
    write_complex_docx_fixture(&input);

    let content = read_document_text(&input, "docx").unwrap();
    for expected in [
        "Titre DOCX complexe",
        "Cellule tableau A",
        "Cellule tableau B",
        "Texte après image et modèle 3D",
        "En-tête utile",
        "Pied de page utile",
    ] {
        assert!(
            content.contains(expected),
            "complex DOCX extraction lost {expected:?}: {content:?}"
        );
    }

    for target_format in ["txt", "md", "csv", "json", "xml"] {
        let output = dir.path().join(format!("complex.{target_format}"));
        write_text_content_file(&output, "docx", target_format, &content)
            .unwrap_or_else(|error| panic!("DOCX -> {target_format} should write: {error}"));
        let readable = decode_text_buffer(&fs::read(&output).unwrap());

        assert!(
            readable.contains("Titre DOCX complexe"),
            "DOCX -> {target_format} lost title: {readable:?}"
        );
        assert!(
            readable.contains("Cellule tableau A"),
            "DOCX -> {target_format} lost table text: {readable:?}"
        );
        assert!(
            readable.contains("Texte après image et modèle 3D"),
            "DOCX -> {target_format} lost body text: {readable:?}"
        );
    }
}

#[test]
fn complex_pdf_with_table_image_and_signature_converts_to_markdown() {
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("complex.pdf");
    fs::write(&input, complex_pdf_fixture()).unwrap();

    let content = read_document_text(&input, "pdf").unwrap();
    let markdown = to_markdown(&content, "pdf");

    assert!(
        markdown.contains("Complex PDF report"),
        "title missing: {markdown:?}"
    );
    assert!(
        markdown.contains("| Item | Quantity | Price |"),
        "table header was not converted: {markdown:?}"
    );
    assert!(
        markdown.contains("| Camera | 2 | 450 EUR |"),
        "table row was not converted: {markdown:?}"
    );
    assert!(
        markdown.contains("Signature: Approved by Alex"),
        "signature label missing: {markdown:?}"
    );
}

#[test]
#[ignore = "full conversion matrix is run by npm run test:conversions"]
fn conversion_matrix_document_outputs_preserve_french_characters() {
    let source_formats = [
        "pdf", "txt", "md", "html", "csv", "json", "xml", "rtf", "docx", "odt", "epub",
    ];
    let marker = "J’ai déjà testé façade, coût, Noël, élève, cœur et €.";

    for source_format in source_formats {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join(format!(
            "source.{}",
            extension_for_test_source(source_format)
        ));
        write_document_fixture(&input, source_format, marker);
        let source_content = read_document_text(&input, source_format).unwrap();
        assert_text_is_clean(&source_content, source_format, "read");

        for target in crate::registry::get_targets_for_extension(source_format)
            .into_iter()
            .filter(|target| target.category_id == "documents")
        {
            let output = dir.path().join(format!(
                "{}-to-{}.{}",
                source_format, target.format, target.extension
            ));
            write_document_target(
                &output,
                source_format,
                &target.format,
                &source_content,
                marker,
            );
            let readable = read_document_target(&output, &target.format);
            assert_text_is_clean(&readable, source_format, &format!("to {}", target.format));
        }
    }
}

#[test]
fn csv_outputs_are_utf8_bom_tagged_for_spreadsheet_detection() {
    let dir = tempfile::tempdir().unwrap();
    let output = dir.path().join("accented.csv");
    let content = to_csv("J’ai déjà testé façade.", "txt");

    write_utf8_csv(&output, &content).unwrap();

    let bytes = fs::read(&output).unwrap();
    assert!(bytes.starts_with(b"\xef\xbb\xbf"));
    let decoded = decode_text_buffer(&bytes);
    assert!(decoded.contains("J’ai déjà testé façade."));
    assert!(!decoded.contains("Jâ"));
    assert!(!decoded.contains("Ã"));
}

#[test]
fn csv_to_json_handles_quoted_commas() {
    let json = to_json("name,note\nAlice,\"un, deux\"\nBob,\"trois\"", "csv").unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();

    assert_eq!(value[0]["name"], "Alice");
    assert_eq!(value[0]["note"], "un, deux");
    assert_eq!(value[1]["note"], "trois");
}

pub(super) fn extension_for_test_source(source_format: &str) -> &'static str {
    match source_format {
        "jpg" => "jpg",
        "gif" => "gif",
        "svg" => "svg",
        "webp" => "webp",
        "tiff" => "tiff",
        "bmp" => "bmp",
        "ico" => "ico",
        "mp3" => "mp3",
        "m4a" => "m4a",
        "flac" => "flac",
        "wav" => "wav",
        "ogg" => "ogg",
        "wma" => "wma",
        "opus" => "opus",
        "aiff" => "aiff",
        "alac" => "alac",
        "ac3" => "ac3",
        "mp2" => "mp2",
        "amr" => "amr",
        "au" => "au",
        "caf" => "caf",
        "mp4" => "mp4",
        "mkv" => "mkv",
        "webm" => "webm",
        "mov" => "mov",
        "avi" => "avi",
        "wmv" => "wmv",
        "3gp" => "3gp",
        "mts" => "mts",
        "mpeg2" => "mpg",
        "ogv" => "ogv",
        "md" => "md",
        "html" => "html",
        "csv" => "csv",
        "json" => "json",
        "xml" => "xml",
        "rtf" => "rtf",
        "docx" => "docx",
        "odt" => "odt",
        "epub" => "epub",
        "pdf" => "pdf",
        _ => "txt",
    }
}

pub(super) fn write_image_fixture(path: &Path, source_format: &str) {
    if source_format == "gif" {
        fs::write(path, one_frame_gif()).unwrap();
        return;
    }
    if source_format == "svg" {
        fs::write(
                path,
                r##"<svg xmlns="http://www.w3.org/2000/svg" width="12" height="10"><rect width="12" height="10" fill="#f97316"/><circle cx="7" cy="5" r="3" fill="#111827"/></svg>"##,
            )
            .unwrap();
        return;
    }

    let image = image::DynamicImage::ImageRgba8(image::RgbaImage::from_fn(12, 10, |x, y| {
        image::Rgba([
            (x * 17) as u8,
            (y * 19) as u8,
            120,
            if (x + y) % 3 == 0 { 180 } else { 255 },
        ])
    }));
    let fixture = if source_format == "ico" {
        fit_ico_image(image)
    } else {
        image
    };
    fixture
        .write_to(
            &mut File::create(path).unwrap(),
            image_format_for_target(source_format).unwrap(),
        )
        .unwrap();
}

pub(super) fn read_test_image(path: &Path, source_format: &str) -> image::DynamicImage {
    if source_format == "svg" {
        read_svg_image(path).unwrap()
    } else {
        image::ImageReader::open(path)
            .unwrap()
            .with_guessed_format()
            .unwrap()
            .decode()
            .unwrap()
    }
}

pub(super) fn write_document_fixture(path: &Path, source_format: &str, marker: &str) {
    match source_format {
        "pdf" => fs::write(path, simple_pdf("source.pdf", marker)).unwrap(),
        "html" => fs::write(path, to_html(marker, "txt")).unwrap(),
        "csv" => write_utf8_csv(path, &format!("titre,note\nfixture,\"{}\"", marker)).unwrap(),
        "json" => fs::write(
            path,
            serde_json::to_string_pretty(&serde_json::json!({ "note": marker })).unwrap(),
        )
        .unwrap(),
        "xml" => fs::write(
            path,
            format!(
                "<?xml version=\"1.0\" encoding=\"utf-8\"?><document><note>{}</note></document>",
                escape_xml(marker)
            ),
        )
        .unwrap(),
        "rtf" => fs::write(path, to_rtf(marker, "txt")).unwrap(),
        "docx" => write_docx(path, marker, "txt").unwrap(),
        "odt" => write_odt(path, marker, "txt").unwrap(),
        "epub" => write_epub(path, marker, "txt").unwrap(),
        _ => fs::write(path, marker).unwrap(),
    }
}

fn write_complex_docx_fixture(path: &Path) {
    let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("[Content_Types].xml", options).unwrap();
    zip.write_all(b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Default Extension=\"png\" ContentType=\"image/png\"/><Default Extension=\"glb\" ContentType=\"model/gltf-binary\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>").unwrap();
    zip.add_directory("word/", options).unwrap();
    zip.add_directory("word/media/", options).unwrap();
    zip.add_directory("word/embeddings/", options).unwrap();
    zip.start_file("word/media/image1.png", options).unwrap();
    zip.write_all(b"not-a-real-image-needed-only-for-docx-shape")
        .unwrap();
    zip.start_file("word/embeddings/model3d.glb", options)
        .unwrap();
    zip.write_all(b"glTF").unwrap();
    zip.start_file("word/header1.xml", options).unwrap();
    zip.write_all(r#"<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>En-tête utile</w:t></w:r></w:p></w:hdr>"#.as_bytes()).unwrap();
    zip.start_file("word/footer1.xml", options).unwrap();
    zip.write_all(r#"<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Pied de page utile</w:t></w:r></w:p></w:ftr>"#.as_bytes()).unwrap();
    zip.start_file("word/document.xml", options).unwrap();
    zip.write_all(r#"<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    <w:p><w:r><w:t>Titre DOCX complexe</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Cellule tableau A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Cellule tableau B</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Image"/></wp:inline></w:drawing></w:r></w:p>
    <w:p><w:r><w:object><w:control r:id="rIdModel3D"/></w:object></w:r></w:p>
    <w:p><w:r><w:t>Texte après image et modèle 3D</w:t></w:r></w:p>
  </w:body>
</w:document>"#.as_bytes()).unwrap();
    zip.finish().unwrap();
}

fn complex_pdf_fixture() -> Vec<u8> {
    let content = b"BT /F1 14 Tf 24 180 Td (Complex PDF report) Tj 0 -24 Td /F1 10 Tf (Item    Quantity    Price) Tj 0 -16 Td (Camera    2    450 EUR) Tj 0 -16 Td (Tripod    1    90 EUR) Tj 0 -24 Td (Signature: Approved by Alex) Tj ET\nq 24 0 0 24 150 24 cm /Im1 Do Q";
    let content_object = format!(
        "<< /Length {} >>\nstream\n{}\nendstream",
        content.len(),
        String::from_utf8_lossy(content)
    )
    .into_bytes();
    let mut image_object = b"<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n".to_vec();
    image_object.extend_from_slice(&[0x33, 0x66, 0x99]);
    image_object.extend_from_slice(b"\nendstream");

    build_pdf_fixture(vec![
            b"<< /Type /Catalog /Pages 2 0 R /AcroForm 7 0 R >>".to_vec(),
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_vec(),
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 220 220] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R /Annots [8 0 R] >>".to_vec(),
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_vec(),
            content_object,
            image_object,
            b"<< /Fields [8 0 R] /SigFlags 3 >>".to_vec(),
            b"<< /Type /Annot /Subtype /Widget /FT /Sig /Rect [20 20 120 40] /T (Approval) /V 9 0 R /P 3 0 R >>".to_vec(),
            b"<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0 0 0] /Contents <00> /Reason (Approved by Alex) >>".to_vec(),
        ])
}

fn build_pdf_fixture(objects: Vec<Vec<u8>>) -> Vec<u8> {
    let mut pdf = b"%PDF-1.4\n".to_vec();
    let mut offsets = Vec::with_capacity(objects.len());
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
        pdf.extend_from_slice(object);
        pdf.extend_from_slice(b"\nendobj\n");
    }

    let xref_offset = pdf.len();
    pdf.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    pdf.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer << /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    pdf
}

fn write_document_target(
    path: &Path,
    source_format: &str,
    target_format: &str,
    content: &str,
    marker: &str,
) {
    match target_format {
        "txt" => fs::write(path, to_plain_text(content, source_format)).unwrap(),
        "md" => fs::write(path, to_markdown(content, source_format)).unwrap(),
        "html" => fs::write(path, to_html(content, source_format)).unwrap(),
        "rtf" => fs::write(path, to_rtf(content, source_format)).unwrap(),
        "csv" => write_utf8_csv(path, &to_csv(content, source_format)).unwrap(),
        "json" => fs::write(path, to_json(content, source_format).unwrap()).unwrap(),
        "xml" => fs::write(path, to_xml(content, source_format)).unwrap(),
        "docx" => write_docx(path, content, source_format).unwrap(),
        "odt" => write_odt(path, content, source_format).unwrap(),
        "epub" => write_epub(path, content, source_format).unwrap(),
        "pdf" => fs::write(path, simple_pdf("target.pdf", marker)).unwrap(),
        other => panic!("unsupported target in test: {other}"),
    }
}

pub(super) fn read_document_target(path: &Path, target_format: &str) -> String {
    match target_format {
        "pdf" => pdf_extract::extract_text(path).unwrap(),
        "docx" | "odt" | "epub" | "html" | "rtf" => {
            read_document_text(path, target_format).unwrap()
        }
        _ => decode_text_buffer(&fs::read(path).unwrap()),
    }
}

fn assert_text_is_clean(value: &str, source_format: &str, phase: &str) {
    for bad in ["Jâ", "dÃ", "Ã©", "Ã¨", "Ã§", "Â", "\u{fffd}"] {
        assert!(
            !value.contains(bad),
            "{source_format} {phase} produced mojibake marker {bad:?}: {value:?}"
        );
    }
}
