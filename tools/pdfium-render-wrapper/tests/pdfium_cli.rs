use std::fs;
use std::process::Command;

#[path = "support/pdfium_cli_fixtures.rs"]
mod fixtures;

use fixtures::mini_pdf_two_pages;

fn pdfium_library() -> String {
    std::env::var("MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
        .or_else(|_| std::env::var("MULTI_CONVERTER_TEST_PDFIUM_DLL"))
        .expect("PDFium wrapper runtime tests require MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
}

fn command() -> Command {
    Command::new(env!("CARGO_BIN_EXE_pdfium-render"))
}

fn run(args: &[&str]) -> std::process::Output {
    let library = pdfium_library();
    let mut command = command();
    command
        .env("PDFIUM_LIBRARY_PATH", library)
        .args(args)
        .output()
        .unwrap()
}

#[test]
fn version_is_exactly_the_packaged_contract() {
    let output = command().arg("--version").output().unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "pdfium-render-wrapper 0.4.0"
    );
}

#[test]
fn check_succeeds_when_pdfium_dll_is_available() {
    let output = run(&["--check"]);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn page_count_reports_mini_pdf_pages() {
    let library = pdfium_library();
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    fs::write(&pdf, mini_pdf_two_pages()).unwrap();
    let output = command()
        .env("PDFIUM_LIBRARY_PATH", library)
        .args(["--page-count", pdf.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "2");
}

#[test]
fn inspect_text_reports_each_page_and_usability() {
    let library = pdfium_library();
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    fs::write(&pdf, mini_pdf_two_pages()).unwrap();
    let output = command()
        .env("PDFIUM_LIBRARY_PATH", library)
        .args(["--inspect-text", pdf.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["schemaVersion"], 1);
    assert_eq!(value["pageCount"], 2);
    assert_eq!(value["pages"][0]["text"], "Page 1");
    assert_eq!(value["pages"][0]["usable"], false);
}

#[test]
fn render_page_generates_image() {
    let library = pdfium_library();
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    let png = dir.path().join("page.png");
    fs::write(&pdf, mini_pdf_two_pages()).unwrap();
    let output = command()
        .env("PDFIUM_LIBRARY_PATH", library)
        .args([
            "--render",
            pdf.to_str().unwrap(),
            png.to_str().unwrap(),
            "--page",
            "1",
            "--format",
            "png",
            "--dpi",
            "120",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(fs::metadata(png).unwrap().len() > 0);
}

#[test]
fn render_all_generates_one_image_per_page() {
    let library = pdfium_library();
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    let output_dir = dir.path().join("pages");
    fs::write(&pdf, mini_pdf_two_pages()).unwrap();
    let output = command()
        .env("PDFIUM_LIBRARY_PATH", library)
        .args([
            "--render-all",
            pdf.to_str().unwrap(),
            output_dir.to_str().unwrap(),
            "--format",
            "jpg",
            "--dpi",
            "120",
            "--quality",
            "80",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output_dir.join("mini-page-001.jpg").is_file());
    assert!(output_dir.join("mini-page-002.jpg").is_file());
}

#[test]
fn invalid_pdf_returns_clear_error() {
    let library = pdfium_library();
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("bad.pdf");
    let png = dir.path().join("bad.png");
    fs::write(&pdf, b"not a pdf").unwrap();
    let output = command()
        .env("PDFIUM_LIBRARY_PATH", library)
        .args(["--render", pdf.to_str().unwrap(), png.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("PDFium ne peut pas ouvrir ce PDF"));
}
