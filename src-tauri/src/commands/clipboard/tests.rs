use super::*;
use std::path::PathBuf;

#[test]
fn clipboard_file_keeps_camel_case_ipc_shape() {
    let file: ClipboardFile = serde_json::from_value(serde_json::json!({
        "name": "note.txt",
        "mimeType": "text/plain",
        "bytes": [65, 66]
    }))
    .unwrap();

    assert_eq!(file.name, "note.txt");
    assert_eq!(file.mime_type, "text/plain");
    assert_eq!(file.bytes, vec![65, 66]);
}

#[test]
fn clipboard_batch_deserialization_rejects_more_than_the_file_limit() {
    let files = (0..(MAX_CLIPBOARD_IMPORT_FILES + 1))
        .map(|index| ClipboardFile {
            name: format!("file-{index}.txt"),
            mime_type: "text/plain".to_string(),
            bytes: Vec::new(),
        })
        .collect::<Vec<_>>();
    let directory = tempfile::tempdir().unwrap();

    let error = save_clipboard_files_to_directory(&files, directory.path()).unwrap_err();

    assert!(error.to_string().contains("clipboard.tooManyFiles"));
}

#[test]
fn clipboard_import_writes_local_files_with_safe_names() {
    let directory = tempfile::tempdir().unwrap();
    let files = vec![ClipboardFile {
        name: "..\\screenshot?.png".to_string(),
        mime_type: "image/png".to_string(),
        bytes: vec![1, 2, 3, 4],
    }];

    let paths = save_clipboard_files_to_directory(&files, directory.path()).unwrap();

    assert_eq!(paths.len(), 1);
    let saved = PathBuf::from(&paths[0]);
    assert_eq!(saved.parent(), Some(directory.path()));
    assert!(
        saved
            .file_name()
            .unwrap()
            .to_string_lossy()
            .ends_with("screenshot-.png")
    );
    assert_eq!(fs::read(saved).unwrap(), vec![1, 2, 3, 4]);
}

#[test]
fn clipboard_import_adds_extension_from_mime_type() {
    assert_eq!(
        safe_clipboard_file_name("clipboard", "text/plain"),
        "clipboard.txt"
    );
    assert_eq!(safe_clipboard_file_name("", "video/mp4"), "clipboard.mp4");
    assert_eq!(extension_for_clipboard_mime("audio/x-wav"), "wav");
}

#[cfg(unix)]
#[test]
fn clipboard_temp_files_are_private_to_the_current_account() {
    use std::os::unix::fs::PermissionsExt;

    let paths = save_clipboard_files_to_temp(&[ClipboardFile {
        name: "secret.txt".to_string(),
        mime_type: "text/plain".to_string(),
        bytes: b"private".to_vec(),
    }])
    .unwrap();
    let path = PathBuf::from(&paths[0]);
    let directory = path.parent().unwrap().to_path_buf();

    assert_eq!(
        fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
        0o700
    );
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );

    fs::remove_dir_all(directory).unwrap();
}
