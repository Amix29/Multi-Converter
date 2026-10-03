use super::*;
use std::sync::{Arc, Barrier};

#[test]
fn folder_export_recreates_all_relative_subdirectories() {
    let managed = ManagedFixture::new("hierarchy");
    let destination = tempfile::tempdir().unwrap();
    let first = managed.output("photo.jpg", "photo");
    let second = managed.output("note.txt", "note");
    let entries = vec![
        entry(&first, "travail/images/2026/photo.jpg", Some("root-a")),
        entry(&second, "travail/docs/note.txt", Some("root-a")),
    ];

    let result = copy_entries(&entries, destination.path(), None).unwrap();

    assert_eq!(result.files.len(), 2);
    assert_eq!(
        fs::read_to_string(destination.path().join("travail/images/2026/photo.jpg")).unwrap(),
        "photo"
    );
    assert_eq!(
        fs::read_to_string(destination.path().join("travail/docs/note.txt")).unwrap(),
        "note"
    );
}

#[test]
fn one_root_collision_is_reserved_once_for_the_whole_import() {
    let managed = ManagedFixture::new("root-collision");
    let destination = tempfile::tempdir().unwrap();
    fs::create_dir(destination.path().join("travail")).unwrap();
    let first = managed.output("first.txt", "first");
    let second = managed.output("second.txt", "second");
    let entries = vec![
        entry(&first, "travail/a/first.txt", Some("root-a")),
        entry(&second, "travail/b/second.txt", Some("root-a")),
    ];

    copy_entries(&entries, destination.path(), None).unwrap();

    assert_eq!(
        fs::read_to_string(destination.path().join("travail (2)/a/first.txt")).unwrap(),
        "first"
    );
    assert_eq!(
        fs::read_to_string(destination.path().join("travail (2)/b/second.txt")).unwrap(),
        "second"
    );
    assert!(!destination.path().join("travail (3)").exists());
}

#[test]
fn separate_import_roots_with_the_same_name_get_separate_reservations() {
    let managed = ManagedFixture::new("separate-roots");
    let destination = tempfile::tempdir().unwrap();
    let first = managed.output("first.txt", "first");
    let second = managed.output("second.txt", "second");
    let entries = vec![
        entry(&first, "travail/first.txt", Some("root-a")),
        entry(&second, "travail/second.txt", Some("root-b")),
    ];

    copy_entries(&entries, destination.path(), None).unwrap();

    assert_eq!(
        fs::read_to_string(destination.path().join("travail/first.txt")).unwrap(),
        "first"
    );
    assert_eq!(
        fs::read_to_string(destination.path().join("travail (2)/second.txt")).unwrap(),
        "second"
    );
}

#[test]
fn isolated_structured_results_stay_at_destination_root() {
    let managed = ManagedFixture::new("isolated");
    let destination = tempfile::tempdir().unwrap();
    let output = managed.output("converted.jpg", "image");

    copy_entries(
        &[entry(&output, "converted.jpg", None)],
        destination.path(),
        None,
    )
    .unwrap();

    assert_eq!(
        fs::read_to_string(destination.path().join("converted.jpg")).unwrap(),
        "image"
    );
}

#[test]
fn concurrent_folder_exports_reserve_distinct_root_names() {
    let managed = ManagedFixture::new("concurrent-roots");
    let destination = tempfile::tempdir().unwrap();
    let first_output = managed.output("first.txt", "first");
    let second_output = managed.output("second.txt", "second");
    let first_entries = vec![entry(
        &first_output,
        "travail/first.txt",
        Some("first-root"),
    )];
    let second_entries = vec![entry(
        &second_output,
        "travail/second.txt",
        Some("second-root"),
    )];
    let barrier = Arc::new(Barrier::new(2));
    let first_destination = destination.path().to_path_buf();
    let first_barrier = Arc::clone(&barrier);
    let first = std::thread::spawn(move || {
        first_barrier.wait();
        copy_entries(&first_entries, &first_destination, None).unwrap()
    });
    let second_destination = destination.path().to_path_buf();
    let second = std::thread::spawn(move || {
        barrier.wait();
        copy_entries(&second_entries, &second_destination, None).unwrap()
    });
    first.join().unwrap();
    second.join().unwrap();

    let roots = [
        destination.path().join("travail"),
        destination.path().join("travail (2)"),
    ];
    assert!(roots.iter().all(|root| root.is_dir()));
    let contents: Vec<String> = roots
        .iter()
        .flat_map(|root| fs::read_dir(root).unwrap())
        .map(|entry| fs::read_to_string(entry.unwrap().path()).unwrap())
        .collect();
    assert!(contents.contains(&"first".to_string()));
    assert!(contents.contains(&"second".to_string()));
}

#[test]
fn transaction_removes_outputs_when_one_root_becomes_ambiguous() {
    let managed = ManagedFixture::new("rollback");
    let destination = tempfile::tempdir().unwrap();
    let first = managed.output("first.txt", "first");
    let second = managed.output("second.txt", "second");
    let entries = vec![
        entry(&first, "travail/first.txt", Some("same-root")),
        entry(&second, "autre/second.txt", Some("same-root")),
    ];

    let error = copy_entries(&entries, destination.path(), None).unwrap_err();

    assert!(error.contains("plusieurs noms de racine"));
    assert!(fs::read_dir(destination.path()).unwrap().next().is_none());
    assert_eq!(fs::read_to_string(first).unwrap(), "first");
    assert_eq!(fs::read_to_string(second).unwrap(), "second");
}
