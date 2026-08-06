use super::*;

#[test]
fn multiple_import_roots_keep_distinct_private_provenance() {
    let first = tempfile::tempdir().unwrap();
    let second = tempfile::tempdir().unwrap();
    fs::create_dir(first.path().join("nested")).unwrap();
    fs::write(first.path().join("nested").join("one.txt"), "one").unwrap();
    fs::write(second.path().join("two.txt"), "two").unwrap();

    let expanded = expand_file_paths(&[
        first.path().to_string_lossy().to_string(),
        second.path().to_string_lossy().to_string(),
    ])
    .unwrap();

    assert_eq!(expanded.files.len(), 2);
    assert_ne!(
        expanded.files[0].import_origin.root_id,
        expanded.files[1].import_origin.root_id
    );
    assert_eq!(
        expanded.files[0].import_origin.relative_path,
        "nested/one.txt"
    );
    assert_eq!(expanded.files[1].import_origin.relative_path, "two.txt");
    for file in expanded.files {
        assert_eq!(file.import_origin.kind, ImportOriginKind::Folder);
        assert!(
            !file
                .import_origin
                .root_id
                .contains(first.path().to_string_lossy().as_ref())
        );
        assert!(
            !file
                .import_origin
                .root_id
                .contains(second.path().to_string_lossy().as_ref())
        );
    }
}

#[test]
fn isolated_file_has_file_origin_and_safe_name() {
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("report.txt");
    fs::write(&file, "content").unwrap();

    let expanded = expand_file_paths(&[file.to_string_lossy().to_string()]).unwrap();
    let origin = &expanded.files[0].import_origin;

    assert_eq!(origin.kind, ImportOriginKind::File);
    assert_eq!(origin.root_name, "report.txt");
    assert_eq!(origin.relative_path, "report.txt");
}

#[test]
fn root_names_are_safe_for_cross_platform_export() {
    assert_eq!(
        safe_import_component("travail:2026", "dossier"),
        "travail_2026"
    );
    assert_eq!(safe_import_component("CON", "dossier"), "_CON");
    assert_eq!(safe_import_component("...", "dossier"), "dossier");
}

#[test]
fn import_root_payload_is_bounded_before_file_system_access() {
    let too_many = vec![String::new(); MAX_IMPORT_ROOTS + 1];
    assert!(expand_file_paths(&too_many).is_err());
    assert!(expand_file_paths(&["x".repeat(MAX_IMPORT_PATH_BYTES + 1)]).is_err());
}

#[test]
fn folder_import_is_globally_bounded_across_roots() {
    let first = tempfile::tempdir().unwrap();
    let second = tempfile::tempdir().unwrap();
    for index in 0..(MAX_IMPORT_FILES / 2 + 10) {
        fs::write(first.path().join(format!("first-{index}.txt")), "x").unwrap();
        fs::write(second.path().join(format!("second-{index}.txt")), "x").unwrap();
    }

    let expanded = expand_file_paths(&[
        first.path().to_string_lossy().to_string(),
        second.path().to_string_lossy().to_string(),
    ])
    .unwrap();

    assert_eq!(expanded.files.len(), MAX_IMPORT_FILES);
    assert!(expanded.partial_import);
    assert!(expanded.files.iter().any(|file| file.partial_import));
    assert!(expanded.files.iter().any(|file| !file.partial_import));
}

#[test]
fn entirely_truncated_later_root_keeps_the_partial_import_observable() {
    let full = tempfile::tempdir().unwrap();
    let skipped = tempfile::tempdir().unwrap();
    for index in 0..MAX_IMPORT_FILES {
        fs::write(full.path().join(format!("full-{index}.txt")), "x").unwrap();
    }
    fs::write(skipped.path().join("never-imported.txt"), "x").unwrap();

    let expanded = expand_file_paths(&[
        full.path().to_string_lossy().to_string(),
        skipped.path().to_string_lossy().to_string(),
    ])
    .unwrap();

    assert_eq!(expanded.files.len(), MAX_IMPORT_FILES);
    assert!(expanded.partial_import);
    assert!(expanded.files.iter().any(|file| file.partial_import));
    assert!(
        expanded
            .files
            .iter()
            .all(|file| file.path.starts_with(full.path()))
    );
}

#[test]
fn folder_depth_is_bounded() {
    let directory = tempfile::tempdir().unwrap();
    let mut nested = directory.path().to_path_buf();
    for _ in 0..(MAX_FOLDER_IMPORT_DEPTH + 2) {
        nested = nested.join("d");
        fs::create_dir(&nested).unwrap();
    }
    fs::write(nested.join("too-deep.txt"), "x").unwrap();

    let expanded = expand_file_paths(&[directory.path().to_string_lossy().to_string()]).unwrap();

    assert!(expanded.files.is_empty());
    assert!(expanded.partial_import);
}

#[cfg(not(target_os = "windows"))]
#[test]
fn folder_import_does_not_follow_symbolic_links() {
    let directory = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("outside.txt"), "outside").unwrap();
    std::os::unix::fs::symlink(outside.path(), directory.path().join("linked")).unwrap();
    fs::write(directory.path().join("inside.txt"), "inside").unwrap();

    let expanded = expand_file_paths(&[directory.path().to_string_lossy().to_string()]).unwrap();

    assert_eq!(expanded.files.len(), 1);
    assert_eq!(expanded.files[0].import_origin.relative_path, "inside.txt");
    assert!(expanded.partial_import);
}
