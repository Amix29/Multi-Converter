use super::*;

fn managed_root(label: &str) -> PathBuf {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    env::temp_dir().join(format!("multi-converter-export-{label}-{unique}"))
}

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
fn export_path_suffixes_existing_files() {
    let source_dir = tempfile::tempdir().unwrap();
    let destination = tempfile::tempdir().unwrap();
    let source = source_dir.path().join("source.txt");
    fs::write(&source, "new").unwrap();
    fs::write(destination.path().join("file.txt"), "one").unwrap();
    fs::write(destination.path().join("file-1.txt"), "two").unwrap();

    assert_eq!(
        copy_export_file(&source, destination.path(), "file.txt").unwrap(),
        destination.path().join("file-2.txt")
    );
    assert_eq!(
        fs::read_to_string(destination.path().join("file-2.txt")).unwrap(),
        "new"
    );
}

#[test]
fn concurrent_exports_reserve_distinct_names_without_overwriting() {
    use std::sync::{Arc, Barrier};

    let source_dir = tempfile::tempdir().unwrap();
    let destination = tempfile::tempdir().unwrap();
    let source = source_dir.path().join("source.txt");
    fs::write(&source, "new").unwrap();
    let destination_path = destination.path().to_path_buf();
    let barrier = Arc::new(Barrier::new(2));

    let first_source = source.clone();
    let first_destination = destination_path.clone();
    let first_barrier = Arc::clone(&barrier);
    let first = std::thread::spawn(move || {
        first_barrier.wait();
        copy_export_file(&first_source, &first_destination, "file.txt").unwrap()
    });
    let second = std::thread::spawn(move || {
        barrier.wait();
        copy_export_file(&source, &destination_path, "file.txt").unwrap()
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
    for path in paths {
        assert_eq!(fs::read_to_string(path).unwrap(), "new");
    }
}

#[cfg(not(target_os = "windows"))]
#[test]
fn export_destination_does_not_follow_a_dangling_symbolic_link() {
    let source_dir = tempfile::tempdir().unwrap();
    let destination = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let source = source_dir.path().join("source.txt");
    let outside_target = outside.path().join("outside.txt");
    let linked_destination = destination.path().join("file.txt");
    fs::write(&source, "safe").unwrap();
    std::os::unix::fs::symlink(&outside_target, &linked_destination).unwrap();

    let exported = copy_export_file(&source, destination.path(), "file.txt").unwrap();

    assert_eq!(exported, destination.path().join("file-1.txt"));
    assert_eq!(fs::read_to_string(exported).unwrap(), "safe");
    assert!(!outside_target.exists());
    assert!(
        fs::symlink_metadata(linked_destination)
            .unwrap()
            .file_type()
            .is_symlink()
    );
}

#[test]
fn export_to_custom_folder_copies_managed_outputs() {
    let managed = managed_root("copy");
    let nested = managed.join("job-1");
    let destination = tempfile::tempdir().unwrap();
    fs::create_dir_all(&nested).unwrap();
    let output = nested.join("result.txt");
    fs::write(&output, "temporary output").unwrap();

    let result = copy_files_to_folder(
        &[output.to_string_lossy().to_string()],
        destination.path(),
        None,
    )
    .unwrap();

    let exported = destination.path().join("result.txt");
    assert_eq!(result.files, vec![exported.to_string_lossy().to_string()]);
    assert_eq!(fs::read_to_string(exported).unwrap(), "temporary output");
    fs::remove_dir_all(managed).unwrap();
}

#[test]
fn export_destination_error_names_destination_problem() {
    let managed = managed_root("dest");
    let nested = managed.join("job-1");
    let destination_parent = tempfile::tempdir().unwrap();
    let destination_file = destination_parent.path().join("not-a-folder");
    fs::create_dir_all(&nested).unwrap();
    let output = nested.join("result.txt");
    fs::write(&output, "temporary output").unwrap();
    fs::write(&destination_file, "already a file").unwrap();

    let error = copy_files_to_folder(
        &[output.to_string_lossy().to_string()],
        &destination_file,
        None,
    )
    .unwrap_err();

    assert!(error.starts_with("Impossible de préparer le dossier choisi"));
    fs::remove_dir_all(managed).unwrap();
}

#[test]
fn export_uses_current_output_dir_when_requested_source_is_stale() {
    let managed = managed_root("fallback");
    let nested = managed.join("job-1");
    let stale = managed_root("stale").join("old-job").join("result.txt");
    let destination = tempfile::tempdir().unwrap();
    fs::create_dir_all(&nested).unwrap();
    fs::write(nested.join("result.txt"), "fresh output").unwrap();

    let result = copy_files_to_folder(
        &[stale.to_string_lossy().to_string()],
        destination.path(),
        Some(managed.to_string_lossy().as_ref()),
    )
    .unwrap();

    assert_eq!(result.files.len(), 1);
    assert_eq!(
        fs::read_to_string(destination.path().join("result.txt")).unwrap(),
        "fresh output"
    );
    fs::remove_dir_all(managed).unwrap();
}

#[test]
fn export_fallback_rejects_ambiguous_duplicate_names() {
    let managed = managed_root("ambiguous");
    let stale = managed_root("stale").join("old-job").join("same.txt");
    let destination = tempfile::tempdir().unwrap();
    fs::create_dir_all(managed.join("job-1")).unwrap();
    fs::create_dir_all(managed.join("job-2")).unwrap();
    fs::write(managed.join("job-1").join("same.txt"), "one").unwrap();
    fs::write(managed.join("job-2").join("same.txt"), "two").unwrap();

    let error = copy_files_to_folder(
        &[stale.to_string_lossy().to_string()],
        destination.path(),
        Some(managed.to_string_lossy().as_ref()),
    )
    .unwrap_err();

    assert!(error.starts_with("Plusieurs fichiers temporaires nommés"));
    fs::remove_dir_all(managed).unwrap();
}

#[test]
fn exports_only_accept_files_from_managed_temp_root() {
    let managed = managed_root("allowed");
    let nested = managed.join("job-1");
    fs::create_dir_all(&nested).unwrap();
    let output = nested.join("result.txt");
    fs::write(&output, "temporary output").unwrap();

    assert!(ensure_exportable_conversion_file(&output).is_ok());
    fs::remove_dir_all(managed).unwrap();
}

#[test]
fn exports_reject_directories_and_unmanaged_files() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("outside.txt");
    fs::write(&file, "user file").unwrap();

    assert!(ensure_exportable_conversion_file(dir.path()).is_err());
    assert!(ensure_exportable_conversion_file(&file).is_err());
    assert!(ensure_exportable_conversion_file(Path::new("")).is_err());
}

#[cfg(not(target_os = "windows"))]
#[test]
fn exports_reject_symbolic_link_sources() {
    let managed = managed_root("link");
    let outside = tempfile::tempdir().unwrap();
    let outside_file = outside.path().join("outside.txt");
    let linked_file = managed.join("linked.txt");
    fs::create_dir_all(&managed).unwrap();
    fs::write(&outside_file, "outside").unwrap();
    std::os::unix::fs::symlink(&outside_file, &linked_file).unwrap();

    assert!(ensure_exportable_conversion_file(&linked_file).is_err());

    fs::remove_file(linked_file).unwrap();
    fs::remove_dir_all(managed).unwrap();
}

#[cfg(not(target_os = "windows"))]
#[test]
fn link_above_the_managed_root_does_not_reject_a_safe_output() {
    let root = tempfile::tempdir().unwrap();
    let real_parent = root.path().join("real-parent");
    let alias = root.path().join("alias");
    let managed = alias.join("multi-converter-safe");
    fs::create_dir_all(real_parent.join("multi-converter-safe")).unwrap();
    std::os::unix::fs::symlink(&real_parent, &alias).unwrap();
    let output = managed.join("result.txt");
    fs::write(&output, "safe").unwrap();

    assert!(!path_contains_link_or_reparse_point(&output, &managed).unwrap());
}

#[cfg(target_os = "windows")]
#[test]
fn exports_reject_directory_reparse_points() {
    let managed = managed_root("link");
    let outside = tempfile::tempdir().unwrap();
    let link = managed.join("linked");
    fs::create_dir_all(&managed).unwrap();
    fs::write(outside.path().join("outside.txt"), "outside").unwrap();
    let mut command = std::process::Command::new("cmd");
    command
        .args(["/D", "/C", "mklink", "/J"])
        .arg(&link)
        .arg(outside.path());
    let output = crate::process_support::run_command_bounded(
        &mut command,
        std::time::Duration::from_secs(5),
    )
    .unwrap();
    assert!(
        output.status.success(),
        "mklink failed: stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    assert!(ensure_exportable_conversion_file(&link.join("outside.txt")).is_err());

    fs::remove_dir(&link).unwrap();
    fs::remove_dir_all(managed).unwrap();
}

#[test]
fn missing_export_source_returns_human_message() {
    let missing = managed_root("missing").join("job-1").join("missing.mp3");
    let error = ensure_exportable_conversion_file(&missing).unwrap_err();

    assert_eq!(
        error,
        "Impossible d'exporter ce fichier. Il n'est plus disponible. Relancez la conversion."
    );
}
