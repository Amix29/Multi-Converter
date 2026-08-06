use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

fn pdfium_library() -> String {
    std::env::var("MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
        .or_else(|_| std::env::var("MULTI_CONVERTER_TEST_PDFIUM_DLL"))
        .expect("PDFium wrapper runtime tests require MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
}

fn command() -> Command {
    Command::new(env!("CARGO_BIN_EXE_pdfium-render"))
}

fn phase6_fixture(name: &str) -> PathBuf {
    PathBuf::from(
        std::env::var_os("MULTI_CONVERTER_REPOSITORY_ROOT")
            .expect("wrapper tests require MULTI_CONVERTER_REPOSITORY_ROOT"),
    )
    .join("tests/fixtures/ocr/phase-6")
    .join(name)
}

fn run_json(mode: &str, value: serde_json::Value) -> std::process::Output {
    let mut child = command()
        .env("PDFIUM_LIBRARY_PATH", pdfium_library())
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
fn editor_replaces_a_subset_font_without_losing_requested_latin_text() {
    let dir = tempfile::tempdir().unwrap();
    let source = phase6_fixture("pdf-native.pdf");
    let working = dir.path().join("native.pdf");
    let destination = dir.path().join("edited.pdf");
    let original = fs::read(&source).unwrap();
    fs::write(&working, &original).unwrap();

    let inspection = run_json(
        "--inspect-objects",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": working,
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
    let object_id = inspection["pages"][0]["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|object| object["kind"] == "text")
        .and_then(|object| object["objectId"].as_str())
        .unwrap();

    let saved = run_json(
        "--apply-patches",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": working,
            "destinationPath": destination,
            "sourceSha256": inspection["sourceSha256"],
            "password": null,
            "patches": [{
                "schemaVersion": 1,
                "operation": "setText",
                "pageNumber": 1,
                "objectId": object_id,
                "text": "Native editor smoke"
            }]
        }),
    );
    assert!(
        saved.status.success(),
        "{}",
        String::from_utf8_lossy(&saved.stderr)
    );
    assert_eq!(fs::read(&working).unwrap(), original);

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
            .any(|object| object["kind"] == "text" && object["text"] == "Native editor smoke")
    );
}

#[test]
fn editor_rejects_text_outside_the_safe_standard_font_without_writing() {
    let dir = tempfile::tempdir().unwrap();
    let source = phase6_fixture("pdf-native.pdf");
    let destination = dir.path().join("edited.pdf");
    let existing_destination = b"existing destination remains intact";
    fs::write(&destination, existing_destination).unwrap();
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
    assert!(inspection.status.success());
    let inspection: serde_json::Value = serde_json::from_slice(&inspection.stdout).unwrap();
    let object_id = inspection["pages"][0]["objects"][0]["objectId"]
        .as_str()
        .unwrap();
    let saved = run_json(
        "--apply-patches",
        serde_json::json!({
            "schemaVersion": 1,
            "sourcePath": source,
            "destinationPath": destination,
            "sourceSha256": inspection["sourceSha256"],
            "password": null,
            "patches": [{
                "schemaVersion": 1,
                "operation": "setText",
                "pageNumber": 1,
                "objectId": object_id,
                "text": "日本語"
            }]
        }),
    );
    assert!(!saved.status.success());
    assert!(String::from_utf8_lossy(&saved.stderr).contains("PDF_EDITOR_TEXT_UNREPRESENTABLE"));
    assert_eq!(fs::read(&destination).unwrap(), existing_destination);
}
