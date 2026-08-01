use super::*;
use crate::registry::get_format_by_id;

#[test]
fn base_catalog_keeps_lightweight_engines_only() {
    let ids = catalog::TOOLS
        .iter()
        .filter(|tool| tool.mode == EngineMode::Base)
        .map(|tool| tool.id)
        .collect::<Vec<_>>();
    assert_eq!(
        ids,
        vec![
            "ffmpeg",
            "ffprobe",
            "rust-image",
            "resvg",
            "rust-text",
            "pdf-extract"
        ]
    );
    for id in [
        "imagemagick",
        "mupdf",
        "poppler",
        "pdfium",
        "libarchive",
        "blender",
        "freecad",
        "assimp",
        "fontforge",
    ] {
        assert!(!ids.contains(&id));
    }
}

#[test]
fn pdf_to_text_prefers_pdfium_then_pdf_extract_fallback() {
    let pdf = get_format_by_id("pdf").unwrap();
    let txt = get_format_by_id("txt").unwrap();
    let plan = select_engine(None, &pdf, txt.id, txt.category_id, "text");
    assert_eq!(plan.plan, vec!["pdf-extract", "Moteur texte intégré"]);
    assert_eq!(plan.id, "pdf-extract");
    assert!(plan.available);
}

#[test]
fn ffmpeg_gyan_version_suffix_matches_expected_version() {
    assert!(process::expected_version_matches(
        "8.1.1",
        Some("8.1.1-essentials_build-www.gyan.dev")
    ));
}

#[test]
fn markdown_to_pdf_uses_integrated_text_pipeline() {
    let md = get_format_by_id("md").unwrap();
    let pdf = get_format_by_id("pdf").unwrap();
    let plan = select_engine(None, &md, pdf.id, pdf.category_id, "text");

    assert_eq!(plan.id, "rust-text");
    assert!(plan.available);
    assert!(!plan.plan.contains(&"Pandoc".to_string()));
    assert!(!plan.plan.contains(&"LibreOffice".to_string()));
}

#[test]
fn pdf_to_rich_document_uses_integrated_text_pipeline() {
    let pdf = get_format_by_id("pdf").unwrap();
    let docx = get_format_by_id("docx").unwrap();
    let plan = select_engine(None, &pdf, docx.id, docx.category_id, "text");

    assert_eq!(plan.id, "pdf-extract");
    assert_eq!(plan.required_engine_ids, vec!["pdf-extract"]);
    assert!(plan.available);
}

#[test]
fn legacy_doc_source_uses_bundled_libreoffice() {
    let doc = get_format_by_id("doc").unwrap();
    let docx = get_format_by_id("docx").unwrap();
    let plan = select_engine(None, &doc, docx.id, docx.category_id, "external");

    assert_eq!(plan.id, "libreoffice");
    assert_eq!(plan.required_engine_ids, vec!["libreoffice"]);
    assert_eq!(plan.plan, vec!["LibreOffice headless"]);
}

#[test]
fn office_documents_to_layoutless_targets_use_integrated_text_extraction() {
    for source_id in ["docx", "odt", "rtf"] {
        let source = get_format_by_id(source_id).unwrap();

        for target_id in ["txt", "md", "csv", "json", "xml"] {
            let target = get_format_by_id(target_id).unwrap();
            let plan = select_engine(None, &source, target.id, target.category_id, "text");

            assert_eq!(
                plan.id, "rust-text",
                "{source_id} -> {target_id} should not depend on LibreOffice or Pandoc"
            );
            assert_eq!(plan.required_engine_ids, vec!["rust-text"]);
            assert!(plan.available);
        }
    }
}

#[test]
fn advanced_catalog_is_reported_as_bundled_engines() {
    let ids = catalog::TOOLS
        .iter()
        .filter(|tool| tool.mode == EngineMode::Advanced)
        .map(|tool| tool.id)
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["pdfium", "libreoffice", "pandoc", "libvips"]);
}

#[test]
fn raster_to_svg_stays_disabled() {
    let png = get_format_by_id("png").unwrap();
    let svg = get_format_by_id("svg").unwrap();
    let plan = select_engine(None, &png, svg.id, svg.category_id, "image");
    assert_eq!(plan.id, "non-integrated");
    assert!(!plan.available);
    assert!(plan.reason.contains("vrai SVG vectoriel"));
}

#[test]
fn advanced_image_engine_keeps_ico_on_rust_image() {
    let png = get_format_by_id("png").unwrap();
    let ico = get_format_by_id("ico").unwrap();
    let candidates = policy::engine_candidates(&png, ico.id, ico.category_id, "image");
    assert_eq!(candidates, vec!["rust-image"]);
}

#[test]
fn ffmpeg_media_conversions_have_no_non_ffmpeg_fallback() {
    let mp3 = get_format_by_id("mp3").unwrap();
    let wav = get_format_by_id("wav").unwrap();
    let plan = select_engine(None, &mp3, wav.id, wav.category_id, "ffmpeg");

    assert_eq!(plan.id, "ffmpeg");
    assert_eq!(plan.required_engine_ids, vec!["ffmpeg", "ffprobe"]);
    assert_eq!(plan.plan, vec!["FFmpeg", "ffprobe"]);
}

#[test]
fn sidecar_names_are_stable_for_release_platforms() {
    assert_eq!(
        binary_name_for("ffmpeg", "windows", "x86_64"),
        "ffmpeg-x86_64-pc-windows-msvc.exe"
    );
    assert_eq!(
        binary_name_for("ffmpeg", "macos", "aarch64"),
        "ffmpeg-aarch64-apple-darwin"
    );
    assert_eq!(
        binary_name_for("ffmpeg", "macos", "x86_64"),
        "ffmpeg-x86_64-apple-darwin"
    );
    assert_eq!(
        universal_binary_name_for("ffmpeg", "macos", "aarch64"),
        "ffmpeg-universal-apple-darwin"
    );
    assert_eq!(
        universal_binary_name_for("ffmpeg", "macos", "x86_64"),
        "ffmpeg-universal-apple-darwin"
    );
    assert_eq!(
        universal_binary_name_for("ffprobe", "linux", "x86_64"),
        "ffprobe-x86_64-unknown-linux-gnu"
    );
}
