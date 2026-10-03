use super::*;
use std::sync::{Arc, Barrier};

#[test]
fn export_result_keeps_camel_case_ipc_shape() {
    let result = ExportResult {
        destination_dir: "C:/Exports".to_string(),
        files: vec!["C:/Exports/result.txt".to_string()],
        destination_created: true,
    };
    assert_eq!(
        serde_json::to_value(result).unwrap(),
        serde_json::json!({
            "destinationDir": "C:/Exports",
            "files": ["C:/Exports/result.txt"],
            "destinationCreated": true
        })
    );
}

#[test]
fn legacy_flat_export_remains_compatible_and_suffixes_collisions() {
    let managed = ManagedFixture::new("legacy-flat");
    let destination = tempfile::tempdir().unwrap();
    let source = managed.output("result.txt", "new");
    fs::write(destination.path().join("result.txt"), "one").unwrap();
    fs::write(destination.path().join("result-1.txt"), "two").unwrap();

    let result = copy_files_to_folder(
        &[source.to_string_lossy().to_string()],
        destination.path(),
        None,
        None,
    )
    .unwrap();

    assert_eq!(
        result.files,
        vec![destination.path().join("result-2.txt").to_string_lossy()]
    );
    assert_eq!(
        fs::read_to_string(destination.path().join("result-2.txt")).unwrap(),
        "new"
    );
}

#[test]
fn concurrent_flat_exports_reserve_distinct_names_without_overwriting() {
    let source_dir = tempfile::tempdir().unwrap();
    let destination = tempfile::tempdir().unwrap();
    let source = source_dir.path().join("source.txt");
    fs::write(&source, "new").unwrap();
    let barrier = Arc::new(Barrier::new(2));

    let first_source = source.clone();
    let first_destination = destination.path().to_path_buf();
    let first_barrier = Arc::clone(&barrier);
    let first = std::thread::spawn(move || {
        first_barrier.wait();
        copy_export_file(&first_source, &first_destination, "file.txt").unwrap()
    });
    let second_destination = destination.path().to_path_buf();
    let second = std::thread::spawn(move || {
        barrier.wait();
        copy_export_file(&source, &second_destination, "file.txt").unwrap()
    });
    let mut paths = vec![first.join().unwrap(), second.join().unwrap()];
    paths.sort();

    assert_eq!(
        paths,
        vec![
            destination.path().join("file-1.txt"),
            destination.path().join("file.txt")
        ]
    );
    assert!(
        paths
            .iter()
            .all(|path| fs::read_to_string(path).unwrap() == "new")
    );
    assert!(staging_files(destination.path()).is_empty());
}

#[test]
fn stale_output_path_uses_current_managed_job() {
    let managed = ManagedFixture::new("fallback");
    let stale = env::temp_dir()
        .join(format!("multi-converter-stale-{}", uuid::Uuid::new_v4()))
        .join("old-job")
        .join("result.txt");
    let destination = tempfile::tempdir().unwrap();
    managed.output("result.txt", "fresh output");

    let result = copy_files_to_folder(
        &[stale.to_string_lossy().to_string()],
        destination.path(),
        Some(managed.root().to_string_lossy().as_ref()),
        None,
    )
    .unwrap();

    assert_eq!(result.files.len(), 1);
    assert_eq!(
        fs::read_to_string(destination.path().join("result.txt")).unwrap(),
        "fresh output"
    );
}

#[test]
fn stale_output_fallback_rejects_ambiguous_names() {
    let managed = ManagedFixture::new("ambiguous");
    fs::create_dir_all(managed.root().join("job-2")).unwrap();
    fs::write(managed.root().join("job-1").join("same.txt"), "one").unwrap();
    fs::write(managed.root().join("job-2").join("same.txt"), "two").unwrap();
    let stale = env::temp_dir()
        .join(format!("multi-converter-stale-{}", uuid::Uuid::new_v4()))
        .join("same.txt");
    let destination = tempfile::tempdir().unwrap();

    let error = copy_files_to_folder(
        &[stale.to_string_lossy().to_string()],
        destination.path(),
        Some(managed.root().to_string_lossy().as_ref()),
        None,
    )
    .unwrap_err();
    assert!(error.starts_with("Plusieurs fichiers temporaires nommés"));
}
