//! Installer-only Windows storage optimization. Runtime processes see the original bytes.
use std::fs::{self, File, OpenOptions};
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::os::windows::io::{AsRawHandle, RawHandle};
use std::path::{Path, PathBuf};

const MANIFEST: &str = include_str!(env!("MC_INSTALL_MANIFEST"));
const MIN_BYTES: u64 = 32 * 1024;
const OPEN_REPARSE_POINT: u32 = 0x0020_0000;
const REPARSE_POINT: u32 = 0x400;

#[repr(C)]
#[derive(Default)]
struct StandardInfo {
    allocation: i64,
    end: i64,
    links: u32,
    delete_pending: u8,
    directory: u8,
}

#[link(name = "kernel32")]
extern "system" {
    fn GetCompressedFileSizeW(path: *const u16, high: *mut u32) -> u32;
    fn GetFinalPathNameByHandleW(file: RawHandle, path: *mut u16, size: u32, flags: u32) -> u32;
    fn GetFileInformationByHandleEx(
        file: RawHandle,
        class: u32,
        info: *mut StandardInfo,
        size: u32,
    ) -> i32;
}
#[link(name = "wofutil")]
extern "system" {
    fn WofSetFileDataLocation(
        file: RawHandle,
        provider: u32,
        info: *const [u32; 2],
        size: u32,
    ) -> i32;
}

fn stored_bytes(path: &Path) -> io::Result<u64> {
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut high = 0;
    let low = unsafe { GetCompressedFileSizeW(wide.as_ptr(), &mut high) };
    if low == u32::MAX {
        let error = io::Error::last_os_error();
        if error.raw_os_error() != Some(0) {
            return Err(error);
        }
    }
    Ok((u64::from(high) << 32) | u64::from(low))
}

fn same_installed_file(file: &File, expected: &Path) -> bool {
    let handle = file.as_raw_handle();
    let mut info = StandardInfo::default();
    let ok = unsafe {
        GetFileInformationByHandleEx(handle, 1, &mut info, size_of::<StandardInfo>() as u32)
    };
    if ok == 0 || info.links != 1 || info.directory != 0 {
        return false;
    }
    let path: Vec<u16> = expected.as_os_str().encode_wide().collect();
    let mut actual = vec![0u16; path.len() + 1];
    let len =
        unsafe { GetFinalPathNameByHandleW(handle, actual.as_mut_ptr(), actual.len() as u32, 0) };
    len as usize == path.len() && path == actual[..path.len()]
}

fn compress(path: &Path) -> io::Result<()> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .custom_flags(OPEN_REPARSE_POINT)
        .open(path)?;
    if file.metadata()?.file_attributes() & REPARSE_POINT != 0 || !same_installed_file(&file, path)
    {
        return Err(io::Error::other(
            "skipped redirected or multiply-linked file",
        ));
    }
    // WOF_PROVIDER_FILE, FILE_PROVIDER_COMPRESSION_XPRESS16K, reserved flags = 0.
    let result = unsafe { WofSetFileDataLocation(file.as_raw_handle(), 2, &[3, 0], 8) };
    // ERROR_COMPRESSION_NOT_BENEFICIAL is expected for incompressible files.
    if result < 0 && (result as u32 & 0xffff) != 344 {
        return Err(io::Error::from_raw_os_error(result & 0xffff));
    }
    Ok(())
}

fn optimize(root: PathBuf) -> io::Result<()> {
    let root = root.canonicalize()?;
    let mut stored = 0u64;

    for relative in MANIFEST.lines() {
        let path = root.join(relative);
        let meta = fs::symlink_metadata(&path)?;
        if !meta.is_file() {
            return Err(io::Error::other("expected installed regular file"));
        }
        let before = stored_bytes(&path)?;
        // Keep the application's startup, OCR and libvips reads on their original storage path.
        let engine = relative.starts_with("engines/libreoffice/")
            || relative.starts_with("engines/pandoc/")
            || relative.starts_with("engines/pdfium/")
            || matches!(relative, "ffmpeg.exe" | "ffprobe.exe");
        if engine
            && meta.len() >= MIN_BYTES
            && before >= meta.len()
            && !meta.permissions().readonly()
        {
            let _ = compress(&path); // Locked files and unsupported volumes retain their original allocation.
        }
        stored += stored_bytes(&path)?;
    }
    // NSIS uses stdout for the measured Installed Apps estimate in KiB.
    print!("{}", stored.div_ceil(1024));

    Ok(())
}

fn main() -> io::Result<()> {
    let root = std::env::args_os()
        .nth(1)
        .ok_or_else(|| io::Error::other("missing install directory"))?;
    optimize(PathBuf::from(root))
}
