use super::*;

#[test]
fn relative_path_parser_rejects_escape_and_ambiguous_components() {
    let unsafe_paths = [
        "",
        "/absolute.txt",
        "\\absolute.txt",
        "C:\\absolute.txt",
        "C:/absolute.txt",
        "../escape.txt",
        "root/../escape.txt",
        "root//file.txt",
        "root/./file.txt",
        "root/file.txt/",
        #[cfg(target_os = "windows")]
        "root/trailing. ",
        #[cfg(target_os = "windows")]
        "root/CON.txt",
        #[cfg(target_os = "windows")]
        "root/report:2026.txt",
    ];
    for value in unsafe_paths {
        assert!(
            ParsedRelativePath::parse(value, Some("root-a")).is_err(),
            "accepted unsafe path: {value}"
        );
    }
    assert!(ParsedRelativePath::parse("folder/file.txt", None).is_err());
    assert!(ParsedRelativePath::parse("folder/file.txt", Some("bad root id")).is_err());
}

#[cfg(not(target_os = "windows"))]
#[test]
fn unix_export_paths_keep_valid_colons_and_windows_reserved_names() {
    assert!(ParsedRelativePath::parse("travail/report:2026.pdf", Some("root-a")).is_ok());
    assert!(ParsedRelativePath::parse("travail/CON.pdf", Some("root-a")).is_ok());
}

#[test]
fn duplicate_folder_targets_are_rejected_before_writing() {
    let managed = ManagedFixture::new("duplicates");
    let destination = tempfile::tempdir().unwrap();
    let first = managed.output("first.txt", "first");
    let second = managed.output("second.txt", "second");
    let entries = vec![
        entry(&first, "travail/file.txt", Some("root-a")),
        entry(&second, "travail/file.txt", Some("root-a")),
    ];

    let error = copy_entries(&entries, destination.path(), None).unwrap_err();

    assert!(error.contains("même chemin"));
    assert!(fs::read_dir(destination.path()).unwrap().next().is_none());
}

#[test]
fn structured_plan_must_match_the_converted_results_exactly() {
    let managed = ManagedFixture::new("plan-membership");
    let destination = tempfile::tempdir().unwrap();
    let first = managed.output("first.txt", "first");
    let second = managed.output("second.txt", "second");
    let paths = vec![first.to_string_lossy().to_string()];
    let entries = vec![
        entry(&first, "first.txt", None),
        entry(&second, "second.txt", None),
    ];

    let error = copy_files_to_folder(
        &paths,
        destination.path(),
        Some(managed.root().to_string_lossy().as_ref()),
        Some(&entries),
    )
    .unwrap_err();

    assert!(error.contains("correspond pas exactement"));
    assert!(fs::read_dir(destination.path()).unwrap().next().is_none());
}

#[test]
fn structured_plan_rejects_an_output_from_another_managed_batch() {
    let current = ManagedFixture::new("current-batch");
    let other = ManagedFixture::new("other-batch");
    let destination = tempfile::tempdir().unwrap();
    current.output("expected.txt", "current");
    let injected = other.output("injected.txt", "other");
    let paths = vec![injected.to_string_lossy().to_string()];
    let entries = vec![entry(&injected, "injected.txt", None)];

    let error = copy_files_to_folder(
        &paths,
        destination.path(),
        Some(current.root().to_string_lossy().as_ref()),
        Some(&entries),
    )
    .unwrap_err();

    assert!(error.contains("lot de conversion courant"));
    assert!(fs::read_dir(destination.path()).unwrap().next().is_none());
}

#[test]
fn export_rejects_more_than_the_global_file_limit() {
    let destination = tempfile::tempdir().unwrap();
    let paths: Vec<String> = (0..=MAX_EXPORT_FILES)
        .map(|index| format!("missing-{index}.txt"))
        .collect();

    let error = copy_files_to_folder(&paths, destination.path(), None, None).unwrap_err();

    assert!(error.contains("plus de 2000 fichiers"));
}

#[test]
fn rollback_never_recursively_deletes_concurrent_files() {
    let destination = tempfile::tempdir().unwrap();
    let root = destination.path().join("travail");
    let child = root.join("nested");
    fs::create_dir_all(&child).unwrap();
    fs::write(child.join("sentinel.txt"), "belongs to another process").unwrap();
    {
        let canonical = destination.path().canonicalize().unwrap();
        let mut transaction =
            ExportTransaction::new(destination.path().to_path_buf(), canonical, false);
        transaction.record_directory(root.clone());
        transaction.record_directory(child.clone());
    }

    assert_eq!(
        fs::read_to_string(child.join("sentinel.txt")).unwrap(),
        "belongs to another process"
    );
}

#[test]
fn export_keeps_original_bytes_and_leaves_no_staging_file() {
    let managed = ManagedFixture::new("integrity");
    let destination = tempfile::tempdir().unwrap();
    let source = managed.output("source.bin", "immutable bytes");
    let before = fs::read(&source).unwrap();

    copy_entries(
        &[entry(&source, "source.bin", None)],
        destination.path(),
        None,
    )
    .unwrap();

    assert_eq!(fs::read(&source).unwrap(), before);
    assert_eq!(
        fs::read(destination.path().join("source.bin")).unwrap(),
        before
    );
    assert!(staging_files(destination.path()).is_empty());
}

#[test]
fn exports_reject_directories_unmanaged_files_and_missing_sources() {
    let outside = tempfile::tempdir().unwrap();
    let file = outside.path().join("outside.txt");
    fs::write(&file, "user file").unwrap();
    assert!(ensure_exportable_conversion_file(outside.path()).is_err());
    assert!(ensure_exportable_conversion_file(&file).is_err());
    assert!(ensure_exportable_conversion_file(Path::new("")).is_err());

    let missing = env::temp_dir()
        .join(format!("multi-converter-missing-{}", uuid::Uuid::new_v4()))
        .join("job-1/missing.mp3");
    assert_eq!(
        ensure_exportable_conversion_file(&missing).unwrap_err(),
        "Impossible d'exporter ce fichier. Il n'est plus disponible. Relancez la conversion."
    );
}

#[test]
fn destination_file_is_rejected_as_a_folder() {
    let managed = ManagedFixture::new("destination-file");
    let destination_parent = tempfile::tempdir().unwrap();
    let destination = destination_parent.path().join("not-a-folder");
    let source = managed.output("result.txt", "result");
    fs::write(&destination, "already a file").unwrap();

    let error =
        copy_entries(&[entry(&source, "result.txt", None)], &destination, None).unwrap_err();
    assert!(error.starts_with("Impossible de préparer le dossier choisi"));
}

#[cfg(not(target_os = "windows"))]
#[test]
fn exports_reject_symbolic_link_sources_and_destinations() {
    let managed = ManagedFixture::new("links");
    let outside = tempfile::tempdir().unwrap();
    let outside_file = outside.path().join("outside.txt");
    let linked_source = managed.root().join("linked.txt");
    fs::write(&outside_file, "outside").unwrap();
    std::os::unix::fs::symlink(&outside_file, &linked_source).unwrap();
    assert!(ensure_exportable_conversion_file(&linked_source).is_err());

    let real_destination = tempfile::tempdir().unwrap();
    let link_parent = tempfile::tempdir().unwrap();
    let linked_destination = link_parent.path().join("destination");
    std::os::unix::fs::symlink(real_destination.path(), &linked_destination).unwrap();
    let source = managed.output("safe.txt", "safe");
    assert!(
        copy_entries(
            &[entry(&source, "safe.txt", None)],
            &linked_destination,
            None
        )
        .is_err()
    );
    assert!(!real_destination.path().join("safe.txt").exists());
}

#[cfg(not(target_os = "windows"))]
#[test]
fn a_link_above_the_managed_root_does_not_reject_a_safe_output() {
    let root = tempfile::tempdir().unwrap();
    let real_parent = root.path().join("real-parent");
    let alias = root.path().join("alias");
    let managed = alias.join("multi-converter-safe");
    fs::create_dir_all(real_parent.join("multi-converter-safe")).unwrap();
    std::os::unix::fs::symlink(&real_parent, &alias).unwrap();
    let output = managed.join("result.txt");
    fs::write(&output, "safe").unwrap();
    assert!(!test_path_contains_link_or_reparse_point(&output, &managed).unwrap());
}

#[cfg(target_os = "windows")]
#[test]
fn exports_reject_directory_reparse_points() {
    let managed = ManagedFixture::new("reparse");
    let outside = tempfile::tempdir().unwrap();
    let link = managed.root().join("linked");
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
        "junction fixture failed: {} {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(ensure_exportable_conversion_file(&link.join("outside.txt")).is_err());
    fs::remove_dir(&link).unwrap();
}
