use image::{GenericImageView, ImageFormat};
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};

const MAX_SOURCE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_IMAGE_PIXELS: u64 = 120_000_000;
const MAX_IMAGE_SIDE: u32 = 32_768;

pub(super) struct PreparedImage {
    _temp: tempfile::TempDir,
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
}

pub(super) fn prepare_image(path: &str) -> Result<PreparedImage, String> {
    if path.starts_with("http://") || path.starts_with("https://") {
        return Err("OCR_REMOTE_SOURCE:Les sources distantes sont interdites.".to_string());
    }
    let source = Path::new(path);
    if !source.is_absolute() || !source.is_file() {
        return Err("OCR_SOURCE_INVALID:Le fichier image est introuvable.".to_string());
    }
    let metadata = source.metadata().map_err(|error| error.to_string())?;
    if metadata.len() > MAX_SOURCE_BYTES {
        return Err("OCR_SOURCE_LIMIT:L’image dépasse 128 Mio.".to_string());
    }

    let reader = image::ImageReader::open(source)
        .map_err(|_| "OCR_IMAGE_CORRUPT:L’image est illisible.".to_string())?
        .with_guessed_format()
        .map_err(|_| "OCR_IMAGE_CORRUPT:L’image est illisible.".to_string())?;
    let format = reader
        .format()
        .ok_or_else(|| "OCR_IMAGE_TYPE:Le type réel de l’image est inconnu.".to_string())?;
    if !matches!(
        format,
        ImageFormat::Png
            | ImageFormat::Jpeg
            | ImageFormat::WebP
            | ImageFormat::Tiff
            | ImageFormat::Bmp
    ) {
        return Err("OCR_IMAGE_TYPE:Ce format d’image n’est pas pris en charge.".to_string());
    }
    let mut image = reader
        .decode()
        .map_err(|_| "OCR_IMAGE_CORRUPT:L’image est corrompue ou incomplète.".to_string())?;
    image = apply_exif_orientation(source, image);
    let (width, height) = image.dimensions();
    validate_dimensions(width, height)?;

    let temp = tempfile::Builder::new()
        .prefix("multi-converter-ocr-image-")
        .tempdir()
        .map_err(|error| error.to_string())?;
    let normalized = temp.path().join("input.png");
    image
        .save_with_format(&normalized, ImageFormat::Png)
        .map_err(|error| format!("OCR_IMAGE_NORMALIZE:{error}"))?;
    Ok(PreparedImage {
        _temp: temp,
        path: normalized,
        width,
        height,
    })
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE {
        return Err("OCR_IMAGE_DIMENSION:L’image dépasse 32 768 px par côté.".to_string());
    }
    if u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return Err("OCR_IMAGE_PIXELS:L’image dépasse 120 mégapixels.".to_string());
    }
    Ok(())
}

fn apply_exif_orientation(path: &Path, image: image::DynamicImage) -> image::DynamicImage {
    let orientation = File::open(path)
        .ok()
        .and_then(|file| {
            exif::Reader::new()
                .read_from_container(&mut BufReader::new(file))
                .ok()
        })
        .and_then(|exif| {
            exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
                .and_then(|field| field.value.get_uint(0))
        })
        .unwrap_or(1);
    match orientation {
        2 => image.fliph(),
        3 => image.rotate180(),
        4 => image.flipv(),
        5 => image.rotate90().fliph(),
        6 => image.rotate90(),
        7 => image.rotate270().fliph(),
        8 => image.rotate270(),
        _ => image,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use sha2::{Digest, Sha256};
    use std::fs;

    #[test]
    fn image_limits_are_enforced_before_inference() {
        assert!(validate_dimensions(32_769, 1).is_err());
        assert!(validate_dimensions(20_000, 10_000).is_err());
        assert!(validate_dimensions(4_000, 3_000).is_ok());
    }

    #[test]
    fn five_supported_image_formats_are_normalized_without_touching_sources() {
        let temp = tempfile::tempdir().unwrap();
        let image = image::DynamicImage::new_rgb8(24, 16);
        for (extension, format) in [
            ("png", ImageFormat::Png),
            ("jpg", ImageFormat::Jpeg),
            ("webp", ImageFormat::WebP),
            ("tiff", ImageFormat::Tiff),
            ("bmp", ImageFormat::Bmp),
        ] {
            let source = temp.path().join(format!("fixture.{extension}"));
            image.save_with_format(&source, format).unwrap();
            let original = fs::read(&source).unwrap();
            let prepared = prepare_image(&source.to_string_lossy()).unwrap();
            assert_eq!((prepared.width, prepared.height), (24, 16));
            assert_eq!(fs::read(&source).unwrap(), original);
            assert_eq!(
                image::ImageReader::open(&prepared.path)
                    .unwrap()
                    .with_guessed_format()
                    .unwrap()
                    .format(),
                Some(ImageFormat::Png)
            );
        }
    }

    #[test]
    fn phase_6_manifest_image_formats_are_normalized_without_touching_sources() {
        let repository = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("repository root");
        let manifest_path = repository.join("tests/fixtures/ocr/corpus-manifest.json");
        let manifest: Value = serde_json::from_slice(&fs::read(manifest_path).unwrap()).unwrap();
        let fixtures = manifest["cases"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|entry| entry["kind"] == "rust-normalization")
            .collect::<Vec<_>>();
        assert_eq!(fixtures.len(), 5);

        for fixture in fixtures {
            let source = repository.join(fixture["input"].as_str().unwrap());
            let original = fs::read(&source).unwrap();
            let source_sha256 = format!("{:x}", Sha256::digest(&original));
            assert_eq!(source_sha256, fixture["sha256"].as_str().unwrap());
            let prepared = prepare_image(&source.to_string_lossy()).unwrap();
            assert_eq!(fs::read(&source).unwrap(), original);
            assert_eq!(
                image::ImageReader::open(&prepared.path)
                    .unwrap()
                    .with_guessed_format()
                    .unwrap()
                    .format(),
                Some(ImageFormat::Png)
            );
        }
    }

    #[test]
    fn remote_and_corrupt_sources_are_rejected() {
        assert!(matches!(
            prepare_image("https://example.invalid/image.png"),
            Err(error) if error.starts_with("OCR_REMOTE_SOURCE:")
        ));
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("corrupt.png");
        fs::write(&source, b"not an image").unwrap();
        assert!(prepare_image(&source.to_string_lossy()).is_err());
    }
}
