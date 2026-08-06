use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};

#[path = "support/pdfium_cli_fixtures.rs"]
mod fixtures;

use fixtures::{mini_pdf_two_pages, pdf_with_doc_mdp};

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

fn run_json(mode: &str, value: serde_json::Value) -> std::process::Output {
    let library = pdfium_library();
    let mut child = command()
        .env("PDFIUM_LIBRARY_PATH", library)
        .arg(mode)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(&serde_json::to_vec(&value).unwrap())
        .unwrap();
    child.wait_with_output().unwrap()
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
fn editor_passwords_are_never_accepted_as_command_line_arguments() {
    let output = command()
        .args(["--inspect-objects", "--password", "secret-value"])
        .output()
        .unwrap();
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Usage:"));
    assert!(!stderr.contains("secret-value"));
}

#[test]
fn malformed_editor_json_is_rejected_before_loading_pdfium() {
    let mut child = command()
        .arg("--inspect-objects")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(b"{}").unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("PDF_EDITOR_REQUEST_INVALID"));
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

#[test]
fn editor_inspects_renders_and_saves_a_copy_without_touching_the_source() {
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    let png = dir.path().join("page.png");
    let destination = dir.path().join("edited.pdf");
    let original = mini_pdf_two_pages();
    fs::write(&pdf, &original).unwrap();

    let inspection = run_json(
        "--inspect-objects",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": pdf,
            "sourceSha256": null,
            "password": null,
            "pageStart": 1,
            "pageCount": 1
        }),
    );
    assert!(
        inspection.status.success(),
        "{}",
        String::from_utf8_lossy(&inspection.stderr)
    );
    let inspection: serde_json::Value = serde_json::from_slice(&inspection.stdout).unwrap();
    let source_hash = inspection["sourceSha256"].as_str().unwrap();
    assert_eq!(source_hash.len(), 64);
    assert_eq!(
        inspection["activeContentPolicy"],
        "preserve-without-execution"
    );
    let object_id = inspection["pages"][0]["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|object| object["kind"] == "text")
        .and_then(|object| object["objectId"].as_str())
        .unwrap();

    let rendered = run_json(
        "--render-editor-page",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": pdf,
            "sourceSha256": source_hash,
            "outputPath": png,
            "password": null,
            "pageNumber": 1,
            "dpi": 144
        }),
    );
    assert!(
        rendered.status.success(),
        "{}",
        String::from_utf8_lossy(&rendered.stderr)
    );
    assert!(fs::read(&png).unwrap().starts_with(b"\x89PNG\r\n\x1a\n"));

    let saved = run_json(
        "--apply-patches",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": pdf,
            "destinationPath": destination,
            "sourceSha256": source_hash,
            "password": null,
            "patches": [{
                "schemaVersion": 1,
                "operation": "setText",
                "pageNumber": 1,
                "objectId": object_id,
                "text": "Edited"
            }]
        }),
    );
    assert!(
        saved.status.success(),
        "{}",
        String::from_utf8_lossy(&saved.stderr)
    );
    assert!(destination.is_file());
    assert_eq!(fs::read(&pdf).unwrap(), original);
    assert!(fs::read_dir(dir.path()).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".part")
    }));

    let reopened = run_json(
        "--inspect-objects",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": destination,
            "sourceSha256": null,
            "password": null,
            "pageStart": 1,
            "pageCount": 1
        }),
    );
    assert!(
        reopened.status.success(),
        "{}",
        String::from_utf8_lossy(&reopened.stderr)
    );
    let reopened: serde_json::Value = serde_json::from_slice(&reopened.stdout).unwrap();
    assert!(
        reopened["pages"][0]["objects"]
            .as_array()
            .unwrap()
            .iter()
            .any(|object| object["text"] == "Edited")
    );
}

#[test]
fn editor_render_rejects_a_stale_source_hash_before_writing() {
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    let png = dir.path().join("page.png");
    fs::write(&pdf, mini_pdf_two_pages()).unwrap();
    let output = run_json(
        "--render-editor-page",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": pdf,
            "sourceSha256": "0".repeat(64),
            "outputPath": png,
            "password": null,
            "pageNumber": 1,
            "dpi": 144
        }),
    );
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("PDF_EDITOR_SOURCE_CHANGED"));
    assert!(!png.exists());
}

#[test]
fn editor_save_rejects_a_stale_source_hash_without_creating_a_copy() {
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("mini.pdf");
    let destination = dir.path().join("edited.pdf");
    fs::write(&pdf, mini_pdf_two_pages()).unwrap();
    let output = run_json(
        "--apply-patches",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": pdf,
            "destinationPath": destination,
            "sourceSha256": "0".repeat(64),
            "password": null,
            "patches": [{
                "schemaVersion": 1,
                "operation": "setText",
                "pageNumber": 1,
                "objectId": "p1-o0",
                "text": "Never written"
            }]
        }),
    );
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("PDF_EDITOR_SOURCE_CHANGED"), "{stderr}");
    assert!(!destination.exists());
}

#[test]
fn editor_reads_doc_mdp_level_one_as_read_only() {
    let dir = tempfile::tempdir().unwrap();
    let pdf = dir.path().join("signed.pdf");
    fs::write(&pdf, pdf_with_doc_mdp(1)).unwrap();
    let output = run_json(
        "--inspect-objects",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": pdf,
            "sourceSha256": null,
            "password": null,
            "pageStart": 1,
            "pageCount": 1
        }),
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["signatures"][0]["docMdpLevel"], 1);
    assert_eq!(value["permissions"]["docMdpLevel"], 1);
    assert_eq!(value["permissions"]["canModify"], false);
    assert_eq!(value["permissions"]["canAnnotate"], false);
    assert_eq!(value["permissions"]["canFillForms"], false);
    assert_eq!(value["permissions"]["canAssemble"], false);
}

#[test]
fn editor_creates_a_distinct_unsigned_copy_before_forbidden_edits() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("signed.pdf");
    let destination = dir.path().join("editable-copy.pdf");
    let original = pdf_with_doc_mdp(1);
    fs::write(&source, &original).unwrap();
    let inspection = run_json(
        "--inspect-objects",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": source,
            "sourceSha256": null,
            "password": null,
            "pageStart": 1,
            "pageCount": 1
        }),
    );
    assert!(
        inspection.status.success(),
        "{}",
        String::from_utf8_lossy(&inspection.stderr)
    );
    let inspection: serde_json::Value = serde_json::from_slice(&inspection.stdout).unwrap();

    let output = run_json(
        "--create-editable-copy",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": source,
            "destinationPath": destination,
            "sourceSha256": inspection["sourceSha256"],
            "password": null
        }),
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert!(result["removedSignatureStructures"].as_u64().unwrap() >= 2);
    assert_eq!(fs::read(&source).unwrap(), original);

    let copied = run_json(
        "--inspect-objects",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": destination,
            "sourceSha256": null,
            "password": null,
            "pageStart": 1,
            "pageCount": 1
        }),
    );
    assert!(
        copied.status.success(),
        "{}",
        String::from_utf8_lossy(&copied.stderr)
    );
    let copied: serde_json::Value = serde_json::from_slice(&copied.stdout).unwrap();
    assert_eq!(copied["signatures"].as_array().unwrap().len(), 0);
    assert_eq!(
        copied["permissions"]["docMdpLevel"],
        serde_json::Value::Null
    );
}
