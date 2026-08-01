pub(super) fn binary_name_for(stem: &str, os: &str, arch: &str) -> String {
    if os == "windows" {
        format!("{stem}-x86_64-pc-windows-msvc.exe")
    } else if os == "macos" {
        if matches!(arch, "aarch64" | "arm64") {
            format!("{stem}-aarch64-apple-darwin")
        } else {
            format!("{stem}-x86_64-apple-darwin")
        }
    } else if matches!(arch, "aarch64" | "arm64") {
        format!("{stem}-aarch64-unknown-linux-gnu")
    } else {
        format!("{stem}-x86_64-unknown-linux-gnu")
    }
}

pub(super) fn universal_binary_name_for(stem: &str, os: &str, arch: &str) -> String {
    if os == "macos" {
        format!("{stem}-universal-apple-darwin")
    } else {
        binary_name_for(stem, os, arch)
    }
}
