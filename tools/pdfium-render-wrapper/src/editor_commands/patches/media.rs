use crate::editor_contracts::PdfEditPatchV1;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits};
use pdfium_render::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};

use super::{ensure_bounds_on_page, get_page, parse_index};

const MAX_IMAGE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_IMAGE_SIDE: u32 = 32_768;
const MAX_IMAGE_PIXELS: u64 = 120_000_000;

pub(super) fn apply_image_patch(
    document: &PdfDocument<'_>,
    patch: &PdfEditPatchV1,
) -> Result<(), String> {
    let image = load_image(Path::new(patch.image_path.as_deref().ok_or_else(|| {
        "PDF_EDITOR_IMAGE_PATH:Le chemin de l’image est absent.".to_string()
    })?))?;
    let mut page = get_page(document, patch.page_number)?;
    match patch.operation.as_str() {
        "insertImage" => {
            let bounds = patch.bounds.as_ref().unwrap();
            ensure_bounds_on_page(&page, bounds)?;
            page.objects_mut()
                .create_image_object(
                    PdfPoints::new(bounds.x),
                    PdfPoints::new(bounds.y),
                    &image,
                    Some(PdfPoints::new(bounds.width)),
                    Some(PdfPoints::new(bounds.height)),
                )
                .map_err(|error| format!("PDF_EDITOR_INSERT_IMAGE:{error}"))?;
        }
        "replaceImage" => {
            if patch.bounds.is_some() {
                return Err("PDF_EDITOR_REPLACE_IMAGE_BOUNDS:Le remplacement conserve la géométrie existante ; utilisez transformObject pour la modifier.".into());
            }
            let mut object = page
                .objects()
                .get(parse_index(patch, 'o')?)
                .map_err(|error| format!("PDF_EDITOR_REPLACE_IMAGE:{error}"))?;
            match &mut object {
                PdfPageObject::Image(image_object) => image_object
                    .set_image(&image)
                    .map_err(|error| format!("PDF_EDITOR_REPLACE_IMAGE:{error}"))?,
                _ => {
                    return Err(
                        "PDF_EDITOR_PATCH_TYPE:Seul un objet image accepte replaceImage.".into(),
                    );
                }
            }
        }
        _ => return Err("PDF_EDITOR_PATCH_UNSUPPORTED:Opération d’image inconnue.".into()),
    }
    page.regenerate_content()
        .map_err(|error| format!("PDF_EDITOR_PATCH_COMMIT:{error}"))
}

fn load_image(path: &Path) -> Result<DynamicImage, String> {
    let path = validate_image_path(path)?;
    let mut reader = ImageReader::open(&path)
        .and_then(ImageReader::with_guessed_format)
        .map_err(|error| format!("PDF_EDITOR_IMAGE_READ:{error}"))?;
    let format = reader
        .format()
        .ok_or_else(|| "PDF_EDITOR_IMAGE_TYPE:Type d’image réel inconnu.".to_string())?;
    if !matches!(
        format,
        ImageFormat::Png
            | ImageFormat::Jpeg
            | ImageFormat::WebP
            | ImageFormat::Tiff
            | ImageFormat::Bmp
    ) {
        return Err(
            "PDF_EDITOR_IMAGE_TYPE:Seuls PNG, JPEG, WebP, TIFF et BMP sont acceptés.".into(),
        );
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_SIDE);
    limits.max_image_height = Some(MAX_IMAGE_SIDE);
    limits.max_alloc = Some(512 * 1024 * 1024);
    reader.limits(limits);
    let mut decoder = reader
        .into_decoder()
        .map_err(|error| format!("PDF_EDITOR_IMAGE_DECODE:{error}"))?;
    let (width, height) = decoder.dimensions();
    if u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return Err("PDF_EDITOR_IMAGE_LIMIT:L’image dépasse 120 mégapixels.".into());
    }
    let orientation = decoder
        .orientation()
        .map_err(|error| format!("PDF_EDITOR_IMAGE_ORIENTATION:{error}"))?;
    let mut image = DynamicImage::from_decoder(decoder)
        .map_err(|error| format!("PDF_EDITOR_IMAGE_DECODE:{error}"))?;
    image.apply_orientation(orientation);
    Ok(image)
}

fn validate_image_path(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() || !path.is_file() {
        return Err("PDF_EDITOR_IMAGE_PATH:L’image locale est introuvable.".into());
    }
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("PDF_EDITOR_IMAGE_METADATA:{error}"))?;
    if is_link_or_reparse(&metadata) || metadata.len() > MAX_IMAGE_BYTES {
        return Err("PDF_EDITOR_IMAGE_PATH:L’image est un lien ou dépasse 128 Mio.".into());
    }
    path.canonicalize()
        .map_err(|error| format!("PDF_EDITOR_IMAGE_PATH:{error}"))
}

fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}
