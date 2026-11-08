use super::*;
use std::io::{Read, Seek, SeekFrom};

/// Windows icons can embed a PNG without an alpha channel. Decode that frame
/// as PNG, leaving DIB icons to the regular ICO decoder.
pub(super) fn read_frame(path: &Path) -> Result<Option<::image::DynamicImage>> {
    let mut file = std::io::BufReader::new(File::open(path)?);
    let mut header = [0; 6];
    file.read_exact(&mut header)?;
    if header[..4] != [0, 0, 1, 0] {
        return Ok(None);
    }
    let count = u16::from_le_bytes([header[4], header[5]]);
    let directory_end = 6 + u64::from(count) * 16;
    let file_size = file.get_ref().metadata()?.len();
    let mut best = None;
    for _ in 0..count {
        let mut entry = [0; 16];
        file.read_exact(&mut entry)?;
        let dimension = |n: u8| if n == 0 { 256 } else { u32::from(n) };
        let size = (dimension(entry[0]), dimension(entry[1]));
        let depth = u16::from_le_bytes([entry[6], entry[7]]);
        let score = (depth, size.0 * size.1);
        if best.as_ref().is_none_or(|(old, _, _, _)| score >= *old) {
            let length = u32::from_le_bytes(entry[8..12].try_into().unwrap());
            let offset = u32::from_le_bytes(entry[12..16].try_into().unwrap());
            best = Some((score, size, u64::from(offset), u64::from(length)));
        }
    }
    let Some((_, dimensions, offset, length)) = best else {
        return Ok(None);
    };
    if offset < directory_end || offset + length > file_size || length < 8 {
        return Err(ConvertError::Message("Trame ICO tronquée.".into()));
    }
    file.seek(SeekFrom::Start(offset))?;
    let mut signature = [0; 8];
    file.read_exact(&mut signature)?;
    if signature != *b"\x89PNG\r\n\x1a\n" {
        return Ok(None);
    }
    if length > 16 * 1024 * 1024 {
        return Err(ConvertError::Message(
            "Trame PNG de l'icône trop grande.".into(),
        ));
    }
    file.seek(SeekFrom::Start(offset))?;
    let mut bytes = Vec::new();
    file.take(length).read_to_end(&mut bytes)?;
    let mut reader =
        image::ImageReader::with_format(std::io::Cursor::new(&bytes), ImageFormat::Png);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(dimensions.0);
    limits.max_image_height = Some(dimensions.1);
    limits.max_alloc = Some(16 * 1024 * 1024);
    reader.limits(limits);
    let frame = reader.decode()?;
    if (frame.width(), frame.height()) != dimensions {
        return Err(ConvertError::Message(
            "Dimensions de trame ICO incorrectes.".into(),
        ));
    }
    Ok(Some(frame))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_png_frames_that_escape_the_icon_or_lie_about_dimensions() {
        let png = include_bytes!("../../../../tests/fixtures/formats/sample.png");
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("frame.ico");
        for (width, offset, length) in [
            (64, 6, png.len() as u32),
            (64, 22, png.len() as u32 + 1),
            (63, 22, png.len() as u32),
        ] {
            let mut data = vec![0, 0, 1, 0, 1, 0, width, 64, 0, 0, 1, 0, 24, 0];
            data.extend(length.to_le_bytes());
            data.extend(u32::to_le_bytes(offset));
            data.extend(png);
            std::fs::write(&path, data).unwrap();
            assert!(
                read_frame(&path).is_err(),
                "accepted width={width} offset={offset} length={length}"
            );
        }
    }
}
