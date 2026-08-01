use super::*;

#[test]
#[ignore = "full conversion matrix is run by npm run test:conversions"]
fn conversion_matrix_image_png_to_webp_fixture() {
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("pixel.png");
    let output = dir.path().join("pixel.webp");
    let image = image::DynamicImage::new_rgba8(8, 8);

    image
        .write_to(&mut File::create(&input).unwrap(), ImageFormat::Png)
        .unwrap();
    image
        .write_to(&mut File::create(&output).unwrap(), ImageFormat::WebP)
        .unwrap();

    let decoded = image::ImageReader::open(&output)
        .unwrap()
        .with_guessed_format()
        .unwrap()
        .decode()
        .unwrap();
    assert_eq!(decoded.width(), 8);
    assert_eq!(decoded.height(), 8);
}

#[test]
#[ignore = "full conversion matrix is run by npm run test:conversions"]
fn conversion_matrix_all_integrated_image_targets_decode() {
    let source_formats = ["png", "jpg", "gif", "svg", "webp", "tiff", "bmp", "ico"];

    for source_format in source_formats {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join(format!(
            "source.{}",
            extension_for_test_source(source_format)
        ));
        write_image_fixture(&input, source_format);
        for target in crate::registry::get_targets_for_extension(source_format)
            .into_iter()
            .filter(|target| target.category_id == "images")
        {
            let output = dir.path().join(format!(
                "{}-to-{}.{}",
                source_format, target.format, target.extension
            ));
            let image = read_integrated_image(&input).unwrap_or_else(|error| {
                panic!("{source_format} input failed to decode through app image reader: {error}")
            });
            write_integrated_image(&output, image, &target.format).unwrap_or_else(|error| {
                panic!(
                    "{} -> {} failed through app image writer: {}",
                    source_format, target.format, error
                )
            });

            let decoded = image::ImageReader::open(&output)
                .unwrap()
                .with_guessed_format()
                .unwrap()
                .decode()
                .unwrap_or_else(|error| {
                    panic!(
                        "{} -> {} produced unreadable output: {}",
                        source_format, target.format, error
                    )
                });
            assert!(decoded.width() > 0);
            assert!(decoded.height() > 0);
        }
    }
}

#[test]
#[ignore = "full conversion matrix is run by npm run test:conversions"]
fn conversion_matrix_text_to_pdf_fixture() {
    let dir = tempfile::tempdir().unwrap();
    let output = dir.path().join("fixture.pdf");
    let source = "Fixture texte Multi-Converter 2026\nDeuxième ligne accentuée.";

    fs::write(&output, simple_pdf("fixture.txt", source)).unwrap();

    let extracted = pdf_extract::extract_text(&output).unwrap();
    assert!(extracted.contains("Fixture texte Multi-Converter 2026"));
    assert!(extracted.contains("Deuxième ligne accentuée"));
}

#[test]
#[ignore = "full conversion matrix is run by npm run test:conversions"]
fn conversion_matrix_all_ffmpeg_audio_targets_probe() {
    let dir = tempfile::tempdir().unwrap();

    for source_format in ffmpeg_audio_test_sources() {
        let input = dir.path().join(format!(
            "source-{}.{}",
            source_format,
            extension_for_test_source(source_format)
        ));
        generate_audio_fixture(&input, source_format);
        assert_media_file_is_probeable(&input, source_format);

        for target in crate::registry::get_targets_for_extension(source_format)
            .into_iter()
            .filter(|target| target.engine == "ffmpeg" && target.category_id == "audio")
        {
            let output = dir.path().join(format!(
                "{}-to-{}.{}",
                source_format, target.format, target.extension
            ));
            let args = audio_args(&target.format).unwrap_or_else(|error| {
                panic!(
                    "{} -> {} is exposed but has no FFmpeg audio args: {}",
                    source_format, target.format, error
                )
            });

            run_ffmpeg_conversion(&input, &output, args);
            assert_media_file_is_probeable(
                &output,
                &format!("{} -> {}", source_format, target.format),
            );
        }
    }
}

#[test]
#[ignore = "full conversion matrix is run by npm run test:conversions"]
fn conversion_matrix_all_ffmpeg_video_and_extraction_targets_probe() {
    let source_formats = [
        "mp4", "mkv", "webm", "mov", "avi", "wmv", "3gp", "mts", "mpeg2", "ogv",
    ];
    let dir = tempfile::tempdir().unwrap();

    for source_format in source_formats {
        let input = dir.path().join(format!(
            "source-{}.{}",
            source_format,
            extension_for_test_source(source_format)
        ));
        generate_video_fixture(&input, source_format);
        assert_media_file_is_probeable(&input, source_format);

        for target in crate::registry::get_targets_for_extension(source_format)
            .into_iter()
            .filter(|target| target.engine == "ffmpeg")
        {
            let output = dir.path().join(format!(
                "{}-to-{}.{}",
                source_format, target.format, target.extension
            ));

            if target.category_id == "audio" {
                let args = audio_args(&target.format).unwrap_or_else(|error| {
                    panic!(
                        "{} -> {} is exposed but has no FFmpeg audio args: {}",
                        source_format, target.format, error
                    )
                });
                run_ffmpeg_conversion(&input, &output, args);
            } else {
                let args = cpu_video_args(&target.format).unwrap_or_else(|error| {
                    panic!(
                        "{} -> {} is exposed but has no FFmpeg video args: {}",
                        source_format, target.format, error
                    )
                });
                run_ffmpeg_conversion(&input, &output, args);
            }

            assert_media_file_is_probeable(
                &output,
                &format!("{} -> {}", source_format, target.format),
            );
        }
    }
}

fn generate_audio_fixture(path: &Path, source_format: &str) {
    let mut args = vec![
        "-y".to_string(),
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
        "-f".to_string(),
        "lavfi".to_string(),
        "-i".to_string(),
        "sine=frequency=880:duration=0.18".to_string(),
    ];
    args.extend(
        audio_args(source_format)
            .unwrap()
            .into_iter()
            .map(str::to_string),
    );
    args.push(path.to_string_lossy().to_string());

    run_ffmpeg_args(&args, &format!("fixture audio {source_format}"));
}

fn ffmpeg_audio_test_sources() -> Vec<&'static str> {
    [
        "mp3", "m4a", "flac", "wav", "ogg", "wma", "opus", "aiff", "alac", "ac3", "mp2", "amr",
        "au", "caf",
    ]
    .into_iter()
    .filter(|source_format| {
        crate::registry::get_targets_for_extension(source_format)
            .into_iter()
            .any(|target| target.engine == "ffmpeg" && target.category_id == "audio")
    })
    .collect()
}

fn generate_video_fixture(path: &Path, source_format: &str) {
    let mut args = vec![
        "-y".to_string(),
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
        "-f".to_string(),
        "lavfi".to_string(),
        "-i".to_string(),
        "testsrc2=size=96x64:rate=12:duration=0.18".to_string(),
        "-f".to_string(),
        "lavfi".to_string(),
        "-i".to_string(),
        "sine=frequency=440:duration=0.18".to_string(),
        "-shortest".to_string(),
    ];
    args.extend(cpu_video_args(source_format).unwrap());
    args.push("-threads".to_string());
    args.push("1".to_string());
    args.push(path.to_string_lossy().to_string());

    run_ffmpeg_args(&args, &format!("fixture video {source_format}"));
}

fn run_ffmpeg_conversion<T: AsRef<str>>(input: &Path, output: &Path, codec_args: Vec<T>) {
    let mut args = vec![
        "-y".to_string(),
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
        "-i".to_string(),
        input.to_string_lossy().to_string(),
    ];
    args.extend(codec_args.into_iter().map(|item| item.as_ref().to_string()));
    args.push("-threads".to_string());
    args.push("1".to_string());
    args.push(output.to_string_lossy().to_string());

    run_ffmpeg_args(
        &args,
        &format!("{} -> {}", input.display(), output.display()),
    );
}

fn run_ffmpeg_args(args: &[String], context: &str) {
    let mut command = Command::new(ffmpeg_test_path());
    configure_child_process(&mut command);
    let output = command.args(args).output().unwrap_or_else(|error| {
        panic!("FFmpeg could not start for {context}: {error}");
    });
    assert!(
        output.status.success(),
        "FFmpeg failed for {context}: stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn assert_media_file_is_probeable(path: &Path, context: &str) {
    let mut command = Command::new(ffprobe_test_path());
    configure_child_process(&mut command);
    let output = command
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(path)
        .output()
        .unwrap_or_else(|error| {
            panic!("ffprobe could not start for {context}: {error}");
        });
    let duration = String::from_utf8_lossy(&output.stdout);
    assert!(
        output.status.success()
            && duration
                .trim()
                .parse::<f64>()
                .is_ok_and(|value| value.is_finite() && value > 0.0),
        "ffprobe rejected {context} at {}: stdout={} stderr={}",
        path.display(),
        duration,
        String::from_utf8_lossy(&output.stderr)
    );
}

fn ffmpeg_test_path() -> PathBuf {
    sidecar_test_path("ffmpeg", "FFmpeg")
}

fn ffprobe_test_path() -> PathBuf {
    sidecar_test_path("ffprobe", "ffprobe")
}

fn sidecar_test_path(stem: &str, label: &str) -> PathBuf {
    let binaries_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    let candidates = sidecar_test_names(stem);
    for name in &candidates {
        let path = binaries_dir.join(name);
        if path.exists() {
            return path;
        }
    }
    panic!(
        "{label} test binary is missing in {}. Tried: {}",
        binaries_dir.display(),
        candidates.join(", ")
    );
}

fn sidecar_test_names(stem: &str) -> Vec<String> {
    if cfg!(target_os = "windows") {
        return vec![format!("{stem}-x86_64-pc-windows-msvc.exe")];
    }
    if cfg!(target_os = "macos") {
        let native = if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        };
        return vec![
            format!("{stem}-universal-apple-darwin"),
            format!("{stem}-{native}"),
        ];
    }
    let native = if cfg!(target_arch = "aarch64") {
        "aarch64-unknown-linux-gnu"
    } else {
        "x86_64-unknown-linux-gnu"
    };
    vec![format!("{stem}-{native}")]
}
