use super::*;
use resvg::usvg::{ImageHrefResolver, ImageKind};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::Arc;

const MAX_SVG_BYTES: u64 = 16 * 1024 * 1024;
const MAX_RASTER_BYTES: usize = 64 * 1024 * 1024;
const MAX_RASTER_PIXELS: u64 = 32 * 1024 * 1024;

pub(super) fn parse(input: &Path) -> Result<resvg::usvg::Tree> {
    let file = File::open(input)?;
    if !file.metadata()?.is_file() || file.metadata()?.len() > MAX_SVG_BYTES {
        return Err(invalid(
            "Le SVG dépasse 16 Mio ou n’est pas un fichier régulier.",
        ));
    }
    let mut data = Vec::new();
    file.take(MAX_SVG_BYTES + 1).read_to_end(&mut data)?;
    if data.len() as u64 > MAX_SVG_BYTES {
        return Err(invalid("Le SVG dépasse 16 Mio."));
    }
    // Do not hand gzip input to usvg's unbounded SVGZ decompressor.
    let text = std::str::from_utf8(&data)
        .map_err(|_| invalid("Le SVG doit être un document XML UTF-8 non compressé."))?;
    let xml = roxmltree::Document::parse_with_options(
        text,
        roxmltree::ParsingOptions {
            allow_dtd: false,
            nodes_limit: 100_000,
            ..Default::default()
        },
    )
    .map_err(|_| invalid("Structure XML du SVG invalide ou trop complexe."))?;
    let root = input
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()?;
    let mut images = HashMap::new();
    let (mut total_bytes, mut total_pixels) = (0usize, 0u64);
    for node in xml
        .descendants()
        .filter(|node| matches!(node.tag_name().name(), "image" | "feImage"))
    {
        for attribute in node
            .attributes()
            .filter(|attribute| attribute.name() == "href")
        {
            let href = attribute.value();
            if href.starts_with('#') {
                continue;
            }
            if images.contains_key(href) {
                continue;
            }
            let bytes = external::resources::resource_bytes(href, &root)?;
            total_bytes = total_bytes
                .checked_add(bytes.len())
                .filter(|bytes| *bytes <= MAX_RASTER_BYTES)
                .ok_or_else(|| invalid("Les images du SVG dépassent 64 Mio."))?;
            let (kind, pixels) = raster(Arc::new(bytes))?;
            total_pixels = total_pixels
                .checked_add(pixels)
                .filter(|pixels| *pixels <= MAX_RASTER_PIXELS)
                .ok_or_else(|| invalid("Les images du SVG dépassent le budget mémoire."))?;
            images.insert(href.to_string(), kind);
        }
    }
    let options = resvg::usvg::Options {
        image_href_resolver: ImageHrefResolver {
            // Only prevalidated raster bytes can reach either resolver. Nested
            // SVGs are refused, so they cannot introduce another resource graph.
            resolve_data: Box::new(|_, bytes, _| raster(bytes).ok().map(|(kind, _)| kind)),
            resolve_string: Box::new(move |href, _| images.get(href).cloned()),
        },
        ..Default::default()
    };
    resvg::usvg::Tree::from_str(text, &options).map_err(|_| invalid("SVG illisible."))
}

fn raster(bytes: Arc<Vec<u8>>) -> Result<(ImageKind, u64)> {
    let format = image::guess_format(&bytes).map_err(|_| invalid("Image SVG illisible."))?;
    let kind = match format {
        ImageFormat::Png => ImageKind::PNG(bytes.clone()),
        ImageFormat::Jpeg => ImageKind::JPEG(bytes.clone()),
        ImageFormat::Gif => ImageKind::GIF(bytes.clone()),
        ImageFormat::WebP => ImageKind::WEBP(bytes.clone()),
        _ => {
            return Err(invalid(
                "Les ressources SVG doivent être des images PNG, JPEG, GIF ou WebP.",
            ));
        }
    };
    let (width, height) =
        image::ImageReader::with_format(Cursor::new(bytes.as_slice()), format).into_dimensions()?;
    ensure_image_dimensions(width, height, "SVG")?;
    let pixels = u64::from(width) * u64::from(height);
    if pixels > MAX_RASTER_PIXELS {
        return Err(invalid("Image du SVG trop grande pour le rendu intégré."));
    }
    Ok((kind, pixels))
}

fn invalid(message: &str) -> ConvertError {
    ConvertError::Message(format!("Ressource SVG : {message}"))
}
