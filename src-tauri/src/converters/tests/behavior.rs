use super::*;

#[test]
fn hidden_backend_targets_are_not_supported_directly() {
    assert!(audio_args("dts").is_err());
    for target in ["flv", "vob", "avchd", "divx", "xvid", "mxf"] {
        assert!(cpu_video_args(target).is_err());
    }
    assert!(image_format_for_target("avif").is_err());
}

#[test]
fn wmv_output_uses_compatibility_resolution_limit() {
    let args = cpu_video_args("wmv").unwrap();

    assert!(args.windows(2).any(|pair| pair == ["-codec:v", "wmv2"]));
    assert!(args.windows(2).any(|pair| pair == ["-codec:a", "wmav2"]));
    assert!(args.windows(2).any(|pair| pair == ["-b:v", "3500k"]));
    assert!(args.iter().any(|arg| arg.contains("min(1920\\,iw)")));
    assert!(args.iter().any(|arg| arg.contains("min(1080\\,ih)")));
    assert!(
        args.iter()
            .any(|arg| arg.contains("force_original_aspect_ratio=decrease"))
    );
}

#[test]
fn pdf_text_stream_uses_winansi_not_raw_utf8() {
    let escaped = escape_pdf_text_bytes("J’ai déposé un fichier aperçu façade.");
    let escaped_text = String::from_utf8(escaped).unwrap();

    assert!(escaped_text.contains("\\222"));
    assert!(escaped_text.contains("\\351"));
    assert!(escaped_text.contains("\\347"));
    assert!(!escaped_text.contains("â"));
}

#[test]
fn generated_pdf_extracts_french_text_correctly() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("accented.pdf");
    let source = "J’ai refondu l’interface en parcours intelligent en 3 étapes.\nDéposer un ou plusieurs fichiers.\naperçu navigateur OK";
    fs::write(&path, simple_pdf("accented.txt", source)).unwrap();

    let extracted = pdf_extract::extract_text(&path).unwrap();
    assert!(extracted.contains("J’ai refondu l’interface"));
    assert!(extracted.contains("3 étapes"));
    assert!(extracted.contains("Déposer"));
    assert!(!extracted.contains("Jâ"));
}

#[test]
fn generated_pdf_keeps_content_after_first_page() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("multipage.pdf");
    let source = (1..=140)
        .map(|index| format!("Ligne PDF longue {}", index))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(&path, simple_pdf("multipage.txt", &source)).unwrap();

    let extracted = pdf_extract::extract_text(&path).unwrap();
    assert!(extracted.contains("Ligne PDF longue 1"));
    assert!(extracted.contains("Ligne PDF longue 80"));
    assert!(extracted.contains("Ligne PDF longue 140"));
}

#[test]
fn ico_output_is_limited_to_supported_dimensions() {
    let image = image::DynamicImage::new_rgba8(2560, 1440);
    let icon = fit_ico_image(image);

    assert!(icon.width() <= 256);
    assert!(icon.height() <= 256);
    assert_eq!(icon.width(), icon.height());
    assert!(icon.width() >= 1);
    assert!(icon.height() >= 1);

    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("large.ico");
    write_windows_ico(&path, icon).unwrap();
    assert_windows_accepts_icon(&path);
}

#[test]
fn png_to_ico_outputs_square_rgba_icon() {
    let image = image::DynamicImage::ImageRgb8(image::RgbImage::new(512, 128));
    let icon = fit_ico_image(image);

    assert_eq!(icon.width(), 256);
    assert_eq!(icon.height(), 256);
    assert!(matches!(icon, image::DynamicImage::ImageRgba8(_)));

    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("wide.ico");
    write_windows_ico(&path, icon).unwrap();
    assert_windows_accepts_icon(&path);

    let decoded = image::ImageReader::open(path)
        .unwrap()
        .with_guessed_format()
        .unwrap()
        .decode()
        .unwrap();
    assert_eq!(decoded.width(), 256);
    assert_eq!(decoded.height(), 256);
}

#[test]
fn all_image_sources_to_ico_are_windows_compatible() {
    for source_format in ["png", "jpg", "gif", "svg", "webp", "tiff", "bmp", "ico"] {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join(format!(
            "source.{}",
            extension_for_test_source(source_format)
        ));
        let output = dir.path().join(format!("{source_format}.ico"));
        write_image_fixture(&input, source_format);

        write_windows_ico(&output, read_test_image(&input, source_format)).unwrap();
        assert_windows_accepts_icon(&output);
    }
}

#[test]
fn static_gif_converts_to_decodable_png_and_windows_ico() {
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("static.gif");
    fs::write(&input, one_frame_gif()).unwrap();

    for target_format in ["png", "ico"] {
        let output = dir.path().join(format!("static.{target_format}"));
        let image = read_integrated_image(&input)
            .unwrap_or_else(|error| panic!("GIF fixture should decode: {error}"));
        write_integrated_image(&output, image, target_format)
            .unwrap_or_else(|error| panic!("GIF -> {target_format} should encode: {error}"));

        let decoded = image::ImageReader::open(&output)
            .unwrap()
            .with_guessed_format()
            .unwrap()
            .decode()
            .unwrap_or_else(|error| panic!("GIF -> {target_format} output should decode: {error}"));
        assert!(decoded.width() > 0);
        assert!(decoded.height() > 0);
        if target_format == "ico" {
            assert_windows_accepts_icon(&output);
        }
    }
}

#[test]
fn svg_selected_engine_converts_to_decodable_gif() {
    let svg = crate::registry::get_format_by_id("svg").unwrap();
    let gif = crate::registry::get_format_by_id("gif").unwrap();
    let selected = crate::engines::select_engine(None, &svg, gif.id, gif.category_id, "image");
    assert_eq!(selected.id, "resvg");

    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("source.svg");
    let output = dir.path().join("source.gif");
    write_image_fixture(&input, "svg");

    let image = read_integrated_image(&input)
        .unwrap_or_else(|error| panic!("SVG fixture should render: {error}"));
    write_integrated_image(&output, image, "gif")
        .unwrap_or_else(|error| panic!("SVG -> GIF should encode: {error}"));

    let decoded = image::ImageReader::open(&output)
        .unwrap()
        .with_guessed_format()
        .unwrap()
        .decode()
        .unwrap_or_else(|error| panic!("SVG -> GIF output should decode: {error}"));
    assert!(decoded.width() > 0);
    assert!(decoded.height() > 0);
}

#[test]
fn pdf_text_can_write_rich_document_targets_without_libreoffice() {
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("source.pdf");
    let marker = "PDF vers document riche sans LibreOffice 2026.";
    fs::write(&input, simple_pdf("source.pdf", marker)).unwrap();
    let content = read_document_text(&input, "pdf").unwrap();

    for target_format in ["docx", "odt", "rtf"] {
        let output = dir.path().join(format!("source.{target_format}"));
        write_text_content_file(&output, "pdf", target_format, &content)
            .unwrap_or_else(|error| panic!("PDF -> {target_format} should write: {error}"));
        let readable = read_document_target(&output, target_format);
        assert!(
            readable.contains("PDF vers document riche"),
            "PDF -> {target_format} lost extracted text: {readable:?}"
        );
    }
}

#[test]
fn pdf_registry_text_targets_are_writeable_and_readable() {
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("source.pdf");
    let marker = "PDF registre vers sortie texte complète 2026.";
    fs::write(&input, simple_pdf("source.pdf", marker)).unwrap();
    let content = read_document_text(&input, "pdf").unwrap();

    for target in crate::registry::get_targets_for_extension("pdf")
        .into_iter()
        .filter(|target| target.engine == "text")
    {
        let output = dir
            .path()
            .join(format!("source-to-{}.{}", target.format, target.extension));
        write_text_content_file(&output, "pdf", &target.format, &content).unwrap_or_else(|error| {
            panic!(
                "PDF registry target {} should write: {error}",
                target.format
            )
        });
        assert!(
            output.exists() && output.metadata().unwrap().len() > 0,
            "PDF registry target {} produced no file",
            target.format
        );
        let readable = read_document_target(&output, &target.format);
        assert!(
            readable.contains("PDF registre vers sortie texte"),
            "PDF registry target {} lost extracted text: {readable:?}",
            target.format
        );
    }
}

#[test]
fn missing_source_file_returns_actionable_conversion_error() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("missing.gif");
    let error = ensure_source_file_available(&missing)
        .unwrap_err()
        .to_string();

    assert!(error.contains("fichier source est introuvable"));
    assert!(error.contains("Réimportez"));
    assert!(!error.contains("os error 2"));
}

#[test]
fn gif_animation_detection_counts_image_frames() {
    let dir = tempfile::tempdir().unwrap();
    let static_gif = dir.path().join("static.gif");
    let animated_gif = dir.path().join("animated.gif");
    fs::write(&static_gif, one_frame_gif()).unwrap();
    fs::write(&animated_gif, two_frame_gif()).unwrap();

    assert!(!gif_is_animated(&static_gif).unwrap());
    assert!(gif_is_animated(&animated_gif).unwrap());
}

#[test]
fn static_gif_is_described_as_image_targets() {
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("static.gif");
    fs::write(&input, one_frame_gif()).unwrap();

    let description = describe_file_with_app(None, &input).unwrap();
    let targets = description
        .targets
        .into_iter()
        .map(|target| target.format)
        .collect::<Vec<_>>();

    assert_eq!(description.category_id, "images");
    assert!(targets.contains(&"png".to_string()));
    assert!(targets.contains(&"webp".to_string()));
    assert!(!targets.contains(&"mp4".to_string()));
}

#[test]
fn animated_gif_is_described_as_video_targets() {
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("animated.gif");
    fs::write(&input, two_frame_gif()).unwrap();

    let description = describe_file_with_app(None, &input).unwrap();
    let targets = description
        .targets
        .into_iter()
        .map(|target| target.format)
        .collect::<Vec<_>>();

    assert_eq!(description.category_id, "video");
    assert!(targets.contains(&"mp4".to_string()));
    assert!(targets.contains(&"webm".to_string()));
    assert!(!targets.contains(&"png".to_string()));
}

#[cfg(target_os = "windows")]
fn assert_windows_accepts_icon(path: &Path) {
    let script = format!(
        "Add-Type -AssemblyName System.Drawing; $icon=[System.Drawing.Icon]::new('{}'); if ($icon.Width -le 0 -or $icon.Height -le 0) {{ exit 2 }}; $icon.Dispose()",
        path.to_string_lossy().replace('\'', "''")
    );
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "Windows rejected icon {}: stdout={} stderr={}",
        path.display(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[cfg(not(target_os = "windows"))]
fn assert_windows_accepts_icon(_path: &Path) {}

#[test]
fn integrated_image_dimensions_are_bounded() {
    assert!(ensure_image_dimensions(8000, 8000, "image").is_ok());
    assert!(ensure_image_dimensions(MAX_INTEGRATED_IMAGE_DIMENSION + 1, 10, "image").is_err());
    assert!(ensure_image_dimensions(20_000, 20_000, "image").is_err());
    assert!(ensure_image_dimensions(0, 100, "image").is_err());
}

#[test]
fn extracted_document_text_budget_is_bounded() {
    assert!(ensure_extracted_text_budget(MAX_EXTRACTED_TEXT_BYTES, "document").is_ok());
    assert!(ensure_extracted_text_budget(MAX_EXTRACTED_TEXT_BYTES + 1, "document").is_err());
}

#[test]
fn ffmpeg_progress_log_keeps_bounded_tail() {
    let mut log = String::new();
    for index in 0..10_000 {
        append_limited_log(
            &mut log,
            &format!("line-{index:05}-abcdefghijklmnopqrstuvwxyz"),
        );
    }

    assert!(log.chars().count() <= MAX_FFMPEG_PROGRESS_LOG_CHARS + "[sortie tronquée]\n".len());
    assert!(log.contains("sortie tronquée"));
    assert!(log.contains("line-09999"));
    assert!(!log.contains("line-00000"));
}

#[test]
fn ffmpeg_progress_log_keeps_unicode_character_boundaries() {
    let mut log = "é".repeat(MAX_FFMPEG_PROGRESS_LOG_CHARS);

    append_limited_log(&mut log, "façade");

    assert!(log.starts_with("[sortie tronquée]\n"));
    assert!(log.ends_with("façade\n"));
    assert_eq!(
        log.trim_start_matches("[sortie tronquée]\n")
            .chars()
            .count(),
        MAX_FFMPEG_PROGRESS_LOG_CHARS
    );
}

pub(super) fn one_frame_gif() -> Vec<u8> {
    let mut bytes = gif_header();
    bytes.extend_from_slice(&gif_frame());
    bytes.push(0x3B);
    bytes
}

fn two_frame_gif() -> Vec<u8> {
    let mut bytes = gif_header();
    bytes.extend_from_slice(&gif_frame());
    bytes.extend_from_slice(&gif_frame());
    bytes.push(0x3B);
    bytes
}

fn gif_header() -> Vec<u8> {
    vec![
        b'G', b'I', b'F', b'8', b'9', b'a', 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00,
        0x00, 0xff, 0xff, 0xff,
    ]
}

fn gif_frame() -> Vec<u8> {
    vec![
        0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x4C, 0x01, 0x00,
    ]
}

#[test]
fn job_output_subfolders_prevent_same_name_collisions() {
    let dir = tempfile::tempdir().unwrap();
    let input_a = dir.path().join("a").join("rapport.txt");
    let input_b = dir.path().join("b").join("rapport.txt");
    let output_a = dir.path().join(safe_path_component("job-a"));
    let output_b = dir.path().join(safe_path_component("job-b"));

    assert_ne!(
        available_output_path(&input_a, &output_a, "pdf"),
        available_output_path(&input_b, &output_b, "pdf")
    );
}

#[test]
fn external_output_already_at_destination_is_kept() {
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("test.docx");
    let output = dir.path().join("test.pdf");
    fs::write(&input, b"docx placeholder").unwrap();
    fs::write(&output, b"%PDF placeholder").unwrap();

    move_external_output(&input, dir.path(), &output, "pdf").unwrap();

    assert_eq!(fs::read(&output).unwrap(), b"%PDF placeholder");
}

#[test]
fn queued_cancellation_survives_until_conversion_checks_it() {
    let job_id = "queued-before-start";

    assert!(cancel_conversion(job_id));
    assert!(check_cancelled(job_id).is_err());
    clear_cancelled(job_id);
    assert!(check_cancelled(job_id).is_ok());
}

#[test]
fn hostile_job_ids_cannot_escape_or_exhaust_job_output_paths() {
    for value in [".", "..", "CON", "LPT1", &"x".repeat(129), &"🙂".repeat(40)] {
        let component = safe_path_component(value);
        assert!(!component.is_empty());
        assert!(!matches!(component.as_str(), "." | ".."));
        assert!(component.len() <= 128);
    }
    assert!(!cancel_conversion(&"x".repeat(129)));
}
