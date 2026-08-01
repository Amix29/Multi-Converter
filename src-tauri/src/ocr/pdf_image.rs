use std::path::{Path, PathBuf};

pub(super) fn crop_light_page_border(source: &Path, output: &Path) -> Result<PathBuf, String> {
    let image = image::open(source).map_err(|error| format!("OCR_IMAGE_CORRUPT:{error}"))?;
    let rgb = image.to_rgb8();
    let (width, height) = rgb.dimensions();
    let mut bounds: Option<(u32, u32, u32, u32)> = None;
    for (x, y, pixel) in rgb.enumerate_pixels() {
        if pixel.0.iter().all(|channel| *channel >= 245) {
            continue;
        }
        bounds = Some(match bounds {
            Some((left, top, right, bottom)) => {
                (left.min(x), top.min(y), right.max(x), bottom.max(y))
            }
            None => (x, y, x, y),
        });
    }
    let Some((left, top, right, bottom)) = bounds else {
        return Ok(source.to_path_buf());
    };
    let content_height = bottom - top + 1;
    let margin = content_height.saturating_mul(2).max(24);
    let left = left.saturating_sub(margin);
    let top = top.saturating_sub(margin);
    let right = right.saturating_add(margin).min(width - 1);
    let bottom = bottom.saturating_add(margin).min(height - 1);
    let crop_width = right - left + 1;
    let crop_height = bottom - top + 1;
    if u64::from(crop_width) * u64::from(crop_height) * 10
        >= u64::from(width) * u64::from(height) * 9
    {
        return Ok(source.to_path_buf());
    }
    image
        .crop_imm(left, top, crop_width, crop_height)
        .save_with_format(output, image::ImageFormat::Png)
        .map_err(|error| format!("OCR_IMAGE_NORMALIZE:{error}"))?;
    Ok(output.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn light_pdf_margins_are_cropped_without_rescaling_content() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("page.png");
        let output = temp.path().join("cropped.png");
        let mut page = image::RgbImage::from_pixel(200, 200, image::Rgb([255, 255, 255]));
        for y in 90..110 {
            for x in 60..140 {
                page.put_pixel(x, y, image::Rgb([20, 20, 20]));
            }
        }
        page.save(&source).unwrap();
        let cropped = crop_light_page_border(&source, &output).unwrap();
        let dimensions = image::GenericImageView::dimensions(&image::open(cropped).unwrap());
        assert!(dimensions.0 < 200 && dimensions.1 < 200);
        assert!(dimensions.0 >= 80 && dimensions.1 >= 20);
    }
}
