use super::FontInspection;
use std::{ffi::c_void, os::raw::c_char, ptr, slice};

type CFTypeRef = *const c_void;
type CFArrayRef = *const c_void;
type CFStringRef = *const c_void;
type CFDataRef = *const c_void;
type CTFontRef = *const c_void;

const UTF8: u32 = 0x0800_0100;

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFArrayGetCount(array: CFArrayRef) -> isize;
    fn CFArrayGetValueAtIndex(array: CFArrayRef, index: isize) -> *const c_void;
    fn CFStringCreateWithCString(
        allocator: *const c_void,
        value: *const c_char,
        encoding: u32,
    ) -> CFStringRef;
    fn CFStringGetLength(value: CFStringRef) -> isize;
    fn CFStringGetMaximumSizeForEncoding(length: isize, encoding: u32) -> isize;
    fn CFStringGetCString(
        value: CFStringRef,
        buffer: *mut c_char,
        size: isize,
        encoding: u32,
    ) -> u8;
    fn CFDataGetLength(data: CFDataRef) -> isize;
    fn CFDataGetBytePtr(data: CFDataRef) -> *const u8;
    fn CFRelease(value: CFTypeRef);
}

#[link(name = "CoreText", kind = "framework")]
unsafe extern "C" {
    fn CTFontManagerCopyAvailableFontFamilyNames() -> CFArrayRef;
    fn CTFontCreateUIFontForLanguage(ui_type: u32, size: f64, language: CFStringRef) -> CTFontRef;
    fn CTFontCreateWithName(name: CFStringRef, size: f64, matrix: *const c_void) -> CTFontRef;
    fn CTFontCreateCopyWithSymbolicTraits(
        font: CTFontRef,
        size: f64,
        matrix: *const c_void,
        value: u32,
        mask: u32,
    ) -> CTFontRef;
    fn CTFontCopyFamilyName(font: CTFontRef) -> CFStringRef;
    fn CTFontCopyTable(font: CTFontRef, tag: u32, options: u32) -> CFDataRef;
    fn CTFontGetGlyphsForCharacters(
        font: CTFontRef,
        characters: *const u16,
        glyphs: *mut u16,
        count: isize,
    ) -> u8;
}

pub(super) fn list_system_fonts() -> Result<(String, Vec<String>), String> {
    let array = unsafe { CTFontManagerCopyAvailableFontFamilyNames() };
    if array.is_null() {
        return Err("CoreText returned no installed font families".into());
    }
    let mut families = Vec::new();
    let count = unsafe { CFArrayGetCount(array) };
    for index in 0..count {
        let value = unsafe { CFArrayGetValueAtIndex(array, index) } as CFStringRef;
        if let Some(name) = cf_string(value) {
            families.push(name);
        }
    }
    unsafe { CFRelease(array) };
    Ok((
        system_default_family().unwrap_or_else(|| "Helvetica".into()),
        families,
    ))
}

pub(super) fn inspect_font(
    family: &str,
    text: &str,
    bold: bool,
    italic: bool,
) -> Result<FontInspection, String> {
    let family_name = create_cf_string(family)?;
    let base_font = unsafe { CTFontCreateWithName(family_name, 12.0, ptr::null()) };
    unsafe { CFRelease(family_name) };
    if base_font.is_null() {
        return Err(format!("font family is not installed: {family}"));
    }
    let traits = (u32::from(italic)) | (u32::from(bold) << 1);
    let font = if traits == 0 {
        base_font
    } else {
        let matched = unsafe {
            CTFontCreateCopyWithSymbolicTraits(base_font, 12.0, ptr::null(), traits, traits)
        };
        unsafe { CFRelease(base_font) };
        if matched.is_null() {
            return Err(format!("font face is not installed: {family}"));
        }
        matched
    };
    let resolved_ref = unsafe { CTFontCopyFamilyName(font) };
    let resolved = cf_string(resolved_ref).unwrap_or_else(|| family.to_string());
    if !resolved_ref.is_null() {
        unsafe { CFRelease(resolved_ref) };
    }
    let characters = text
        .chars()
        .filter(|character| !character.is_control() && !character.is_whitespace())
        .collect::<String>()
        .encode_utf16()
        .collect::<Vec<_>>();
    let covers_text = if characters.is_empty() {
        true
    } else {
        let mut glyphs = vec![0u16; characters.len()];
        unsafe {
            CTFontGetGlyphsForCharacters(
                font,
                characters.as_ptr(),
                glyphs.as_mut_ptr(),
                characters.len() as isize,
            ) != 0
        }
    };
    let fs_type = copy_fs_type(font);
    unsafe { CFRelease(font) };
    Ok(FontInspection {
        family: resolved,
        fs_type,
        covers_text,
    })
}

fn system_default_family() -> Option<String> {
    let font = unsafe { CTFontCreateUIFontForLanguage(2, 0.0, ptr::null()) };
    if font.is_null() {
        return None;
    }
    let family = unsafe { CTFontCopyFamilyName(font) };
    let result = cf_string(family);
    if !family.is_null() {
        unsafe { CFRelease(family) };
    }
    unsafe { CFRelease(font) };
    result
}

fn copy_fs_type(font: CTFontRef) -> Option<u16> {
    let data = unsafe { CTFontCopyTable(font, u32::from_be_bytes(*b"OS/2"), 0) };
    if data.is_null() {
        return None;
    }
    let length = unsafe { CFDataGetLength(data) };
    let pointer = unsafe { CFDataGetBytePtr(data) };
    let result = if length >= 10 && !pointer.is_null() {
        let bytes = unsafe { slice::from_raw_parts(pointer, length as usize) };
        Some(u16::from_be_bytes([bytes[8], bytes[9]]))
    } else {
        None
    };
    unsafe { CFRelease(data) };
    result
}

fn create_cf_string(value: &str) -> Result<CFStringRef, String> {
    let c_string = std::ffi::CString::new(value).map_err(|_| "invalid family name")?;
    let result = unsafe { CFStringCreateWithCString(ptr::null(), c_string.as_ptr(), UTF8) };
    if result.is_null() {
        Err("CoreText could not create the family name".into())
    } else {
        Ok(result)
    }
}

fn cf_string(value: CFStringRef) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let length = unsafe { CFStringGetLength(value) };
    let maximum = unsafe { CFStringGetMaximumSizeForEncoding(length, UTF8) };
    if maximum < 0 {
        return None;
    }
    let mut bytes = vec![0u8; maximum as usize + 1];
    let copied = unsafe {
        CFStringGetCString(
            value,
            bytes.as_mut_ptr().cast::<c_char>(),
            bytes.len() as isize,
            UTF8,
        )
    };
    if copied == 0 {
        return None;
    }
    let end = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    String::from_utf8(bytes[..end].to_vec()).ok()
}
