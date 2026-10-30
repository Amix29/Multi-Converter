use super::*;

#[path = "image/fidelity.rs"]
pub(super) mod fidelity;
#[cfg(test)]
#[path = "image/fidelity_tests.rs"]
mod fidelity_tests;

pub(in crate::converters) fn convert_image(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
    quality: QualityProfile,
) -> Result<Vec<ConversionWarning>> {
    ensure_integrated_memory_budget(input_path, "image")?;
    emit_progress(app, job_id, 18, "Lecture de l'image");
    let (image, profile, has_exif) = read_integrated_image_with_profile(input_path)?;
    let warnings = fidelity::output_warnings(&image, target_format, profile.as_deref(), has_exif);

    emit_progress(app, job_id, 52, "Encodage de l'image");
    write_image_with_profile(output_path, image, target_format, quality, profile)?;
    emit_progress(app, job_id, 88, "Finalisation");
    Ok(warnings)
}

pub(in crate::converters) fn uses_integrated_image_pipeline(engine_id: &str) -> bool {
    matches!(engine_id, "rust-image" | "resvg" | "image")
}

pub(in crate::converters) fn read_integrated_image(
    input_path: &Path,
) -> Result<::image::DynamicImage> {
    Ok(read_integrated_image_with_profile(input_path)?.0)
}

fn read_integrated_image_with_profile(
    input_path: &Path,
) -> Result<(::image::DynamicImage, Option<Vec<u8>>, bool)> {
    if input_path
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("svg"))
    {
        Ok((read_svg_image(input_path)?, None, false))
    } else {
        let reader = image::ImageReader::open(input_path)?.with_guessed_format()?;
        let (width, height) = reader.into_dimensions()?;
        ensure_image_dimensions(width, height, "image")?;
        use ::image::ImageDecoder;
        let mut reader = image::ImageReader::open(input_path)?.with_guessed_format()?;
        let mut limits = image::Limits::default();
        limits.max_alloc = Some(256 * 1024 * 1024);
        reader.limits(limits);
        let tiff_profile = if reader.format() == Some(ImageFormat::Tiff) {
            fidelity::tiff_profile(input_path)?
        } else {
            None
        };
        let mut decoder = reader.into_decoder()?;
        let has_exif = decoder.exif_metadata()?.is_some();
        let profile = tiff_profile.or(decoder.icc_profile()?);
        fidelity::check_profile(profile.as_deref())?;
        let orientation = decoder.orientation()?;
        let mut image = ::image::DynamicImage::from_decoder(decoder)?;
        image.apply_orientation(orientation);
        Ok((image, profile, has_exif))
    }
}

#[cfg(test)]
pub(in crate::converters) fn write_integrated_image(
    output_path: &Path,
    image: ::image::DynamicImage,
    target_format: &str,
) -> Result<()> {
    write_integrated_image_with_quality(output_path, image, target_format, QualityProfile::Balanced)
}

#[cfg(test)]
fn write_integrated_image_with_quality(
    output_path: &Path,
    image: ::image::DynamicImage,
    target_format: &str,
    quality: QualityProfile,
) -> Result<()> {
    write_image_with_profile(output_path, image, target_format, quality, None)
}

fn write_image_with_profile(
    output_path: &Path,
    image: ::image::DynamicImage,
    target_format: &str,
    quality: QualityProfile,
    profile: Option<Vec<u8>>,
) -> Result<()> {
    if target_format == "ico" {
        write_windows_ico(output_path, image)?;
    } else if target_format == "jpg" {
        let grayscale = profile
            .as_deref()
            .is_some_and(|value| value.get(16..20) == Some(b"GRAY"));
        let mut rgba = image.into_rgba8();
        for pixel in rgba.pixels_mut() {
            let alpha = u16::from(pixel[3]);
            for channel in &mut pixel.0[..3] {
                *channel = ((u16::from(*channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
            }
            pixel[3] = 255;
        }
        let pixels = ::image::DynamicImage::ImageRgba8(rgba);
        let pixels = if grayscale {
            ::image::DynamicImage::ImageLuma8(pixels.into_luma8())
        } else {
            ::image::DynamicImage::ImageRgb8(pixels.into_rgb8())
        };
        let encoder = ::image::codecs::jpeg::JpegEncoder::new_with_quality(
            File::create(output_path)?,
            quality.jpeg_quality(),
        );
        fidelity::encode_with_profile(pixels, encoder, profile)?;
    } else if matches!(target_format, "png" | "webp" | "tiff") {
        fidelity::encode_profiled_target(output_path, image, target_format, profile)?;
    } else {
        let format = image_format_for_target(target_format)?;
        image.write_to(&mut File::create(output_path)?, format)?;
    }
    Ok(())
}

pub(in crate::converters) fn image_format_for_target(target_format: &str) -> Result<ImageFormat> {
    match target_format {
        "png" => Ok(ImageFormat::Png),
        "jpg" => Ok(ImageFormat::Jpeg),
        "gif" => Ok(ImageFormat::Gif),
        "webp" => Ok(ImageFormat::WebP),
        "tiff" => Ok(ImageFormat::Tiff),
        "bmp" => Ok(ImageFormat::Bmp),
        "ico" => Ok(ImageFormat::Ico),
        _ => Err(ConvertError::Message(format!(
            "Format image {} non supporté par le moteur intégré.",
            target_format.to_uppercase()
        ))),
    }
}

pub(in crate::converters) fn fit_ico_image(image: ::image::DynamicImage) -> ::image::DynamicImage {
    let target_size = 256;
    let resized = image
        .resize(target_size, target_size, FilterType::Lanczos3)
        .to_rgba8();
    let mut canvas =
        ::image::RgbaImage::from_pixel(target_size, target_size, ::image::Rgba([0, 0, 0, 0]));
    let x = ((target_size - resized.width()) / 2) as i64;
    let y = ((target_size - resized.height()) / 2) as i64;
    ::image::imageops::overlay(&mut canvas, &resized, x, y);

    ::image::DynamicImage::ImageRgba8(canvas)
}

pub(in crate::converters) fn write_windows_ico(
    output_path: &Path,
    image: ::image::DynamicImage,
) -> Result<()> {
    let icon = fit_ico_image(image).to_rgba8();
    let size = icon.width();
    let height = icon.height();
    if size == 0 || size != height || size > 256 {
        return Err(ConvertError::Message("Icône invalide.".to_string()));
    }

    let xor_bytes = (size * size * 4) as usize;
    let and_stride = size.div_ceil(32) * 4;
    let and_bytes = (and_stride * size) as usize;
    let dib_bytes = 40 + xor_bytes + and_bytes;
    let image_offset = 6 + 16;

    let mut file = File::create(output_path)?;
    file.write_all(&0u16.to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&[if size == 256 { 0 } else { size as u8 }])?;
    file.write_all(&[if size == 256 { 0 } else { size as u8 }])?;
    file.write_all(&[0, 0])?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&32u16.to_le_bytes())?;
    file.write_all(&(dib_bytes as u32).to_le_bytes())?;
    file.write_all(&(image_offset as u32).to_le_bytes())?;

    file.write_all(&40u32.to_le_bytes())?;
    file.write_all(&(size as i32).to_le_bytes())?;
    file.write_all(&((size * 2) as i32).to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&32u16.to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?;
    file.write_all(&(xor_bytes as u32).to_le_bytes())?;
    file.write_all(&0i32.to_le_bytes())?;
    file.write_all(&0i32.to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?;

    for y in (0..size).rev() {
        for x in 0..size {
            let pixel = icon.get_pixel(x, y).0;
            file.write_all(&[pixel[2], pixel[1], pixel[0], pixel[3]])?;
        }
    }
    file.write_all(&vec![0u8; and_bytes])?;
    Ok(())
}

pub(in crate::converters) fn read_svg_image(input_path: &Path) -> Result<::image::DynamicImage> {
    ensure_integrated_memory_budget(input_path, "SVG")?;
    let data = fs::read(input_path)?;
    let options = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(&data, &options)
        .map_err(|error| ConvertError::Message(format!("SVG illisible: {error}")))?;
    let size = tree.size().to_int_size();
    ensure_image_dimensions(size.width(), size.height(), "SVG")?;
    // tiny-skia plus the owned RGBA image coexist during this copy.
    let peak_bytes = u64::from(size.width()) * u64::from(size.height()) * 8;
    if peak_bytes > 256 * 1024 * 1024 {
        return Err(ConvertError::Message(
            "Ce SVG nécessite trop de mémoire pour le rendu intégré actuel.".to_string(),
        ));
    }
    let mut pixmap = resvg::tiny_skia::Pixmap::new(size.width(), size.height())
        .ok_or_else(|| ConvertError::Message("SVG illisible.".to_string()))?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::default(),
        &mut pixmap.as_mut(),
    );
    let pixels = pixmap
        .pixels()
        .iter()
        .flat_map(|pixel| {
            let color = pixel.demultiply();
            [color.red(), color.green(), color.blue(), color.alpha()]
        })
        .collect();
    let rgba = ::image::RgbaImage::from_raw(size.width(), size.height(), pixels)
        .ok_or_else(|| ConvertError::Message("SVG illisible.".to_string()))?;
    Ok(::image::DynamicImage::ImageRgba8(rgba))
}

pub(in crate::converters) fn ensure_image_dimensions(
    width: u32,
    height: u32,
    label: &str,
) -> Result<()> {
    if width == 0 || height == 0 {
        return Err(ConvertError::Message(format!(
            "Ce fichier {label} a des dimensions invalides."
        )));
    }
    if width > MAX_INTEGRATED_IMAGE_DIMENSION || height > MAX_INTEGRATED_IMAGE_DIMENSION {
        return Err(ConvertError::Message(format!(
            "Ce fichier {label} est trop grand pour le moteur intégré actuel (limite: {} px par côté).",
            MAX_INTEGRATED_IMAGE_DIMENSION
        )));
    }
    let pixels = u64::from(width) * u64::from(height);
    if pixels > MAX_INTEGRATED_IMAGE_PIXELS {
        return Err(ConvertError::Message(format!(
            "Ce fichier {label} est trop grand pour le moteur intégré actuel (limite: {} mégapixels).",
            MAX_INTEGRATED_IMAGE_PIXELS / 1_000_000
        )));
    }
    Ok(())
}
