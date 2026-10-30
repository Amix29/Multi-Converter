use super::*;
use ::image::ImageEncoder;

pub(in crate::converters) fn ensure_single_image(input: &Path) -> Result<()> {
    let reader = image::ImageReader::open(input)?.with_guessed_format()?;
    let multiple = match reader.format() {
        Some(ImageFormat::Png) => {
            image::codecs::png::PngDecoder::new(BufReader::new(File::open(input)?))?.is_apng()?
        }
        Some(ImageFormat::WebP) => {
            image::codecs::webp::WebPDecoder::new(BufReader::new(File::open(input)?))?
                .has_animation()
        }
        Some(ImageFormat::Gif) => gif_is_animated(input)?,
        Some(ImageFormat::Tiff) => tiff::decoder::Decoder::new(BufReader::new(File::open(input)?))
            .map_err(|_| {
                ConvertError::Message("Le fichier TIFF ne peut pas être analysé.".to_string())
            })?
            .more_images(),
        _ => false,
    };
    if multiple {
        return Err(ConvertError::Message(
            "Ce fichier contient plusieurs images, pages ou une animation. Cette conversion est arrêtée pour éviter de ne conserver que la première image.".to_string()));
    }
    Ok(())
}

pub(super) fn check_profile(profile: Option<&[u8]>) -> Result<()> {
    let Some(profile) = profile else {
        return Ok(());
    };
    if profile.len() > 4 * 1024 * 1024
        || profile.len() < 128
        || profile.get(36..40) != Some(b"acsp")
        || !matches!(profile.get(16..20), Some(b"RGB " | b"GRAY"))
    {
        return Err(ConvertError::Message(
            "Ce profil couleur ne peut pas être préservé par le moteur intégré. Utilisez une conversion avec gestion des couleurs dédiée.".to_string()));
    }
    Ok(())
}

pub(super) fn tiff_profile(input: &Path) -> Result<Option<Vec<u8>>> {
    let mut decoder = tiff::decoder::Decoder::new(BufReader::new(File::open(input)?))
        .map_err(|_| ConvertError::Message("Métadonnées TIFF illisibles.".to_string()))?;
    // Use the bounded TIFF metadata API directly: the generic ImageReader
    // did not expose this tag in the real encoder round-trip regression.
    decoder
        .find_tag(tiff::tags::Tag::IccProfile)
        .and_then(|value| value.map(|value| value.into_u8_vec()).transpose())
        .map_err(|_| ConvertError::Message("Profil ICC TIFF illisible.".to_string()))
}

pub(super) fn output_warnings(
    image: &image::DynamicImage,
    target: &str,
    profile: Option<&[u8]>,
    has_exif: bool,
) -> Vec<ConversionWarning> {
    let mut messages = Vec::new();
    if has_exif {
        messages.push(("image-exif-loss", "L’orientation est appliquée aux pixels. Les autres métadonnées EXIF, dont la résolution et la localisation éventuelle, ne sont pas recopiées."));
    }
    if profile.is_some() && !matches!(target, "jpg" | "png" | "webp" | "tiff") {
        messages.push(("image-profile-loss", "Le format de sortie ne conserve pas le profil ICC. L’apparence des couleurs peut changer."));
    }
    let color = image.color();
    if color.bits_per_pixel() / u16::from(color.channel_count()) > 8
        && !matches!(target, "png" | "tiff")
    {
        messages.push((
            "image-depth-loss",
            "La profondeur de couleur est réduite à 8 bits par composante.",
        ));
    }
    messages
        .into_iter()
        .map(|(code, message)| ConversionWarning {
            code: code.to_string(),
            message: message.to_string(),
            page_number: None,
        })
        .collect()
}

pub(super) fn encode_with_profile(
    image: image::DynamicImage,
    mut encoder: impl ImageEncoder,
    profile: Option<Vec<u8>>,
) -> Result<()> {
    if let Some(profile) = profile {
        encoder.set_icc_profile(profile).map_err(|_| {
            ConvertError::Message(
                "Le moteur de sortie ne peut pas conserver le profil ICC.".to_string(),
            )
        })?;
    }
    image.write_with_encoder(encoder)?;
    Ok(())
}

pub(super) fn encode_profiled_target(
    output: &Path,
    image: image::DynamicImage,
    target: &str,
    profile: Option<Vec<u8>>,
) -> Result<()> {
    let file = File::create(output)?;
    match target {
        "png" => encode_with_profile(image, image::codecs::png::PngEncoder::new(file), profile),
        "webp" => encode_with_profile(
            image,
            image::codecs::webp::WebPEncoder::new_lossless(file),
            profile,
        ),
        "tiff" => encode_with_profile(image, image::codecs::tiff::TiffEncoder::new(file), profile),
        _ => unreachable!("profiled image target is checked by the caller"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::ImageDecoder;

    #[test]
    fn icc_survives_supported_encoders_and_orientation_metadata_is_not_copied() {
        let directory = tempfile::tempdir().unwrap();
        let mut profile = include_bytes!("../../../../tests/fixtures/images/srgb.icc").to_vec();
        for target in ["png", "jpg", "webp", "tiff"] {
            let output = directory.path().join(format!("profile.{target}"));
            write_image_with_profile(
                &output,
                image::DynamicImage::new_rgb8(16, 16),
                target,
                QualityProfile::Balanced,
                Some(profile.clone()),
            )
            .unwrap();
            let mut decoder = image::ImageReader::open(&output)
                .unwrap()
                .with_guessed_format()
                .unwrap()
                .into_decoder()
                .unwrap();
            if target == "tiff" {
                let mut tiff =
                    tiff::decoder::Decoder::new(BufReader::new(File::open(&output).unwrap()))
                        .unwrap();
                assert_eq!(
                    tiff.get_tag_u8_vec(tiff::tags::Tag::IccProfile).unwrap(),
                    profile
                );
                assert_eq!(
                    read_integrated_image_with_profile(&output).unwrap().1,
                    Some(profile.clone())
                );
            } else {
                assert_eq!(
                    decoder.icc_profile().unwrap(),
                    Some(profile.clone()),
                    "{target}"
                );
            }
            assert!(decoder.exif_metadata().unwrap().is_none());
        }
        profile[16..20].copy_from_slice(b"CMYK");
        assert!(check_profile(Some(&profile)).is_err());
    }

    #[test]
    fn multipage_tiff_is_rejected_and_single_image_is_accepted() {
        let directory = tempfile::tempdir().unwrap();
        let input = directory.path().join("pages.tiff");
        let mut file = File::create(&input).unwrap();
        {
            let mut encoder = tiff::encoder::TiffEncoder::new(&mut file).unwrap();
            for _ in 0..2 {
                encoder
                    .write_image::<tiff::encoder::colortype::RGB8>(2, 2, &[120; 12])
                    .unwrap();
            }
        }
        drop(file);
        assert!(
            ensure_single_image(&input)
                .unwrap_err()
                .to_string()
                .contains("plusieurs")
        );
        let still = directory.path().join("still.png");
        image::DynamicImage::new_rgba8(2, 2).save(&still).unwrap();
        assert!(ensure_single_image(&still).is_ok());
        for name in ["animated.png", "animated.webp"] {
            let input = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../tests/fixtures/images")
                .join(name);
            let before = fs::read(&input).unwrap();
            assert!(
                ensure_single_image(&input)
                    .unwrap_err()
                    .to_string()
                    .contains("plusieurs")
            );
            assert_eq!(fs::read(&input).unwrap(), before);
        }
    }

    #[test]
    fn sixteen_bit_samples_survive_png_and_tiff_and_warn_for_jpeg() {
        let directory = tempfile::tempdir().unwrap();
        let source =
            image::DynamicImage::ImageRgb16(image::ImageBuffer::from_fn(16, 16, |x, y| {
                image::Rgb([x as u16 * 4000, y as u16 * 3000, 12345])
            }));
        for target in ["png", "tiff"] {
            let output = directory.path().join(format!("depth.{target}"));
            write_image_with_profile(&output, source.clone(), target, QualityProfile::High, None)
                .unwrap();
            assert_eq!(
                read_integrated_image(&output).unwrap().into_rgb16(),
                source.to_rgb16()
            );
        }
        assert!(
            output_warnings(&source, "jpg", None, false)
                .iter()
                .any(|warning| warning.code == "image-depth-loss")
        );
    }
}
