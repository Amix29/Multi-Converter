use super::*;

#[test]
fn directly_installed_runtime_requires_worker_and_manifest() {
    let temporary = tempfile::tempdir().unwrap();
    let selected = selection(&parse_lock().unwrap()).unwrap();
    let worker = temporary.path().join(&selected.executable);
    fs::create_dir_all(worker.parent().unwrap()).unwrap();
    assert!(direct_runtime(temporary.path(), &selected).is_none());
    fs::write(&worker, b"fixture").unwrap();
    assert!(direct_runtime(temporary.path(), &selected).is_none());
    fs::write(
        worker.parent().unwrap().join("runtime-manifest.json"),
        b"{}",
    )
    .unwrap();
    assert_eq!(direct_runtime(temporary.path(), &selected), Some(worker));
    // Presence does not establish integrity: selected_runtime always runs the
    // existing full manifest/hash/architecture verification before inference.
}

#[cfg(target_os = "windows")]
#[test]
#[ignore = "requires the prepared real Windows direct resources"]
fn prepared_direct_ocr_verifies_without_archive_extraction() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bundled-engine-profiles/windows-x64/current/ocr");
    let lock = parse_lock().unwrap();
    let selected = selection(&lock).unwrap();
    let resolved = ResolvedRuntime {
        executable: direct_runtime(&root, &selected).expect("prepared direct worker"),
        models_dir: root.join("models"),
        provider: selected.provider.clone(),
    };
    verify_resources(
        &resolved,
        &selected,
        &lock.model_artifact,
        &AtomicBool::new(false),
        &mut |_, _| {},
    )
    .unwrap();
    assert!(!runtime_archive::archive_path(&root, &selected.platform).exists());
}

#[test]
fn worker_blas_environment_overrides_unbounded_command_settings() {
    let mut command = std::process::Command::new("worker-must-not-run");
    command
        .env("OMP_NUM_THREADS", "9999")
        .env("OPENBLAS_NUM_THREADS", "9999");
    configure_worker_environment(&mut command);
    let values: std::collections::HashMap<_, _> = command
        .get_envs()
        .filter_map(|(key, value)| {
            value.map(|value| (key.to_string_lossy(), value.to_string_lossy()))
        })
        .collect();
    let threads = values["OMP_NUM_THREADS"].parse::<usize>().unwrap();
    assert!((1..=4).contains(&threads));
    assert_eq!(values["MKL_NUM_THREADS"], values["OMP_NUM_THREADS"]);
    assert_eq!(values["OPENBLAS_NUM_THREADS"], "1");
}

#[test]
#[ignore = "requires the actual prepared host OCR archive and locked models"]
fn prepared_ocr_archive_extracts_and_verifies_every_resource() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ocr-resources");
    let lock = parse_lock().unwrap();
    let selected = selection(&lock).unwrap();
    let expected = selected
        .artifact
        .as_ref()
        .expect("host runtime must be locked");
    let archive = runtime_archive::archive_path(&root, &selected.platform);
    assert!(archive.is_file(), "host runtime archive must be prepared");
    let staging = crate::private_temp::builder("mc-ocr-archive-proof-")
        .tempdir()
        .unwrap();
    runtime_archive::extract_prepared_for_test(
        &archive,
        staging.path(),
        runtime_archive::ArchiveExpectation {
            aggregate_sha256: &expected.aggregate_sha256,
            file_count: expected.file_count,
            total_bytes: expected.total_bytes,
        },
    )
    .unwrap();
    let executable = Path::new(&selected.executable).file_name().unwrap();
    let runtime = ResolvedRuntime {
        executable: staging.path().join(executable),
        models_dir: root.join("models"),
        provider: selected.provider.clone(),
    };
    let mut stages = std::collections::HashSet::new();
    verify_resources(
        &runtime,
        &selected,
        &lock.model_artifact,
        &AtomicBool::new(false),
        &mut |stage, percent| {
            if percent == 100 {
                stages.insert(stage);
            }
        },
    )
    .unwrap();
    assert!(stages.contains("verifying-runtime"));
    assert!(stages.contains("verifying-models"));
    println!(
        "Verified {}: {} runtime files / {} bytes, {} model files / {} bytes, correct host architecture",
        selected.platform,
        expected.file_count,
        expected.total_bytes,
        lock.model_artifact.file_count,
        lock.model_artifact.total_bytes
    );
}

#[test]
fn content_verification_detects_a_modified_resource() {
    let temp = tempfile::tempdir().unwrap();
    let payload = temp.path().join("worker.bin");
    fs::write(&payload, b"trusted").unwrap();
    let canceled = AtomicBool::new(false);
    let digest = sha256(&payload, &canceled).unwrap();
    let aggregate = format!(
        "{:x}",
        Sha256::digest(format!("worker.bin\0{}\0{}\n", 7, digest))
    );
    let manifest_path = temp.path().join("runtime-manifest.json");
    fs::write(
        &manifest_path,
        serde_json::json!({
            "fileCount": 1,
            "totalBytes": 7,
            "aggregateSha256": aggregate,
            "files": [{ "path": "worker.bin", "bytes": 7, "sha256": digest }]
        })
        .to_string(),
    )
    .unwrap();
    let expected = ArtifactLock {
        file_count: 1,
        total_bytes: 7,
        aggregate_sha256: aggregate,
    };
    verify_content_manifest(
        temp.path(),
        &manifest_path,
        &expected,
        &canceled,
        &mut |_| {},
    )
    .unwrap();
    fs::write(&payload, b"altered").unwrap();
    assert!(
        verify_content_manifest(
            temp.path(),
            &manifest_path,
            &expected,
            &canceled,
            &mut |_| {},
        )
        .is_err()
    );
}

#[test]
fn changing_a_resource_and_its_manifest_cannot_keep_the_embedded_lock() {
    let temp = tempfile::tempdir().unwrap();
    let payload = temp.path().join("worker.bin");
    fs::write(&payload, b"trusted").unwrap();
    let canceled = AtomicBool::new(false);
    let digest = sha256(&payload, &canceled).unwrap();
    let aggregate = format!(
        "{:x}",
        Sha256::digest(format!("worker.bin\0{}\0{}\n", 7, digest))
    );
    let expected = ArtifactLock {
        file_count: 1,
        total_bytes: 7,
        aggregate_sha256: aggregate.clone(),
    };
    let mut manifest = serde_json::json!({
        "fileCount": 1, "totalBytes": 7, "aggregateSha256": aggregate,
        "files": [{"path": "worker.bin", "bytes": 7, "sha256": digest}]
    });
    let path = temp.path().join("runtime-manifest.json");
    fs::write(&path, manifest.to_string()).unwrap();
    verify_content_manifest(temp.path(), &path, &expected, &canceled, &mut |_| {}).unwrap();
    fs::write(&payload, b"altered").unwrap();
    manifest["files"][0]["sha256"] = sha256(&payload, &canceled).unwrap().into();
    fs::write(&path, manifest.to_string()).unwrap();
    assert!(
        verify_content_manifest(temp.path(), &path, &expected, &canceled, &mut |_| {}).is_err()
    );
}

#[test]
fn content_verification_honors_cancellation_between_files() {
    let temp = tempfile::tempdir().unwrap();
    let canceled = AtomicBool::new(false);
    let first = temp.path().join("first.bin");
    let second = temp.path().join("second.bin");
    fs::write(&first, b"first").unwrap();
    fs::write(&second, b"second").unwrap();
    let first_hash = sha256(&first, &canceled).unwrap();
    let second_hash = sha256(&second, &canceled).unwrap();
    let aggregate = format!(
        "{:x}",
        Sha256::digest(format!(
            "first.bin\0{}\0{}\nsecond.bin\0{}\0{}\n",
            5, first_hash, 6, second_hash
        ))
    );
    let manifest_path = temp.path().join("runtime-manifest.json");
    fs::write(
        &manifest_path,
        serde_json::json!({
            "fileCount": 2,
            "totalBytes": 11,
            "aggregateSha256": aggregate,
            "files": [
                { "path": "first.bin", "bytes": 5, "sha256": first_hash },
                { "path": "second.bin", "bytes": 6, "sha256": second_hash }
            ]
        })
        .to_string(),
    )
    .unwrap();
    let expected = ArtifactLock {
        file_count: 2,
        total_bytes: 11,
        aggregate_sha256: aggregate,
    };
    let error = verify_content_manifest(
        temp.path(),
        &manifest_path,
        &expected,
        &canceled,
        &mut |_| canceled.store(true, Ordering::SeqCst),
    )
    .unwrap_err();
    assert!(error.starts_with("OCR_CANCELLED:"));
}

#[test]
fn canceled_verification_is_not_cached() {
    let mut slot = None;
    let canceled = Err("OCR_CANCELLED:L’OCR a été annulé.".to_string());
    retain_verification_result(&mut slot, &canceled);
    assert!(slot.is_none());

    let failed = Err("OCR_RUNTIME_UNVERIFIED:ressource modifiée".to_string());
    retain_verification_result(&mut slot, &failed);
    assert_eq!(slot, Some(failed));
}

#[test]
fn manifest_paths_must_remain_relative() {
    assert!(safe_relative_path("models/text/inference.json").is_ok());
    assert!(safe_relative_path("../outside").is_err());
    assert!(safe_relative_path("C:/outside").is_err());
}

#[test]
fn platform_selection_rejects_intel_macos_and_preserves_supported_targets() {
    assert_eq!(platform_key_for("macos", "aarch64"), "macos-aarch64");
    assert_eq!(platform_key_for("macos", "x86_64"), "unsupported");
    assert_eq!(platform_key_for("windows", "x86_64"), "windows-x64");
    assert_eq!(platform_key_for("linux", "x86_64"), "linux-x64");
    assert_eq!(platform_key_for("linux", "aarch64"), "unsupported");
}

#[test]
fn worker_architecture_parsers_reject_foreign_binaries() {
    let mut pe = vec![0u8; 0x48];
    pe[0..2].copy_from_slice(b"MZ");
    pe[0x3c..0x40].copy_from_slice(&(0x40u32).to_le_bytes());
    pe[0x40..0x44].copy_from_slice(b"PE\0\0");
    pe[0x44..0x46].copy_from_slice(&0x8664u16.to_le_bytes());
    assert_eq!(pe_machine(&pe), Some(0x8664));
    assert_eq!(mach_cpu(&pe), None);

    let mut arm = vec![0xcf, 0xfa, 0xed, 0xfe];
    arm.extend_from_slice(&0x0100_000cu32.to_le_bytes());
    assert_eq!(mach_cpu(&arm), Some(0x0100_000c));
}
