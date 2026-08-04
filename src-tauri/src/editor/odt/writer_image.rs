use super::writer::odt_asset_path;
use super::writer_render::page_dimensions_mm;
use super::xml::xml_escape;
use crate::editor::document::{CommandResult, EditorAssetRef, EditorDocument};
use crate::editor::image_layout::{ImageLayout, parse_image_layout};
use serde_json::Value;

pub(super) struct RenderedImage {
    pub(super) frame: String,
    pub(super) automatic_style: String,
    pub(super) paragraph_style: &'static str,
}

pub(super) fn render_image(
    node: &Value,
    document: &EditorDocument,
    style_name: &str,
) -> CommandResult<RenderedImage> {
    let attrs = node
        .get("attrs")
        .and_then(Value::as_object)
        .ok_or_else(|| "EDITOR_ASSET_INVALID:Attributs d’image manquants.".to_string())?;
    let asset_id = attrs
        .get("assetId")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            "EDITOR_ASSET_INVALID:Identifiant d’image manquant pendant l’export.".to_string()
        })?;
    let asset = document
        .assets
        .iter()
        .find(|asset| asset.id == asset_id)
        .ok_or_else(|| "EDITOR_ASSET_MISSING:Image introuvable pendant l’export.".to_string())?;
    let layout = parse_image_layout(attrs)?;
    let (page_width, page_height) = page_dimensions_mm(&document.page);
    let content_width =
        (page_width - document.page.margins_mm.left - document.page.margins_mm.right).max(10.0);
    let content_height =
        (page_height - document.page.margins_mm.top - document.page.margins_mm.bottom).max(10.0);
    let width_mm = measure_to_mm(&layout.width, content_width, content_width.min(150.0));
    let height_mm = layout
        .height
        .as_deref()
        .map(|height| measure_to_mm(height, content_height, content_height.min(100.0)))
        .unwrap_or_else(|| image_height_mm(width_mm, content_height, asset));
    let automatic_style = image_style(style_name, &layout);
    let frame = image_frame(
        style_name,
        attrs
            .get("title")
            .and_then(Value::as_str)
            .or_else(|| attrs.get("alt").and_then(Value::as_str))
            .unwrap_or(&asset.name),
        asset,
        width_mm,
        height_mm,
        &layout,
    );
    Ok(RenderedImage {
        frame,
        automatic_style,
        paragraph_style: match layout.align.as_str() {
            "left" => "Standard",
            "right" => "Right",
            _ => "Center",
        },
    })
}

fn image_style(name: &str, layout: &ImageLayout) -> String {
    let wrap = if layout.wrap_mode == "parallel" {
        "parallel"
    } else {
        "none"
    };
    let positioning = if layout.layout_mode == "floating" {
        let horizontal = if layout.offset_x_mm.abs() > f64::EPSILON {
            "from-left"
        } else {
            layout.align.as_str()
        };
        format!(
            " style:horizontal-pos=\"{horizontal}\" style:horizontal-rel=\"paragraph\" style:vertical-pos=\"from-top\" style:vertical-rel=\"paragraph\""
        )
    } else {
        String::new()
    };
    format!(
        "<style:style style:name=\"{}\" style:family=\"graphic\"><style:graphic-properties style:wrap=\"{wrap}\"{positioning}/></style:style>",
        xml_escape(name)
    )
}

fn image_frame(
    style_name: &str,
    title: &str,
    asset: &EditorAssetRef,
    width_mm: f64,
    height_mm: f64,
    layout: &ImageLayout,
) -> String {
    let anchor = if layout.layout_mode == "floating" {
        "paragraph"
    } else {
        "as-char"
    };
    let position = if layout.layout_mode == "floating" {
        format!(
            " svg:x=\"{:.3}mm\" svg:y=\"{:.3}mm\"",
            layout.offset_x_mm, layout.offset_y_mm
        )
    } else {
        String::new()
    };
    // ODF draw:z-index is non-negative. Offset the bounded editor range while
    // preserving the complete relative ordering from back (-100) to front (100).
    let odf_z_index = layout.z_index + 100;
    format!(
        "<draw:frame draw:name=\"{}\" draw:style-name=\"{}\" draw:z-index=\"{odf_z_index}\" text:anchor-type=\"{anchor}\" svg:width=\"{width_mm:.3}mm\" svg:height=\"{height_mm:.3}mm\"{position}><draw:image xlink:href=\"{}\" xlink:type=\"simple\" xlink:show=\"embed\" xlink:actuate=\"onLoad\"/></draw:frame>",
        xml_escape(title),
        xml_escape(style_name),
        xml_escape(&odt_asset_path(asset)),
    )
}

fn measure_to_mm(value: &str, reference_mm: f32, default_mm: f32) -> f64 {
    if value == "auto" {
        return f64::from(default_mm);
    }
    let lower = value.to_ascii_lowercase();
    let parsed = [
        ("cm", 10.0),
        ("mm", 1.0),
        ("in", 25.4),
        ("px", 25.4 / 96.0),
        ("pt", 25.4 / 72.0),
    ]
    .into_iter()
    .find_map(|(unit, factor)| {
        lower
            .strip_suffix(unit)
            .and_then(|number| number.parse::<f64>().ok())
            .map(|number| number * factor)
    })
    .or_else(|| {
        lower
            .strip_suffix('%')
            .and_then(|number| number.parse::<f64>().ok())
            .map(|percentage| f64::from(reference_mm) * percentage / 100.0)
    })
    .unwrap_or(f64::from(default_mm));
    parsed.clamp(1.0, f64::from(reference_mm.max(1.0)))
}

fn image_height_mm(width_mm: f64, content_height_mm: f32, asset: &EditorAssetRef) -> f64 {
    let ratio = match (asset.width, asset.height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => {
            f64::from(height) / f64::from(width)
        }
        _ => 2.0 / 3.0,
    };
    (width_mm * ratio).clamp(1.0, f64::from(content_height_mm.max(1.0)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn css_image_measures_are_converted_to_physical_odf_units() {
        assert!((measure_to_mm("96px", 170.0, 150.0) - 25.4).abs() < 0.001);
        assert!((measure_to_mm("50%", 170.0, 150.0) - 85.0).abs() < 0.001);
        assert!((measure_to_mm("2in", 170.0, 150.0) - 50.8).abs() < 0.001);
    }
}
