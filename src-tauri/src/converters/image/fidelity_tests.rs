use super::*;

#[test]
fn translucent_svg_pixels_keep_straight_alpha_colors() {
    let directory = tempfile::tempdir().unwrap();
    let input = directory.path().join("alpha.svg");
    fs::write(&input, r#"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red" opacity="0.5"/></svg>"#).unwrap();
    let rgba = read_svg_image(&input).unwrap().into_rgba8();
    assert_eq!(rgba.get_pixel(8, 8).0, [255, 0, 0, 128]);
    let output = directory.path().join("alpha.jpg");
    write_integrated_image(&output, ::image::DynamicImage::ImageRgba8(rgba), "jpg").unwrap();
    let rgb = ::image::open(output).unwrap().into_rgb8();
    let pixel = rgb.get_pixel(8, 8).0;
    assert!(
        pixel[0] >= 250 && (120..=135).contains(&pixel[1]) && (120..=135).contains(&pixel[2]),
        "{pixel:?}"
    );
}

#[test]
fn svg_budget_accounts_for_both_live_rgba_buffers() {
    let directory = tempfile::tempdir().unwrap();
    let input = directory.path().join("large.svg");
    fs::write(
        &input,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="10000"/>"#,
    )
    .unwrap();
    assert!(
        read_svg_image(&input)
            .unwrap_err()
            .to_string()
            .contains("mémoire")
    );
}

#[test]
fn jpeg_exif_orientation_is_applied_before_conversion() {
    let directory = tempfile::tempdir().unwrap();
    let input = directory.path().join("rotated.jpg");
    let image = image::DynamicImage::new_rgb8(16, 32);
    image.save(&input).unwrap();
    let jpeg = fs::read(&input).unwrap();
    // EXIF little-endian IFD0, SHORT orientation=6 (90° clockwise).
    let exif = b"Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0";
    let mut tagged = jpeg[..2].to_vec();
    tagged.extend_from_slice(&[0xff, 0xe1]);
    tagged.extend_from_slice(&((exif.len() + 2) as u16).to_be_bytes());
    tagged.extend_from_slice(exif);
    tagged.extend_from_slice(&jpeg[2..]);
    fs::write(&input, tagged).unwrap();
    let result = read_integrated_image(&input).unwrap();
    assert_eq!((result.width(), result.height()), (32, 16));
}

#[test]
fn transparent_pixels_export_to_a_white_jpeg_matte() {
    let directory = tempfile::tempdir().unwrap();
    let output = directory.path().join("white.jpg");
    let transparent = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
        16,
        16,
        image::Rgba([255, 0, 0, 0]),
    ));
    write_integrated_image(&output, transparent, "jpg").unwrap();
    let decoded = image::open(output).unwrap().into_rgb8();
    assert!(
        decoded
            .pixels()
            .all(|pixel| pixel.0.iter().all(|value| *value >= 250))
    );
}

#[test]
fn high_jpeg_profile_reduces_pixel_error_relative_to_compact() {
    let directory = tempfile::tempdir().unwrap();
    let source = image::RgbImage::from_fn(128, 128, |x, y| {
        image::Rgb([
            (x * 13 + y * 7) as u8,
            (x * 3 + y * 17) as u8,
            (x * y) as u8,
        ])
    });
    let mut errors = Vec::new();
    let mut sizes = Vec::new();
    for (name, quality) in [
        ("compact", QualityProfile::Compact),
        ("high", QualityProfile::High),
    ] {
        let output = directory.path().join(format!("{name}.jpg"));
        write_integrated_image_with_quality(
            &output,
            image::DynamicImage::ImageRgb8(source.clone()),
            "jpg",
            quality,
        )
        .unwrap();
        let decoded = image::open(&output).unwrap().into_rgb8();
        let error: u64 = source
            .as_raw()
            .iter()
            .zip(decoded.as_raw())
            .map(|(a, b)| {
                let difference = i64::from(*a) - i64::from(*b);
                (difference * difference) as u64
            })
            .sum();
        errors.push(error);
        sizes.push(fs::metadata(output).unwrap().len());
    }
    assert!(
        errors[1] < errors[0],
        "high quality must retain more of this fixture's pixels"
    );
    assert!(
        sizes[1] > sizes[0],
        "the quality improvement must not be advertised as lossless compression"
    );
}
