use tauri::{Theme, WebviewWindow};

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ThemePreference {
    System,
    Light,
    Dark,
}

impl ThemePreference {
    fn native_theme(self) -> Option<Theme> {
        match self {
            Self::System => None,
            Self::Light => Some(Theme::Light),
            Self::Dark => Some(Theme::Dark),
        }
    }
}

#[tauri::command]
pub(crate) fn sync_window_theme(
    window: WebviewWindow,
    preference: ThemePreference,
    background: String,
    foreground: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Window theme updates are restricted to the main window.".into());
    }
    let colors = [parse_color(&background)?, parse_color(&foreground)?];
    window
        .set_theme(preference.native_theme())
        .map_err(|error| error.to_string())?;
    apply_caption_colors(&window, colors)
}

// CSS #RRGGBB becomes the COLORREF 0x00BBGGRR expected by DWM.
fn parse_color(value: &str) -> Result<u32, String> {
    let hex = value
        .strip_prefix('#')
        .filter(|hex| hex.len() == 6 && hex.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or("Window colors must be six-digit hexadecimal RGB values.")?;
    let rgb = u32::from_str_radix(hex, 16).map_err(|error| error.to_string())?;
    Ok(((rgb >> 16) & 0xff) | (rgb & 0xff00) | ((rgb & 0xff) << 16))
}

#[cfg(windows)]
fn apply_caption_colors(window: &WebviewWindow, colors: [u32; 2]) -> Result<(), String> {
    // Keep the two documented DWM attributes and their platform FFI local.
    const CAPTION_COLOR: u32 = 35;
    const TEXT_COLOR: u32 = 36;
    #[link(name = "dwmapi")]
    unsafe extern "system" {
        #[link_name = "DwmSetWindowAttribute"]
        fn set_window_attribute(
            window: windows_sys::Win32::Foundation::HWND,
            attribute: u32,
            value: *const std::ffi::c_void,
            size: u32,
        ) -> i32;
    }

    // Windows 10 supports light/dark window themes, but not these Windows 11 colors.
    const UNSUPPORTED_ATTRIBUTE: i32 = 0x80070057_u32 as i32;
    let handle = window.hwnd().map_err(|error| error.to_string())?;
    for (attribute, color) in [CAPTION_COLOR, TEXT_COLOR].into_iter().zip(colors) {
        // SAFETY: Tauri owns this live HWND; color is a COLORREF and remains valid
        // for the synchronous call. The supplied byte count matches its u32 storage.
        let result = unsafe {
            set_window_attribute(
                handle.0,
                attribute,
                (&color as *const u32).cast(),
                std::mem::size_of::<u32>() as u32,
            )
        };
        if result < 0 && result != UNSUPPORTED_ATTRIBUTE {
            return Err(format!(
                "Native title-bar color update failed: 0x{result:08X}"
            ));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn apply_caption_colors(_window: &WebviewWindow, _colors: [u32; 2]) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn css_colors_use_windows_colorref_byte_order() {
        assert_eq!(parse_color("#f5f3ec").unwrap(), 0x00ecf3f5);
        assert_eq!(parse_color("#111710").unwrap(), 0x00101711);
        assert_eq!(parse_color("#1D241F").unwrap(), 0x001f241d);
        assert_eq!(parse_color("#eef2e8").unwrap(), 0x00e8f2ee);
        for invalid in ["red", "#fff", "#ffffff00", "#gg0000", "#💚00", " #ffffff"] {
            assert!(parse_color(invalid).is_err(), "accepted {invalid}");
        }
    }

    #[test]
    fn system_preference_restores_native_os_tracking() {
        assert!(ThemePreference::System.native_theme().is_none());
        assert_eq!(ThemePreference::Light.native_theme(), Some(Theme::Light));
        assert_eq!(ThemePreference::Dark.native_theme(), Some(Theme::Dark));
        assert!(serde_json::from_str::<ThemePreference>("\"invalid\"").is_err());
    }
}
