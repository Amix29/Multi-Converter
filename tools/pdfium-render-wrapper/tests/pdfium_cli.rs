use std::fs;
use std::process::Command;

fn pdfium_dll() -> Option<String> {
    std::env::var("MULTI_CONVERTER_TEST_PDFIUM_DLL").ok()
}

fn command() -> Command {
    Command::new(env!("CARGO_BIN_EXE_pdfium-render"))
}

fn run(args: &[&str]) -> Option<std::process::Output> {
    let dll = pdfium_dll()?;
    let mut command = command();
    Some(
        command
            .env("PDFIUM_DLL_PATH", dll)
            .args(args)
            .output()
            .unwrap(),
    )
}

#[test]
fn check_succeeds_when_pdfium_dll_is_available() {
    let Some(output) = run(&["--check"]) else {
        return;
    };
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn page_count_reports_mini_pdf_pages() {
    let Some(dll) = pdfium_dll() else {
        return;
    };
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    fs::write(&pdf, mini_pdf_two_pages()).unwrap();
    let output = command()
        .env("PDFIUM_DLL_PATH", dll)
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
fn render_page_generates_image() {
    let Some(dll) = pdfium_dll() else {
        return;
    };
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    let png = dir.path().join("page.png");
    fs::write(&pdf, mini_pdf_two_pages()).unwrap();
    let output = command()
        .env("PDFIUM_DLL_PATH", dll)
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
    let Some(dll) = pdfium_dll() else {
        return;
    };
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    let output_dir = dir.path().join("pages");
    fs::write(&pdf, mini_pdf_two_pages()).unwrap();
    let output = command()
        .env("PDFIUM_DLL_PATH", dll)
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
    let Some(dll) = pdfium_dll() else {
        return;
    };
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("bad.pdf");
    let png = dir.path().join("bad.png");
    fs::write(&pdf, b"not a pdf").unwrap();
    let output = command()
        .env("PDFIUM_DLL_PATH", dll)
        .args(["--render", pdf.to_str().unwrap(), png.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("PDFium ne peut pas ouvrir ce PDF"));
}

fn mini_pdf_two_pages() -> Vec<u8> {
    b"%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 35 >> stream
BT /F1 18 Tf 40 110 Td (Page 1) Tj ET
endstream endobj
6 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >> endobj
7 0 obj << /Length 35 >> stream
BT /F1 18 Tf 40 110 Td (Page 2) Tj ET
endstream endobj
xref
0 8
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000124 00000 n
0000000256 00000 n
0000000326 00000 n
0000000411 00000 n
0000000543 00000 n
trailer << /Size 8 /Root 1 0 R >>
startxref
628
%%EOF
"
    .to_vec()
}
