use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

fn run_json(mode: &str, value: Value) -> std::process::Output {
    let library = std::env::var("MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
        .or_else(|_| std::env::var("MULTI_CONVERTER_TEST_PDFIUM_DLL"))
        .expect("PDFium active-content tests require MULTI_CONVERTER_TEST_PDFIUM_LIBRARY");
    let mut child = Command::new(env!("CARGO_BIN_EXE_pdfium-render"))
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
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn launch_and_javascript_are_visible_non_editable_and_preserved_without_execution() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("active.pdf");
    let saved = dir.path().join("saved.pdf");
    let original = active_content_pdf();
    fs::write(&source, &original).unwrap();

    let inspection = inspect(&source);
    assert_eq!(
        inspection["activeContentPolicy"],
        "preserve-without-execution"
    );
    let link = inspection["pages"][0]["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|object| object["kind"] == "annotation:Link")
        .unwrap();
    assert_eq!(link["activeContent"], true);
    assert_eq!(link["editable"], false);
    assert_eq!(link["text"], "action:Launch");
    let active_kinds = inspection["pages"][0]["objects"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|object| object["kind"].as_str())
        .filter(|kind| kind.starts_with("active:"))
        .collect::<Vec<_>>();
    assert!(active_kinds.contains(&"active:openAction"));
    assert!(active_kinds.contains(&"active:javascript"));
    assert!(active_kinds.contains(&"active:launch"));
    assert!(
        inspection["pages"][0]["objects"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|object| object["activeContent"] == true)
            .all(|object| !object["text"]
                .as_str()
                .unwrap_or_default()
                .contains("app.alert"))
    );

    let output = run_json(
        "--apply-patches",
        json!({
            "schemaVersion": 1,
            "sourcePath": source,
            "destinationPath": saved,
            "sourceSha256": inspection["sourceSha256"],
            "password": null,
            "patches": [{
                "schemaVersion": 1,
                "operation": "createAnnotation",
                "pageNumber": 1,
                "annotationType": "text",
                "bounds": { "x": 10, "y": 10, "width": 24, "height": 24 },
                "text": "Safe edit"
            }]
        }),
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let bytes = fs::read(&saved).unwrap();
    assert!(
        bytes
            .windows(b"/Launch".len())
            .any(|value| value == b"/Launch")
    );
    assert!(
        bytes
            .windows(b"/JavaScript".len())
            .any(|value| value == b"/JavaScript")
    );
    assert_eq!(fs::read(&source).unwrap(), original);
}

fn active_content_pdf() -> Vec<u8> {
    let objects = vec![
        "<< /Type /Catalog /Pages 2 0 R /OpenAction 8 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>".to_string(),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        "<< /Length 35 >>\nstream\nBT /F1 18 Tf 40 110 Td (Page 1) Tj ET\nendstream".to_string(),
        "<< /Type /Annot /Subtype /Link /Rect [20 20 100 40] /P 3 0 R /A 7 0 R >>"
            .to_string(),
        "<< /S /Launch /F (never-run.exe) >>".to_string(),
        "<< /S /JavaScript /JS (app.alert\\(never run\\)) >>".to_string(),
    ];
    build_pdf(&objects)
}

fn build_pdf(objects: &[String]) -> Vec<u8> {
    let mut output = b"%PDF-1.7\n".to_vec();
    let mut offsets = Vec::with_capacity(objects.len());
    for (index, object) in objects.iter().enumerate() {
        offsets.push(output.len());
        output.extend_from_slice(format!("{} 0 obj\n{object}\nendobj\n", index + 1).as_bytes());
    }
    let xref = output.len();
    output.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    output.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets {
        output.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    output.extend_from_slice(
        format!(
            "trailer << /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    output
}
