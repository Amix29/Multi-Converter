use super::document::CommandResult;
use serde_json::{Map, Value};

const MAX_OFFSET_MM: f64 = 100_000.0;
const MAX_Z_INDEX: i64 = 100;
const MAX_IMAGE_PIXELS: f64 = 200_000.0;

#[derive(Clone, Debug, PartialEq)]
pub(super) struct ImageLayout {
    pub(super) width: String,
    pub(super) height: Option<String>,
    pub(super) align: String,
    pub(super) layout_mode: String,
    pub(super) offset_x_mm: f64,
    pub(super) offset_y_mm: f64,
    pub(super) z_index: i64,
    pub(super) wrap_mode: String,
}

pub(super) fn parse_image_layout(attrs: &Map<String, Value>) -> CommandResult<ImageLayout> {
    let width = optional_measure(attrs, "width")?.unwrap_or_else(|| "15cm".to_string());
    let height = optional_measure(attrs, "height")?;
    let align = optional_enum(attrs, "align", &["left", "center", "right"], "center")?;
    let layout_mode = optional_enum(attrs, "layoutMode", &["flow", "floating"], "flow")?;
    let offset_x_mm = optional_number(attrs, "offsetXmm", 0.0, -MAX_OFFSET_MM, MAX_OFFSET_MM)?;
    let offset_y_mm = optional_number(attrs, "offsetYmm", 0.0, -MAX_OFFSET_MM, MAX_OFFSET_MM)?;
    let z_index = optional_integer(attrs, "zIndex", 0, -MAX_Z_INDEX, MAX_Z_INDEX)?;
    let wrap_mode = optional_enum(attrs, "wrapMode", &["none", "parallel"], "none")?;
    Ok(ImageLayout {
        width,
        height,
        align,
        layout_mode,
        offset_x_mm,
        offset_y_mm,
        z_index,
        wrap_mode,
    })
}

fn optional_measure(attrs: &Map<String, Value>, name: &str) -> CommandResult<Option<String>> {
    let Some(value) = attrs.get(name).filter(|value| !value.is_null()) else {
        return Ok(None);
    };
    let value = value
        .as_str()
        .filter(|value| valid_measure(value))
        .ok_or_else(invalid_layout)?;
    Ok(Some(value.to_string()))
}

fn optional_enum(
    attrs: &Map<String, Value>,
    name: &str,
    allowed: &[&str],
    default: &str,
) -> CommandResult<String> {
    let Some(value) = attrs.get(name).filter(|value| !value.is_null()) else {
        return Ok(default.to_string());
    };
    value
        .as_str()
        .filter(|value| allowed.contains(value))
        .map(str::to_string)
        .ok_or_else(invalid_layout)
}

fn optional_number(
    attrs: &Map<String, Value>,
    name: &str,
    default: f64,
    minimum: f64,
    maximum: f64,
) -> CommandResult<f64> {
    let Some(value) = attrs.get(name).filter(|value| !value.is_null()) else {
        return Ok(default);
    };
    value
        .as_f64()
        .filter(|value| value.is_finite() && (minimum..=maximum).contains(value))
        .ok_or_else(invalid_layout)
}

fn optional_integer(
    attrs: &Map<String, Value>,
    name: &str,
    default: i64,
    minimum: i64,
    maximum: i64,
) -> CommandResult<i64> {
    let Some(value) = attrs.get(name).filter(|value| !value.is_null()) else {
        return Ok(default);
    };
    value
        .as_i64()
        .filter(|value| (minimum..=maximum).contains(value))
        .ok_or_else(invalid_layout)
}

fn valid_measure(value: &str) -> bool {
    if value == "auto" {
        return true;
    }
    if value.is_empty() || value.len() > 24 || value.trim() != value {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    for (unit, maximum) in [
        ("cm", MAX_IMAGE_PIXELS * 2.54 / 96.0),
        ("mm", MAX_IMAGE_PIXELS * 25.4 / 96.0),
        ("in", MAX_IMAGE_PIXELS / 96.0),
        ("px", MAX_IMAGE_PIXELS),
        ("pt", MAX_IMAGE_PIXELS * 72.0 / 96.0),
        ("%", 100_000.0),
    ] {
        if let Some(number) = lower.strip_suffix(unit) {
            return number
                .parse::<f64>()
                .is_ok_and(|number| number.is_finite() && number > 0.0 && number <= maximum);
        }
    }
    false
}

fn invalid_layout() -> String {
    "EDITOR_ASSET_INVALID:Paramètres de placement d’image invalides.".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn attrs(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }

    #[test]
    fn legacy_image_layout_receives_safe_defaults() {
        let parsed =
            parse_image_layout(&attrs(json!({ "width": "12cm", "align": "left" }))).unwrap();
        assert_eq!(parsed.width, "12cm");
        assert_eq!(parsed.align, "left");
        assert_eq!(parsed.layout_mode, "flow");
        assert_eq!(parsed.wrap_mode, "none");
    }

    #[test]
    fn floating_image_layout_accepts_the_bounded_contract() {
        let parsed = parse_image_layout(&attrs(json!({
            "width": "640px",
            "height": "80%",
            "layoutMode": "floating",
            "offsetXmm": -25.5,
            "offsetYmm": 42,
            "zIndex": -100,
            "wrapMode": "parallel"
        })))
        .unwrap();
        assert_eq!(parsed.offset_x_mm, -25.5);
        assert_eq!(parsed.z_index, -100);
    }

    #[test]
    fn image_layout_rejects_unsafe_measures_and_unbounded_values() {
        for value in [
            json!({ "width": "calc(100% + 2px)" }),
            json!({ "width": "200001px" }),
            json!({ "layoutMode": "absolute" }),
            json!({ "offsetXmm": 100001 }),
            json!({ "zIndex": 101 }),
            json!({ "zIndex": 1.5 }),
            json!({ "wrapMode": "through" }),
        ] {
            assert!(parse_image_layout(&attrs(value)).is_err());
        }
    }
}
