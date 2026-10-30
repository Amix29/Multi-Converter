use super::*;
use std::fs;

fn plan(path: &Path) -> RecoveryPlan {
    RecoveryPlan {
        schema_version: 1,
        quality_profile: QualityProfile::High,
        files: vec![RecoveryFile {
            path: path.to_string_lossy().into_owned(),
            target_format: "txt".into(),
            media_mode: MediaMode::Convert,
            import_origin: None,
        }],
    }
}

#[test]
fn recovery_is_opt_in_and_disable_prevents_late_saves() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("state");
    let source = directory.path().join("source.txt");
    fs::write(&source, "private contents must never be persisted").unwrap();
    assert!(!storage::load(&root).unwrap().enabled);
    assert_eq!(storage::save(&root, plan(&source)).unwrap(), 0);
    assert!(!root.exists());
    storage::set_enabled(&root, true).unwrap();
    assert_eq!(storage::save(&root, plan(&source)).unwrap(), 1);
    assert_eq!(
        storage::load(&root).unwrap().plan.unwrap().files[0].path,
        source.canonicalize().unwrap().to_string_lossy()
    );
    assert!(
        !fs::read_to_string(root.join("last-batch.json"))
            .unwrap()
            .contains("private contents")
    );
    storage::set_enabled(&root, false).unwrap();
    assert_eq!(storage::save(&root, plan(&source)).unwrap(), 0);
    assert!(
        !fs::read_to_string(root.join("last-batch.json"))
            .unwrap()
            .contains("source.txt")
    );
}

#[test]
fn recovery_skips_changed_and_missing_originals_and_expires() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("state");
    let source = directory.path().join("source.txt");
    fs::write(&source, "original").unwrap();
    storage::set_enabled(&root, true).unwrap();
    storage::save(&root, plan(&source)).unwrap();
    fs::write(&source, "changed length").unwrap();
    let state = storage::load(&root).unwrap();
    assert!(state.plan.is_none());
    assert_eq!(state.skipped_files, 1);
    storage::save(&root, plan(&source)).unwrap();
    let moved = directory.path().join("source-held.txt");
    fs::rename(&source, &moved).unwrap();
    assert_eq!(storage::load(&root).unwrap().skipped_files, 1);
    fs::rename(moved, &source).unwrap();
    storage::expire_for_test(&root);
    assert!(storage::load(&root).unwrap().plan.is_none());
    assert!(
        !fs::read_to_string(root.join("last-batch.json"))
            .unwrap()
            .contains("source.txt")
    );
}

#[test]
fn recovery_keeps_folder_export_origins_and_refuses_traversal() {
    use crate::converters::ImportOriginKind;
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("state");
    let source = directory.path().join("source.txt");
    fs::write(&source, "source").unwrap();
    let mut value = plan(&source);
    let origin = ImportOriginV1 {
        kind: ImportOriginKind::Folder,
        root_id: "root-id".into(),
        root_name: "folder".into(),
        relative_path: "sub/source.txt".into(),
    };
    value.files[0].import_origin = Some(origin.clone());
    storage::set_enabled(&root, true).unwrap();
    storage::save(&root, value.clone()).unwrap();
    assert_eq!(
        storage::load(&root).unwrap().plan.unwrap().files[0].import_origin,
        Some(origin)
    );
    value.files[0].import_origin.as_mut().unwrap().relative_path = "../private.txt".into();
    assert!(storage::save(&root, value).is_err());
}

#[test]
fn recovery_clearing_keeps_consent_but_removes_the_plan() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("state");
    let source = directory.path().join("source.txt");
    fs::write(&source, "source").unwrap();
    storage::set_enabled(&root, true).unwrap();
    storage::save(&root, plan(&source)).unwrap();
    storage::clear(&root).unwrap();
    let state = storage::load(&root).unwrap();
    assert!(state.enabled && state.plan.is_none());
    let mut invalid = plan(&source);
    invalid.files[0].path = "relative.txt".into();
    assert!(storage::save(&root, invalid).is_err());
}

#[cfg(unix)]
#[test]
fn recovery_files_and_directory_are_private() {
    use std::os::unix::fs::PermissionsExt;
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("state");
    storage::set_enabled(&root, true).unwrap();
    assert_eq!(
        fs::metadata(&root).unwrap().permissions().mode() & 0o777,
        0o700
    );
    assert_eq!(
        fs::metadata(root.join("last-batch.json"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
}
