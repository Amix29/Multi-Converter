use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

fn command() -> Command {
    Command::new(env!("CARGO_BIN_EXE_pdfium-render"))
}

fn run_json(mode: &str, value: Value) -> std::process::Output {
    let library = std::env::var("MULTI_CONVERTER_TEST_PDFIUM_LIBRARY")
        .or_else(|_| std::env::var("MULTI_CONVERTER_TEST_PDFIUM_DLL"))
        .expect("PDFium form tests require MULTI_CONVERTER_TEST_PDFIUM_LIBRARY");
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

fn apply(source: &Path, destination: &Path, object_id: &str, value: &str) -> std::process::Output {
    let source_hash = inspect(source)["sourceSha256"]
        .as_str()
        .unwrap()
        .to_string();
    run_json(
        "--apply-patches",
        json!({
            "schemaVersion": 1,
            "sourcePath": source,
            "destinationPath": destination,
            "sourceSha256": source_hash,
            "password": null,
            "patches": [{
                "schemaVersion": 1,
                "operation": "setFormValue",
                "pageNumber": 1,
                "objectId": object_id,
                "text": value
            }]
        }),
    )
}

fn assert_success(output: &std::process::Output) {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn radio_is_writable_but_combo_and_list_are_explicitly_read_only() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("forms.pdf");
    let selected = dir.path().join("selected.pdf");
    let unsupported = dir.path().join("unsupported.pdf");
    let original = acro_form_pdf();
    fs::write(&source, &original).unwrap();

    let inspection = inspect(&source);
    let objects = inspection["pages"][0]["objects"].as_array().unwrap();
    let radio_id = object_id(objects, "form:RadioButton");
    let combo_id = object_id(objects, "form:ComboBox");
    let list_id = object_id(objects, "form:ListBox");
    assert_eq!(
        objects.iter().find(|v| v["objectId"] == radio_id).unwrap()["editable"],
        true
    );
    assert_eq!(
        objects.iter().find(|v| v["objectId"] == combo_id).unwrap()["editable"],
        false
    );
    assert_eq!(
        objects.iter().find(|v| v["objectId"] == list_id).unwrap()["editable"],
        false
    );

    let radio = apply(&source, &selected, &radio_id, "true");
    assert_success(&radio);
    let selected_objects = inspect(&selected)["pages"][0]["objects"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(
        selected_objects
            .iter()
            .find(|value| value["objectId"] == radio_id)
            .unwrap()["text"],
        "true"
    );

    for id in [combo_id, list_id] {
        let output = apply(&source, &unsupported, &id, "Two");
        assert!(!output.status.success());
        assert!(
            String::from_utf8_lossy(&output.stderr).contains("PDF_EDITOR_FORM_API_UNAVAILABLE")
        );
        assert!(!unsupported.exists());
    }
    assert_eq!(fs::read(&source).unwrap(), original);
}

fn object_id(objects: &[Value], kind: &str) -> String {
    objects
        .iter()
        .find(|value| value["kind"] == kind)
        .and_then(|value| value["objectId"].as_str())
        .unwrap_or_else(|| panic!("missing {kind}"))
        .to_string()
}

fn acro_form_pdf() -> Vec<u8> {
    let objects = vec![
        "<< /Type /Catalog /Pages 2 0 R /AcroForm 6 0 R >>".into(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".into(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /Helv 5 0 R >> >> /Contents 4 0 R /Annots [7 0 R 8 0 R 9 0 R 10 0 R] >>".into(),
        "<< /Length 0 >>\nstream\n\nendstream".into(),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into(),
        "<< /Fields [11 0 R 9 0 R 10 0 R] /NeedAppearances true /DR << /Font << /Helv 5 0 R >> >> /DA (/Helv 10 Tf 0 g) >>".into(),
        "<< /Type /Annot /Subtype /Widget /Parent 11 0 R /Rect [10 150 30 170] /P 3 0 R /AP << /N << /Off 12 0 R /A 13 0 R >> >> /AS /A >>".into(),
        "<< /Type /Annot /Subtype /Widget /Parent 11 0 R /Rect [40 150 60 170] /P 3 0 R /AP << /N << /Off 12 0 R /B 14 0 R >> >> /AS /B >>".into(),
        "<< /Type /Annot /Subtype /Widget /FT /Ch /Ff 131072 /T (Combo) /Rect [10 100 100 120] /P 3 0 R /Opt [(One) (Two)] /V (One) /DA (/Helv 10 Tf 0 g) >>".into(),
        "<< /Type /Annot /Subtype /Widget /FT /Ch /T (List) /Rect [10 50 100 90] /P 3 0 R /Opt [(One) (Two)] /V (One) /DA (/Helv 10 Tf 0 g) >>".into(),
        "<< /FT /Btn /Ff 32768 /T (Choice) /Kids [7 0 R 8 0 R] /V /Off >>".into(),
        appearance_stream(""),
        appearance_stream("0 0 0 rg 2 2 16 16 re f"),
        appearance_stream("0 0 0 rg 2 2 16 16 re f"),
    ];
    build_pdf(&objects)
}

fn appearance_stream(contents: &str) -> String {
    format!(
        "<< /Type /XObject /Subtype /Form /BBox [0 0 20 20] /Length {} >>\nstream\n{contents}\nendstream",
        contents.len() + 1
    )
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
