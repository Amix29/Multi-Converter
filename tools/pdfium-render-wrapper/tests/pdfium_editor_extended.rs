use image::Rgba;
use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

#[path = "support/pdfium_editor_extended_fixtures.rs"]
#[allow(dead_code)]
mod fixtures;

use fixtures::{mini_pdf_two_pages, save_color_image};

fn pdfium_library() -> String {
    std::env::var("MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
        .or_else(|_| std::env::var("MULTI_CONVERTER_TEST_PDFIUM_DLL"))
        .expect("PDFium editor tests require MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
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

fn inspect(path: &Path, page_start: usize, page_count: usize) -> Value {
    let output = run_json(
        "--inspect-objects",
        json!({
            "schemaVersion": 1,
            "sourcePath": path,
            "sourceSha256": null,
            "password": null,
            "pageStart": page_start,
            "pageCount": page_count
        }),
    );
    assert_success(&output);
    serde_json::from_slice(&output.stdout).unwrap()
}

fn apply(source: &Path, destination: &Path, patches: Value) -> Value {
    let source_hash = inspect(source, 1, 1)["sourceSha256"]
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
    serde_json::from_slice(&output.stdout).unwrap()
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

fn render(path: &Path, output: &Path) {
    let source_hash = inspect(path, 1, 1)["sourceSha256"]
        .as_str()
        .unwrap()
        .to_string();
    let result = run_json(
        "--render-editor-page",
        json!({
            "schemaVersion": 1,
            "sourcePath": path,
            "sourceSha256": source_hash,
            "outputPath": output,
            "password": null,
            "pageNumber": 1,
            "dpi": 144
        }),
    );
    assert_success(&result);
}

fn assert_success(output: &std::process::Output) {
    assert!(
        output.status.success(),
        "status={:?}; stderr={}",
        output.status.code(),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn assert_source_untouched(path: &Path, expected: &[u8]) {
    assert_eq!(fs::read(path).unwrap(), expected);
    assert!(fs::read_dir(path.parent().unwrap()).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".part")
    }));
}

#[test]
fn page_insert_duplicate_and_move_preserve_order_and_source() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source.pdf");
    let destination = dir.path().join("pages.pdf");
    let original = mini_pdf_two_pages();
    fs::write(&source, &original).unwrap();

    apply(
        &source,
        &destination,
        json!([
            {
                "schemaVersion": 1,
                "operation": "insertPage",
                "pageNumber": 3,
                "widthPoints": 200,
                "heightPoints": 200
            },
            {
                "schemaVersion": 1,
                "operation": "duplicatePage",
                "pageNumber": 1,
                "targetPageNumber": 4
            },
            {
                "schemaVersion": 1,
                "operation": "movePage",
                "pageNumber": 4,
                "targetPageNumber": 2
            }
        ]),
    );

    let text = inspect_text(&destination);
    assert_eq!(text["pageCount"], 4);
    let pages = text["pages"].as_array().unwrap();
    assert_eq!(pages[0]["text"], "Page 1");
    assert_eq!(pages[1]["text"], "Page 1");
    assert_eq!(pages[2]["text"], "Page 2");
    assert_eq!(pages[3]["text"], "");
    assert_source_untouched(&source, &original);
}

#[test]
fn classic_annotation_can_be_created_then_deleted() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source.pdf");
    let annotated = dir.path().join("annotated.pdf");
    let cleaned = dir.path().join("cleaned.pdf");
    let original = mini_pdf_two_pages();
    fs::write(&source, &original).unwrap();

    apply(
        &source,
        &annotated,
        json!([{
            "schemaVersion": 1,
            "operation": "createAnnotation",
            "pageNumber": 1,
            "annotationType": "text",
            "bounds": { "x": 10, "y": 10, "width": 24, "height": 24 },
            "text": "Note locale",
            "color": "#C56D42FF"
        }]),
    );
    let inspection = inspect(&annotated, 1, 1);
    let annotation = inspection["pages"][0]["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|object| object["kind"] == "annotation:Text")
        .unwrap();
    assert_eq!(annotation["text"], "Note locale");
    let annotation_id = annotation["objectId"].as_str().unwrap();

    apply(
        &annotated,
        &cleaned,
        json!([{
            "schemaVersion": 1,
            "operation": "deleteAnnotation",
            "pageNumber": 1,
            "objectId": annotation_id
        }]),
    );
    assert!(
        inspect(&cleaned, 1, 1)["pages"][0]["objects"]
            .as_array()
            .unwrap()
            .iter()
            .all(|object| object["kind"] != "annotation:Text")
    );
    assert_source_untouched(&source, &original);
}

#[test]
fn local_image_insert_and_replace_are_bounded_and_observable() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source.pdf");
    let inserted = dir.path().join("inserted.pdf");
    let replaced = dir.path().join("replaced.pdf");
    let red = dir.path().join("red.png");
    let blue = dir.path().join("blue.png");
    let before = dir.path().join("before.png");
    let after = dir.path().join("after.png");
    let original = mini_pdf_two_pages();
    fs::write(&source, &original).unwrap();
    save_color_image(&red, Rgba([255, 0, 0, 255]));
    save_color_image(&blue, Rgba([0, 0, 255, 255]));

    apply(
        &source,
        &inserted,
        json!([{
            "schemaVersion": 1,
            "operation": "insertImage",
            "pageNumber": 1,
            "imagePath": red,
            "bounds": { "x": 10, "y": 10, "width": 60, "height": 60 }
        }]),
    );
    let inspection = inspect(&inserted, 1, 1);
    let image_id = inspection["pages"][0]["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|object| object["kind"] == "image")
        .and_then(|object| object["objectId"].as_str())
        .unwrap();
    render(&inserted, &before);

    apply(
        &inserted,
        &replaced,
        json!([{
            "schemaVersion": 1,
            "operation": "replaceImage",
            "pageNumber": 1,
            "objectId": image_id,
            "imagePath": blue
        }]),
    );
    render(&replaced, &after);
    let before = image::open(&before).unwrap().to_rgba8();
    let after = image::open(&after).unwrap().to_rgba8();
    assert_eq!(before.dimensions(), after.dimensions());
    assert_ne!(before.as_raw(), after.as_raw());
    assert_source_untouched(&source, &original);
}

#[test]
fn invisible_ocr_layer_is_searchable_but_does_not_change_rendering() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source.pdf");
    let edited = dir.path().join("ocr.pdf");
    let rejected = dir.path().join("unsupported.pdf");
    let before = dir.path().join("before.png");
    let after = dir.path().join("after.png");
    let original = mini_pdf_two_pages();
    fs::write(&source, &original).unwrap();
    render(&source, &before);

    apply(
        &source,
        &edited,
        json!([{
            "schemaVersion": 1,
            "operation": "addOcrTextLayer",
            "pageNumber": 1,
            "ocrBlocks": [{
                "text": "Texte OCR français",
                "bounds": { "x": 20, "y": 20, "width": 140, "height": 18 },
                "fontSizePoints": 14
            }]
        }]),
    );
    render(&edited, &after);
    assert_eq!(
        image::open(&before).unwrap().to_rgba8().as_raw(),
        image::open(&after).unwrap().to_rgba8().as_raw()
    );
    assert!(
        inspect_text(&edited)["pages"][0]["text"]
            .as_str()
            .unwrap()
            .contains("Texte OCR français")
    );

    let hash = inspect(&source, 1, 1)["sourceSha256"]
        .as_str()
        .unwrap()
        .to_string();
    let unsupported = run_json(
        "--apply-patches",
        json!({
            "schemaVersion": 1,
            "sourcePath": source,
            "destinationPath": rejected,
            "sourceSha256": hash,
            "password": null,
            "patches": [{
                "schemaVersion": 1,
                "operation": "addOcrTextLayer",
                "pageNumber": 1,
                "ocrBlocks": [{
                    "text": "日本語",
                    "bounds": { "x": 20, "y": 20, "width": 140, "height": 18 }
                }]
            }]
        }),
    );
    assert!(!unsupported.status.success());
    assert!(String::from_utf8_lossy(&unsupported.stderr).contains("OCR_FONT_COVERAGE"));
    assert!(!rejected.exists());
    assert_source_untouched(&source, &original);
}
