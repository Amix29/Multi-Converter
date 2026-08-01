use super::catalog::formats;
use super::*;

#[test]
fn v1_exposes_only_public_categories() {
    let categories = formats()
        .into_iter()
        .map(|format| format.category_id)
        .collect::<std::collections::BTreeSet<_>>();

    assert_eq!(
        categories,
        ["audio", "documents", "images", "video"]
            .into_iter()
            .collect()
    );
    for id in [
        "office",
        "archives",
        "fonts",
        "databases",
        "cad",
        "models3d",
        "subtitles",
    ] {
        assert!(!categories.contains(id));
    }
}

#[test]
fn pdf_text_conversions_include_supported_text_document_targets() {
    let targets = get_targets_for_extension("pdf")
        .into_iter()
        .filter(|target| target.engine == "text")
        .map(|target| target.format)
        .collect::<Vec<_>>();

    assert_eq!(targets.len(), 9);
    assert!(targets.contains(&"txt".to_string()));
    assert!(targets.contains(&"html".to_string()));
    assert!(targets.contains(&"docx".to_string()));
    assert!(targets.contains(&"odt".to_string()));
    assert!(targets.contains(&"rtf".to_string()));
    assert!(!targets.contains(&"epub".to_string()));
    assert!(!targets.contains(&"tex".to_string()));
    assert!(!targets.contains(&"ps".to_string()));
}

#[test]
fn registry_exposes_quality_targets_as_engine_backed_options() {
    let pdf_targets = get_targets_for_extension("pdf");
    assert!(
        pdf_targets
            .iter()
            .any(|target| target.format == "docx" && target.engine == "text")
    );
    assert!(
        pdf_targets
            .iter()
            .any(|target| target.format == "odt" && target.engine == "text")
    );
    assert!(
        pdf_targets
            .iter()
            .any(|target| target.format == "rtf" && target.engine == "text")
    );
    assert!(pdf_targets.iter().any(|target| target.format == "png"
        && target.engine == "pdfium"
        && target.extension == "zip"));

    let image_targets = get_targets_for_extension("png")
        .into_iter()
        .map(|target| target.format)
        .collect::<Vec<_>>();
    assert!(!image_targets.contains(&"txt".to_string()));
}

#[test]
fn image_registry_does_not_expose_unvalidated_advanced_formats() {
    for id in ["heic", "heif", "avif", "raw", "psd", "jp2"] {
        assert!(
            get_format_by_id(id).is_none(),
            "{id} should stay hidden until the packaged engine proves support"
        );
    }
}

#[test]
fn public_image_formats_all_have_targets() {
    for extension in ["png", "jpg", "gif", "svg", "webp", "tiff", "bmp", "ico"] {
        let targets = get_targets_for_extension(extension);
        assert!(
            !targets.is_empty(),
            "{extension} should expose image targets"
        );
    }

    let ico_targets = get_targets_for_extension("ico")
        .into_iter()
        .map(|target| target.format)
        .collect::<Vec<_>>();
    assert!(ico_targets.contains(&"png".to_string()));
    assert!(ico_targets.contains(&"jpg".to_string()));

    let png_targets = get_targets_for_extension("png")
        .into_iter()
        .map(|target| target.format)
        .collect::<Vec<_>>();
    assert!(png_targets.contains(&"bmp".to_string()));
}

#[test]
fn v1_does_not_expose_retired_formats() {
    for id in [
        "mobi", "ps", "tex", "pages", "wps", "flv", "vob", "avchd", "divx", "xvid", "mxf", "dts",
        "ape",
    ] {
        assert!(
            get_format_by_id(id).is_none(),
            "{id} should be roadmap-only"
        );
    }
}

#[test]
fn doc_is_source_only_and_targets_modern_formats() {
    assert!(get_format_by_id("doc").is_some());
    let targets = get_targets_for_extension("doc")
        .into_iter()
        .map(|target| target.format)
        .collect::<Vec<_>>();

    for target in ["docx", "odt", "rtf", "pdf", "html", "txt", "epub"] {
        assert!(targets.contains(&target.to_string()));
    }
    assert!(!targets.contains(&"doc".to_string()));
}

#[test]
fn base_media_formats_keep_ffmpeg_targets() {
    let mp4_targets = get_targets_for_extension("mp4");
    assert!(
        mp4_targets
            .iter()
            .any(|target| target.format == "webm" && target.engine == "ffmpeg")
    );
    assert!(
        mp4_targets
            .iter()
            .any(|target| target.format == "mp3" && target.engine == "ffmpeg")
    );

    let wav_targets = get_targets_for_extension("wav");
    assert!(
        wav_targets
            .iter()
            .any(|target| target.format == "mp3" && target.engine == "ffmpeg")
    );
}

#[test]
#[cfg(target_os = "macos")]
fn macos_hides_amr_until_bundled_ffmpeg_supports_opencore() {
    assert!(get_targets_for_extension("amr").is_empty());
    assert!(
        !get_targets_for_extension("wav")
            .iter()
            .any(|target| target.format == "amr")
    );
}

#[test]
#[cfg(not(target_os = "macos"))]
fn non_macos_keeps_amr_targets() {
    assert!(
        get_targets_for_extension("wav")
            .iter()
            .any(|target| target.format == "amr" && target.engine == "ffmpeg")
    );
}

#[test]
fn raster_images_are_not_offered_as_svg_targets() {
    let targets = get_targets_for_extension("png")
        .into_iter()
        .map(|target| target.format)
        .collect::<Vec<_>>();
    assert!(!targets.contains(&"svg".to_string()));
}
