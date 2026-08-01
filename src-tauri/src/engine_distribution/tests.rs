use super::contracts::ArchiveType;
use super::*;
use crate::engines::EngineMode;
use std::fs;
use std::path::Path;

#[test]
fn parses_embedded_manifest_and_selects_declared_pdfium_platform() {
    let manifest = load_manifest().unwrap();
    assert_eq!(manifest.manifest_version, 1);
    assert!(
        manifest
            .engines
            .iter()
            .all(|engine| engine.mode == EngineMode::Advanced)
    );
    let pdfium_platform = manifest
        .engines
        .iter()
        .find(|engine| engine.id == "pdfium")
        .map(|engine| engine.platform.as_str())
        .unwrap();
    let pdfium = manifest::manifest_for_platform_id(&manifest, "pdfium", pdfium_platform).unwrap();
    assert_eq!(pdfium.platform, pdfium_platform);
    assert_eq!(pdfium.archive_type, ArchiveType::Zip);
}

#[test]
fn installed_binary_prefers_executable_over_support_files() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let bin = root.join("pdfium").join("compatible").join("bin");
    fs::create_dir_all(&bin).unwrap();
    fs::write(bin.join("pdfium.dll"), b"support dll").unwrap();
    fs::write(
        bin.join("pdfium-render-x86_64-pc-windows-msvc.exe"),
        b"wrapper",
    )
    .unwrap();

    let selected = installed_binary(
        root,
        "pdfium",
        "compatible",
        &[
            "bin/pdfium.dll".to_string(),
            "bin/pdfium-render-x86_64-pc-windows-msvc.exe".to_string(),
        ],
    )
    .unwrap();
    assert_eq!(
        selected.file_name().and_then(|value| value.to_str()),
        Some("pdfium-render-x86_64-pc-windows-msvc.exe")
    );
}

#[test]
fn installed_binary_ignores_macos_support_libraries() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let bin = root.join("pdfium").join("compatible").join("bin");
    fs::create_dir_all(&bin).unwrap();
    fs::write(bin.join("libpdfium.dylib"), b"support dylib").unwrap();
    fs::write(bin.join("pdfium-render-universal-apple-darwin"), b"wrapper").unwrap();
    let selected = installed_binary(
        root,
        "pdfium",
        "compatible",
        &[
            "bin/libpdfium.dylib".to_string(),
            "bin/pdfium-render-universal-apple-darwin".to_string(),
        ],
    )
    .unwrap();
    assert_eq!(
        selected.file_name().and_then(|value| value.to_str()),
        Some("pdfium-render-universal-apple-darwin")
    );
}

#[test]
fn macos_engine_binary_selection_prefers_native_architecture() {
    let arm = Path::new("aarch64/LibreOffice.app/Contents/MacOS/soffice");
    let x64 = Path::new("x86_64/LibreOffice.app/Contents/MacOS/soffice");
    let universal = Path::new("bin/pandoc-universal-apple-darwin");
    assert!(
        paths::executable_candidate_score_for(arm, "macos", "aarch64")
            > paths::executable_candidate_score_for(x64, "macos", "aarch64")
    );
    assert!(
        paths::executable_candidate_score_for(x64, "macos", "x86_64")
            > paths::executable_candidate_score_for(arm, "macos", "x86_64")
    );
    assert!(
        paths::executable_candidate_score_for(universal, "macos", "x86_64")
            > paths::executable_candidate_score_for(arm, "macos", "x86_64")
    );
}

#[test]
fn linux_engine_binary_selection_prefers_native_architecture() {
    let arm = Path::new("aarch64/bin/vips");
    let x64 = Path::new("x86_64/bin/vips");
    let generic = Path::new("bin/vips");
    assert!(
        paths::executable_candidate_score_for(x64, "linux", "x86_64")
            > paths::executable_candidate_score_for(arm, "linux", "x86_64")
    );
    assert!(
        paths::executable_candidate_score_for(arm, "linux", "aarch64")
            > paths::executable_candidate_score_for(x64, "linux", "aarch64")
    );
    assert!(
        paths::executable_candidate_score_for(generic, "linux", "x86_64")
            > paths::executable_candidate_score_for(arm, "linux", "x86_64")
    );
}

#[test]
fn libreoffice_runtime_uses_manifest_launcher() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let program = root.join("libreoffice").join("compatible").join("program");
    fs::create_dir_all(&program).unwrap();
    fs::write(program.join("soffice.exe"), b"launcher").unwrap();
    fs::write(program.join("soffice.bin"), b"runtime").unwrap();
    let selected = installed_binary(
        root,
        "libreoffice",
        "compatible",
        &["program/soffice.exe".to_string()],
    )
    .unwrap();
    assert_eq!(
        selected.file_name().and_then(|value| value.to_str()),
        Some("soffice.exe")
    );
}

#[test]
fn manifest_uses_pdfium_instead_of_poppler_or_mupdf() {
    let manifest = load_manifest().unwrap();
    let pdfium_platforms = manifest
        .engines
        .iter()
        .filter(|engine| engine.id == "pdfium")
        .map(|engine| engine.platform.as_str())
        .collect::<Vec<_>>();
    assert!(!pdfium_platforms.is_empty());
    for platform in pdfium_platforms {
        assert!(manifest::manifest_for_platform_id(&manifest, "pdfium", platform).is_some());
        assert!(manifest::manifest_for_platform_id(&manifest, "poppler", platform).is_none());
        assert!(manifest::manifest_for_platform_id(&manifest, "mupdf", platform).is_none());
        assert_eq!(
            manifest::manifest_for_platform_id(&manifest, "pdfium", platform)
                .unwrap()
                .mode,
            EngineMode::Advanced
        );
    }
}

#[test]
fn installed_size_counts_nested_engine_files() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let engine_dir = root.join("pandoc").join("compatible");
    fs::create_dir_all(engine_dir.join("bin")).unwrap();
    fs::write(engine_dir.join("bin").join("pandoc.exe"), b"pandoc").unwrap();
    fs::write(engine_dir.join("NOTICE.txt"), b"notice").unwrap();
    assert_eq!(
        installed_size(root, "pandoc", "compatible"),
        "pandoc".len() as u64 + "notice".len() as u64
    );
}
