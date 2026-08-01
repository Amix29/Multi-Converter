use super::*;
use zip::write::SimpleFileOptions;

fn write_archive(path: &Path, entries: &[(&str, &[u8])], deflated: bool) {
    let mut archive = zip::ZipWriter::new(File::create(path).unwrap());
    let compression = if deflated {
        zip::CompressionMethod::Deflated
    } else {
        zip::CompressionMethod::Stored
    };
    let options = SimpleFileOptions::default().compression_method(compression);
    for (name, content) in entries {
        archive.start_file(*name, options).unwrap();
        archive.write_all(content).unwrap();
    }
    archive.finish().unwrap();
}

#[test]
fn docx_rejects_case_ambiguous_part_names() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("ambiguous.docx");
    write_archive(
        &path,
        &[
            ("word/document.xml", b"<w:p><w:t>premier</w:t></w:p>"),
            ("WORD/DOCUMENT.XML", b"<w:p><w:t>second</w:t></w:p>"),
        ],
        false,
    );

    let error = read_docx_text(&path).unwrap_err().to_string();

    assert!(error.contains("ambiguës ou dupliquées"), "{error}");
}

#[test]
fn docx_rejects_excessive_secondary_parts() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("secondary-parts.docx");
    let mut archive = zip::ZipWriter::new(File::create(&path).unwrap());
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    archive.start_file("word/document.xml", options).unwrap();
    archive
        .write_all(b"<w:p><w:t>document</w:t></w:p>")
        .unwrap();
    for index in 0..=512 {
        archive
            .start_file(format!("word/header{index}.xml"), options)
            .unwrap();
        archive.write_all(b"<w:p><w:t>header</w:t></w:p>").unwrap();
    }
    archive.finish().unwrap();

    let error = read_docx_text(&path).unwrap_err().to_string();

    assert!(error.contains("trop de parties"), "{error}");
}

#[test]
fn epub_archive_limits_cover_count_and_cumulative_size() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("limits.epub");
    write_archive(
        &path,
        &[
            ("OEBPS/a.xhtml", b"123456"),
            ("OEBPS/b.xhtml", b"abcdef"),
            ("OEBPS/c.xhtml", b"ok"),
        ],
        false,
    );

    let count_error = validate_text_archive_limits_for_test(&path, 2, 100, 100, 100)
        .unwrap_err()
        .to_string();
    assert!(count_error.contains("trop d’entrées"), "{count_error}");

    let size_error = validate_text_archive_limits_for_test(&path, 3, 10, 100, 100)
        .unwrap_err()
        .to_string();
    assert!(size_error.contains("contenu décompressé"), "{size_error}");
}

#[test]
fn epub_archive_rejects_suspicious_compression_ratio() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("compressed.epub");
    let repeated = vec![b'a'; 4096];
    write_archive(&path, &[("OEBPS/chapter.xhtml", &repeated)], true);

    let error = validate_text_archive_limits_for_test(&path, 2, 8192, 100, 2)
        .unwrap_err()
        .to_string();

    assert!(error.contains("ratio de compression"), "{error}");
}

#[test]
fn epub_archive_rejects_unsafe_and_duplicate_names() {
    let directory = tempfile::tempdir().unwrap();
    let unsafe_path = directory.path().join("unsafe.epub");
    write_archive(&unsafe_path, &[("../chapter.xhtml", b"unsafe")], false);
    let unsafe_error = read_epub_text(&unsafe_path).unwrap_err().to_string();
    assert!(unsafe_error.contains("nom d’entrée"), "{unsafe_error}");

    let duplicate_path = directory.path().join("duplicate.epub");
    write_archive(
        &duplicate_path,
        &[
            ("OEBPS/chapter.xhtml", b"first"),
            ("OEBPS\\chapter.xhtml", b"second"),
        ],
        false,
    );
    let duplicate_error = read_epub_text(&duplicate_path).unwrap_err().to_string();
    assert!(
        duplicate_error.contains("ambiguës ou dupliquées"),
        "{duplicate_error}"
    );
}
