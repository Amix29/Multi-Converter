use super::*;
use base64::{Engine as _, engine::general_purpose::STANDARD};

fn svg(href: &str) -> String {
    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2" height="2"><image width="2" height="2" xlink:href="{href}"/></svg>"#
    )
}

#[test]
fn svg_cannot_read_a_raster_outside_its_source_directory() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("source");
    fs::create_dir(&source).unwrap();
    let private = directory.path().join("private.png");
    image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]))
        .save(&private)
        .unwrap();
    let input = source.join("outside.svg");
    let href = private.to_string_lossy().replace('\\', "/");
    fs::write(&input, format!(r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2" height="2"><image width="2" height="2" xlink:href="{href}"/></svg>"#)).unwrap();
    assert!(
        read_svg_image(&input).is_err(),
        "An external raster must fail the conversion instead of entering its output"
    );
}

#[test]
fn svg_preserves_embedded_and_sibling_rasters() {
    let directory = tempfile::tempdir().unwrap();
    let raster = directory.path().join("image test.png");
    image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]))
        .save(&raster)
        .unwrap();
    let encoded = format!(
        "data:image/png;base64,{}",
        STANDARD.encode(fs::read(&raster).unwrap())
    );
    let input = directory.path().join("source.svg");
    for href in ["image%20test.png", &encoded] {
        fs::write(&input, svg(href)).unwrap();
        assert_eq!(
            read_svg_image(&input)
                .unwrap()
                .into_rgba8()
                .get_pixel(1, 1)
                .0,
            [255, 0, 0, 255]
        );
    }
}

#[test]
fn svg_rejects_network_missing_and_nested_svg_resources() {
    let directory = tempfile::tempdir().unwrap();
    let input = directory.path().join("source.svg");
    let nested = format!(
        "data:image/svg+xml;base64,{}",
        STANDARD.encode(svg("../private.png"))
    );
    for href in [
        "https://example.invalid/a.png",
        "http://127.0.0.1/a.png",
        "missing.png",
        &nested,
    ] {
        fs::write(&input, svg(href)).unwrap();
        assert!(read_svg_image(&input).is_err(), "{href}");
    }
}

#[test]
fn svg_rejects_compressed_oversized_and_excessive_xml_inputs() {
    let directory = tempfile::tempdir().unwrap();
    let input = directory.path().join("source.svg");
    fs::write(&input, b"\x1f\x8bcompressed").unwrap();
    assert!(read_svg_image(&input).is_err());
    File::create(&input)
        .unwrap()
        .set_len(16 * 1024 * 1024 + 1)
        .unwrap();
    assert!(read_svg_image(&input).is_err());
    fs::write(
        &input,
        format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"2\" height=\"2\">{}</svg>",
            "<g/>".repeat(100_001)
        ),
    )
    .unwrap();
    assert!(read_svg_image(&input).is_err());
    fs::write(
        &input,
        "<!DOCTYPE svg [<!ENTITY secret 'private'>]><svg xmlns=\"http://www.w3.org/2000/svg\"/>",
    )
    .unwrap();
    assert!(read_svg_image(&input).is_err());
}

#[cfg(unix)]
#[test]
fn svg_sibling_symlinks_cannot_escape_the_source_directory() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("source");
    fs::create_dir(&source).unwrap();
    image::RgbaImage::new(2, 2)
        .save(directory.path().join("private.png"))
        .unwrap();
    std::os::unix::fs::symlink(
        directory.path().join("private.png"),
        source.join("link.png"),
    )
    .unwrap();
    let input = source.join("source.svg");
    fs::write(&input, svg("link.png")).unwrap();
    assert!(read_svg_image(&input).is_err());
}
