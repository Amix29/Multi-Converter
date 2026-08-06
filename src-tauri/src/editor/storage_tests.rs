use super::*;

#[test]
fn atomic_replace_keeps_previous_file_when_source_is_empty() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("source");
    let destination = directory.path().join("destination");
    fs::write(&source, []).unwrap();
    fs::write(&destination, b"original").unwrap();
    assert!(replace_file_safely(&source, &destination).is_err());
    assert_eq!(fs::read(destination).unwrap(), b"original");
}

#[test]
fn duplicate_metadata_detaches_the_original_source() {
    let mut document = super::super::document::new_document("Rapport");
    document.source = Some(super::super::document::EditorSource {
        path: "C:\\Documents\\rapport.docx".to_string(),
        format: "docx".to_string(),
        size: 42,
        modified_at: "1".to_string(),
    });
    let original_id = document.id.clone();
    let now = super::super::document::now_stamp();
    document.id = uuid::Uuid::new_v4().to_string();
    document.title = "Rapport - copie".to_string();
    document.source = None;
    document.created_at = now.clone();
    document.updated_at = now;
    assert_ne!(document.id, original_id);
    assert!(document.source.is_none());
    assert_eq!(document.title, "Rapport - copie");
}

#[test]
fn atomic_work_files_keep_the_destination_extension() {
    let parent = Path::new("C:\\Documents");
    let staged = sibling_work_path(parent, &parent.join("Rapport.docx"), "staged");
    assert_eq!(
        staged.extension().and_then(|value| value.to_str()),
        Some("docx")
    );
    assert!(
        staged
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.starts_with("multi-converter-staged-"))
    );
}

#[test]
fn staged_commit_replaces_without_loading_the_payload() {
    let directory = tempfile::tempdir().unwrap();
    let staged = directory.path().join("generated.docx");
    let destination = directory.path().join("result.docx");
    fs::write(&staged, b"generated").unwrap();
    fs::write(&destination, b"previous").unwrap();
    let expected = capture_destination_snapshot(&destination).unwrap();
    commit_staged_file(&staged, &destination, expected.as_ref()).unwrap();
    assert_eq!(fs::read(destination).unwrap(), b"generated");
    assert!(!staged.exists());
}

#[test]
fn staged_commit_refuses_a_destination_changed_after_capture() {
    let directory = tempfile::tempdir().unwrap();
    let staged = directory.path().join("generated.docx");
    let destination = directory.path().join("result.docx");
    fs::write(&staged, b"generated").unwrap();
    fs::write(&destination, b"original").unwrap();
    let expected = capture_destination_snapshot(&destination).unwrap();
    fs::write(&destination, b"external").unwrap();

    let error = commit_staged_file(&staged, &destination, expected.as_ref()).unwrap_err();

    assert!(error.contains("EDITOR_DESTINATION_CONFLICT"));
    assert_eq!(fs::read(&destination).unwrap(), b"external");
    assert_eq!(fs::read(&staged).unwrap(), b"generated");
}

#[test]
fn staged_commit_never_overwrites_a_file_created_during_publication() {
    let directory = tempfile::tempdir().unwrap();
    let staged = directory.path().join("generated.docx");
    let destination = directory.path().join("result.docx");
    fs::write(&staged, b"generated").unwrap();
    fs::write(&destination, b"original").unwrap();
    let expected = capture_destination_snapshot(&destination).unwrap();

    let error = commit_staged_file_inner(
        &staged,
        &destination,
        expected.as_ref(),
        |reserved_destination| {
            fs::write(reserved_destination, b"external").map_err(|error| error.to_string())
        },
    )
    .unwrap_err();

    assert!(error.contains("EDITOR_DESTINATION_CONFLICT"));
    assert!(error.contains("version précédente est conservée"));
    assert_eq!(fs::read(&destination).unwrap(), b"external");
    assert_eq!(fs::read(&staged).unwrap(), b"generated");
    let preserved = fs::read_dir(directory.path())
        .unwrap()
        .filter_map(Result::ok)
        .find(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("multi-converter-backup-")
        })
        .expect("the displaced original must remain recoverable");
    assert_eq!(fs::read(preserved.path()).unwrap(), b"original");
}
