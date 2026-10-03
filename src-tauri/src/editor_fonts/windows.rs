use super::FontInspection;
use std::{ffi::c_void, slice};
use windows::{
    Win32::Graphics::DirectWrite::{
        DWRITE_FACTORY_TYPE_SHARED, DWRITE_FONT_STRETCH_NORMAL, DWRITE_FONT_STYLE_ITALIC,
        DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_WEIGHT_BOLD, DWRITE_FONT_WEIGHT_NORMAL,
        DWriteCreateFactory, IDWriteFactory, IDWriteFont, IDWriteFontCollection,
    },
    core::{BOOL, PCWSTR},
};

pub(super) fn list_system_fonts() -> Result<(String, Vec<String>), String> {
    let collection = collection()?;
    let mut families = Vec::with_capacity(unsafe { collection.GetFontFamilyCount() } as usize);
    for index in 0..unsafe { collection.GetFontFamilyCount() } {
        let name = unsafe {
            let family = collection.GetFontFamily(index).map_err(error_text)?;
            localized_name(&family.GetFamilyNames().map_err(error_text)?)?
        };
        if !name.is_empty() {
            families.push(name);
        }
    }
    Ok(("Segoe UI".into(), families))
}

pub(super) fn inspect_font(
    family: &str,
    text: &str,
    bold: bool,
    italic: bool,
) -> Result<FontInspection, String> {
    let collection = collection()?;
    let font = matching_font(&collection, family, bold, italic)?;
    let resolved_family = unsafe {
        let resolved = font.GetFontFamily().map_err(error_text)?;
        localized_name(&resolved.GetFamilyNames().map_err(error_text)?)?
    };
    let covers_text = text
        .chars()
        .filter(|character| !character.is_control() && !character.is_whitespace())
        .try_fold(true, |covered, character| {
            if !covered {
                return Ok(false);
            }
            unsafe { font.HasCharacter(character as u32) }
                .map(|value| value.as_bool())
                .map_err(error_text)
        })?;
    let fs_type = font_fs_type(&font)?;
    Ok(FontInspection {
        family: resolved_family,
        fs_type,
        covers_text,
    })
}

fn collection() -> Result<IDWriteFontCollection, String> {
    let factory = unsafe {
        DWriteCreateFactory::<IDWriteFactory>(DWRITE_FACTORY_TYPE_SHARED).map_err(error_text)?
    };
    let mut collection = None;
    unsafe {
        factory
            .GetSystemFontCollection(&mut collection, false)
            .map_err(error_text)?;
    }
    collection.ok_or_else(|| "DirectWrite returned no system font collection".into())
}

fn matching_font(
    collection: &IDWriteFontCollection,
    family: &str,
    bold: bool,
    italic: bool,
) -> Result<IDWriteFont, String> {
    let wide = family.encode_utf16().chain([0]).collect::<Vec<_>>();
    let mut index = 0;
    let mut exists = BOOL::default();
    unsafe {
        collection
            .FindFamilyName(PCWSTR(wide.as_ptr()), &mut index, &mut exists)
            .map_err(error_text)?;
    }
    if !exists.as_bool() {
        return Err(format!("font family is not installed: {family}"));
    }
    unsafe {
        collection
            .GetFontFamily(index)
            .map_err(error_text)?
            .GetFirstMatchingFont(
                if bold {
                    DWRITE_FONT_WEIGHT_BOLD
                } else {
                    DWRITE_FONT_WEIGHT_NORMAL
                },
                DWRITE_FONT_STRETCH_NORMAL,
                if italic {
                    DWRITE_FONT_STYLE_ITALIC
                } else {
                    DWRITE_FONT_STYLE_NORMAL
                },
            )
            .map_err(error_text)
    }
}

unsafe fn localized_name(
    names: &windows::Win32::Graphics::DirectWrite::IDWriteLocalizedStrings,
) -> Result<String, String> {
    let length = unsafe { names.GetStringLength(0).map_err(error_text)? } as usize;
    let mut buffer = vec![0u16; length + 1];
    unsafe { names.GetString(0, &mut buffer).map_err(error_text)? };
    Ok(String::from_utf16_lossy(&buffer[..length]))
}

fn font_fs_type(font: &IDWriteFont) -> Result<Option<u16>, String> {
    let face = unsafe { font.CreateFontFace().map_err(error_text)? };
    let mut data = std::ptr::null_mut::<c_void>();
    let mut size = 0u32;
    let mut context = std::ptr::null_mut::<c_void>();
    let mut exists = BOOL::default();
    unsafe {
        face.TryGetFontTable(
            u32::from_le_bytes(*b"OS/2"),
            &mut data,
            &mut size,
            &mut context,
            &mut exists,
        )
        .map_err(error_text)?;
    }
    if !exists.as_bool() || data.is_null() {
        return Ok(None);
    }
    let bytes = unsafe { slice::from_raw_parts(data.cast::<u8>(), size as usize) };
    let result = bytes
        .get(8..10)
        .map(|value| u16::from_be_bytes([value[0], value[1]]));
    unsafe { face.ReleaseFontTable(context) };
    Ok(result)
}

fn error_text(error: windows::core::Error) -> String {
    error.to_string()
}
