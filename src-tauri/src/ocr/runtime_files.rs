use super::*;

pub(super) fn count_regular_files(
    root: &Path,
    manifest_path: &Path,
    retired: Option<&[ContentFile]>,
    canceled: &AtomicBool,
) -> Result<usize, String> {
    let old: std::collections::HashMap<_, _> = retired
        .unwrap_or_default()
        .iter()
        .map(|entry| (entry.path.as_str(), entry))
        .collect();
    let mut count = 0usize;
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        ensure_not_canceled(canceled)?;
        for entry in
            fs::read_dir(directory).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?
        {
            ensure_not_canceled(canceled)?;
            let entry = entry.map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
            let path = entry.path();
            let kind = entry
                .file_type()
                .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
            if kind.is_dir() {
                pending.push(path);
            } else if kind.is_file() {
                if path != manifest_path {
                    let relative = path
                        .strip_prefix(root)
                        .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?
                        .to_string_lossy()
                        .replace('\\', "/");
                    if let Some(legacy) = old.get(relative.as_str()) {
                        if entry
                            .metadata()
                            .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?
                            .len()
                            != legacy.bytes
                            || sha256(&path, canceled)? != legacy.sha256
                        {
                            return Err(format!(
                                "OCR_RUNTIME_UNVERIFIED:Modified legacy resource: {relative}"
                            ));
                        }
                    } else {
                        count += 1;
                    }
                }
            } else {
                return Err("OCR_RUNTIME_UNVERIFIED:Entrée OCR non régulière.".to_string());
            }
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_exact_original_legacy_files_can_remain_after_an_upgrade() {
        let temp = tempfile::tempdir().unwrap();
        let manifest = temp.path().join("runtime-manifest.json");
        fs::write(&manifest, b"{}").unwrap();
        fs::write(temp.path().join("active.bin"), b"active").unwrap();
        let legacy = temp.path().join("obsolete.h");
        fs::write(&legacy, b"original").unwrap();
        let canceled = AtomicBool::new(false);
        let rules = vec![ContentFile {
            path: "obsolete.h".into(),
            bytes: 8,
            sha256: sha256(&legacy, &canceled).unwrap(),
        }];
        assert_eq!(
            count_regular_files(temp.path(), &manifest, Some(&rules), &canceled).unwrap(),
            1
        );
        fs::write(&legacy, b"modified").unwrap();
        assert!(count_regular_files(temp.path(), &manifest, Some(&rules), &canceled).is_err());
        fs::write(&legacy, b"original").unwrap();
        fs::write(temp.path().join("unknown.dll"), b"unexpected").unwrap();
        assert_eq!(
            count_regular_files(temp.path(), &manifest, Some(&rules), &canceled).unwrap(),
            2
        );
        assert_eq!(
            count_regular_files(temp.path(), &manifest, None, &canceled).unwrap(),
            3
        );
    }
}
