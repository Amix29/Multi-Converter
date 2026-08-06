use image::Rgba;
use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

#[path = "support/pdfium_editor_extended_fixtures.rs"]
#[allow(dead_code)]
mod fixtures;

use fixtures::{mini_pdf_two_pages, mini_pdf_two_text_objects, save_color_image};

fn pdfium_library() -> String {
    std::env::var("MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
        .or_else(|_| std::env::var("MULTI_CONVERTER_TEST_PDFIUM_DLL"))
        .expect("PDFium identity tests require MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
}

fn command() -> Command {
    Command::new(env!("CARGO_BIN_EXE_pdfium-render"))
}

fn run_json(mode: &str, value: Value) -> std::process::Output {
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

fn inspect(path: &Path) -> Value {
    let output = run_json(
        "--inspect-objects",
        json!({
            "schemaVersion": 1,
            "sourcePath": path,
            "sourceSha256": null,
            "password": null,
            "pageStart": 1,
            "pageCount": 1
        }),
    );
    assert_success(&output);
    serde_json::from_slice(&output.stdout).unwrap()
}

fn apply(source: &Path, destination: &Path, patches: Value) {
    let source_hash = inspect(source)["sourceSha256"]
        .as_str()
        .unwrap()
        .to_string();
    let output = run_json(
        "--apply-patches",
        json!({
            "schemaVersion": 1,
            "sourcePath": source,
            "destinationPath": destination,
            "sourceSha256": source_hash,
            "password": null,
            "patches": patches
        }),
    );
    assert_success(&output);
}

fn inspect_text(path: &Path) -> Value {
    let output = command()
        .env("PDFIUM_LIBRARY_PATH", pdfium_library())
        .args(["--inspect-text", path.to_str().unwrap()])
        .output()
        .unwrap();
    assert_success(&output);
    serde_json::from_slice(&output.stdout).unwrap()
}

fn assert_success(output: &std::process::Output) {
    assert!(
        output.status.success(),
        "status={:?}; stderr={}",
        output.status.code(),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn first_object_id(path: &Path) -> String {
    inspect(path)["pages"][0]["objects"][0]["objectId"]
        .as_str()
        .unwrap()
        .to_string()
}

#[test]
fn object_identity_survives_layer_reorder_then_edit() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("objects.pdf");
    let destination = dir.path().join("edited.pdf");
    fs::write(&source, mini_pdf_two_text_objects()).unwrap();
    let first_id = first_object_id(&source);
    apply(
        &source,
        &destination,
        json!([
            layer_patch("bringObjectFront", &first_id),
            text_patch(&first_id, "First edited")
        ]),
    );
    let text = page_text(&destination);
    assert!(text.contains("First edited"), "{text}");
    assert!(text.contains("Second"), "{text}");
}

#[test]
fn object_identity_survives_layer_reorder_then_delete() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("objects.pdf");
    let destination = dir.path().join("deleted.pdf");
    fs::write(&source, mini_pdf_two_text_objects()).unwrap();
    let first_id = first_object_id(&source);
    apply(
        &source,
        &destination,
        json!([
            layer_patch("bringObjectFront", &first_id),
            layer_patch("deleteObject", &first_id)
        ]),
    );
    let text = page_text(&destination);
    assert!(!text.contains("First"), "{text}");
    assert!(text.contains("Second"), "{text}");
}

#[test]
fn layer_reorder_alone_is_persisted() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("objects.pdf");
    let destination = dir.path().join("reordered.pdf");
    fs::write(&source, mini_pdf_two_text_objects()).unwrap();
    let first_id = first_object_id(&source);
    apply(
        &source,
        &destination,
        json!([layer_patch("bringObjectFront", &first_id)]),
    );
    assert_eq!(
        inspect(&destination)["pages"][0]["objects"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn reordered_document_can_be_edited_after_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("objects.pdf");
    let reordered = dir.path().join("reordered.pdf");
    let edited = dir.path().join("edited.pdf");
    fs::write(&source, mini_pdf_two_text_objects()).unwrap();
    apply(
        &source,
        &reordered,
        json!([layer_patch("bringObjectFront", "p1-o0")]),
    );
    apply(
        &reordered,
        &edited,
        json!([text_patch("p1-o1", "First edited")]),
    );
    assert!(page_text(&edited).contains("First edited"));
}

#[test]
fn edited_document_can_be_reordered_after_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("objects.pdf");
    let edited = dir.path().join("edited.pdf");
    let reordered = dir.path().join("reordered.pdf");
    fs::write(&source, mini_pdf_two_text_objects()).unwrap();
    apply(
        &source,
        &edited,
        json!([text_patch("p1-o0", "First edited")]),
    );
    apply(
        &edited,
        &reordered,
        json!([layer_patch("bringObjectFront", "p1-o0")]),
    );
    assert_eq!(
        inspect(&reordered)["pages"][0]["objects"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn page_identity_survives_insert_and_move_before_object_edits() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source.pdf");
    let inserted = dir.path().join("inserted.pdf");
    let moved = dir.path().join("moved.pdf");
    fs::write(&source, mini_pdf_two_pages()).unwrap();
    apply(
        &source,
        &inserted,
        json!([
            {
                "schemaVersion": 1, "operation": "insertPage", "pageNumber": 1,
                "objectId": "insert=local-blank", "widthPoints": 200, "heightPoints": 200
            },
            text_patch("p1-o0", "Edited page one")
        ]),
    );
    let pages = inspect_text(&inserted)["pages"].as_array().unwrap().clone();
    assert_eq!(pages[0]["text"], "");
    assert_eq!(pages[1]["text"], "Edited page one");

    apply(
        &source,
        &moved,
        json!([
            {
                "schemaVersion": 1, "operation": "movePage", "pageNumber": 2,
                "objectId": "page=p2", "targetPageNumber": 1
            },
            { "schemaVersion": 1, "operation": "setText", "pageNumber": 2,
              "objectId": "p2-o0", "text": "Edited page two" }
        ]),
    );
    let pages = inspect_text(&moved)["pages"].as_array().unwrap().clone();
    assert_eq!(pages[0]["text"], "Edited page two");
    assert_eq!(pages[1]["text"], "Page 1");
}

#[test]
fn a_late_patch_failure_never_publishes_a_partial_destination() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source.pdf");
    let image = dir.path().join("image.png");
    let destination = dir.path().join("partial.pdf");
    fs::write(&source, mini_pdf_two_pages()).unwrap();
    save_color_image(&image, Rgba([20, 40, 60, 255]));
    let source_hash = inspect(&source)["sourceSha256"]
        .as_str()
        .unwrap()
        .to_string();
    let output = run_json(
        "--apply-patches",
        json!({
            "schemaVersion": 1,
            "sourcePath": source,
            "destinationPath": destination,
            "sourceSha256": source_hash,
            "password": null,
            "patches": [
                {
                    "schemaVersion": 1, "operation": "insertImage", "pageNumber": 1,
                    "imagePath": image,
                    "bounds": { "x": 20, "y": 20, "width": 40, "height": 40 }
                },
                text_patch("generated-1-o1", "must fail")
            ]
        }),
    );
    assert!(!output.status.success());
    assert!(!destination.exists());
}

fn layer_patch(operation: &str, object_id: &str) -> Value {
    json!({
        "schemaVersion": 1,
        "operation": operation,
        "pageNumber": 1,
        "objectId": object_id
    })
}

fn text_patch(object_id: &str, text: &str) -> Value {
    json!({
        "schemaVersion": 1,
        "operation": "setText",
        "pageNumber": 1,
        "objectId": object_id,
        "text": text
    })
}

fn page_text(path: &Path) -> String {
    inspect_text(path)["pages"][0]["text"]
        .as_str()
        .unwrap()
        .to_string()
}
