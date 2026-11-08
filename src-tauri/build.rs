fn main() {
    #[cfg(all(windows, feature = "native-format-tests"))]
    {
        // The test executable hosts Wry too. Its Win32 imports require ComCtl32 v6.
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}/tests/native_formats/windows.manifest",
            env!("CARGO_MANIFEST_DIR")
        );
    }
    tauri_build::build()
}
