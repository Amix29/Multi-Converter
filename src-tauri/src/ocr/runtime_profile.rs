use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileLock {
    profile_id: String,
    source_artifact: ArtifactLock,
    artifact: ArtifactLock,
    retired_files: Vec<ContentFile>,
    #[serde(default)]
    source_model_artifact: Option<ArtifactLock>,
    #[serde(default)]
    model_artifact: Option<ArtifactLock>,
}

static APPROVED: OnceLock<Result<ProfileLock, String>> = OnceLock::new();
static NATIVE: OnceLock<Result<ProfileLock, String>> = OnceLock::new();

fn native() -> Result<&'static ProfileLock, String> {
    NATIVE
        .get_or_init(|| {
            serde_json::from_str(include_str!("../../windows-native-ocr-profile.json"))
                .map_err(|error| format!("OCR_RUNTIME_LOCK:{error}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

fn same(left: &ArtifactLock, right: &ArtifactLock) -> bool {
    left.file_count == right.file_count
        && left.total_bytes == right.total_bytes
        && left.aggregate_sha256 == right.aggregate_sha256
}

fn approved() -> Result<&'static ProfileLock, String> {
    APPROVED
        .get_or_init(|| {
            serde_json::from_str(include_str!("../../windows-ocr-profile.json"))
                .map_err(|error| format!("OCR_RUNTIME_LOCK:{error}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

pub(super) fn retired_files(
    expected: &ArtifactLock,
) -> Result<Option<&'static [ContentFile]>, String> {
    let legacy = approved()?;
    if same(expected, &legacy.artifact) {
        return Ok(Some(&legacy.retired_files));
    }
    Ok(None)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Marker {
    distribution_profile: Option<String>,
    source_aggregate_sha256: Option<String>,
}

pub(super) fn expectation(
    root: &Path,
    selection: &PlatformSelection,
) -> Result<ArtifactLock, String> {
    let original = selection
        .artifact
        .as_ref()
        .ok_or_else(|| "OCR_RUNTIME_UNVERIFIED:Runtime platform is not locked.".to_string())?;
    if selection.platform != "windows-x64" {
        return Ok(original.clone());
    }
    let marker = read_marker(root, "runtime-manifest.json")?;
    let Some(id) = marker.distribution_profile else {
        return Ok(original.clone());
    };
    let profile = if id == native()?.profile_id {
        native()?
    } else {
        approved()?
    };
    if id != profile.profile_id
        || marker.source_aggregate_sha256.as_deref()
            != Some(profile.source_artifact.aggregate_sha256.as_str())
        || !same(original, &profile.source_artifact)
    {
        return Err(
            "OCR_RUNTIME_UNVERIFIED:Unknown runtime profile or changed origin.".to_string(),
        );
    }
    // Expectations come from compiled approved profiles, never the resource.
    Ok(profile.artifact.clone())
}

fn read_marker(root: &Path, name: &str) -> Result<Marker, String> {
    let mut bytes = Vec::new();
    File::open(root.join(name))
        .and_then(|file| file.take(MAX_MANIFEST_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("OCR_RUNTIME_UNVERIFIED:Manifest exceeds size limit.".to_string());
    }
    serde_json::from_slice(&bytes).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))
}

pub(super) fn native_selected(root: &Path, selected: &PlatformSelection) -> Result<bool, String> {
    Ok(same(&expectation(root, selected)?, &native()?.artifact))
}

pub(super) fn model_expectation(
    root: &Path,
    original: &ArtifactLock,
    runtime: &ArtifactLock,
) -> Result<ArtifactLock, String> {
    let marker = read_marker(root, "models-lock.json")?;
    let profile = native()?;
    if !same(runtime, &profile.artifact) {
        if marker.distribution_profile.is_some() {
            return Err("OCR_RUNTIME_UNVERIFIED:Native models require the native runtime.".into());
        }
        return Ok(original.clone());
    }
    if marker.distribution_profile.as_deref() != Some(profile.profile_id.as_str())
        || marker.source_aggregate_sha256.as_deref() != Some(original.aggregate_sha256.as_str())
        || !profile
            .source_model_artifact
            .as_ref()
            .is_some_and(|source| same(source, original))
    {
        return Err("OCR_RUNTIME_UNVERIFIED:Model profile or origin changed.".into());
    }
    profile
        .model_artifact
        .clone()
        .ok_or_else(|| "OCR_RUNTIME_LOCK:Missing native model lock.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_models_require_matching_runtime_and_unchanged_embedded_origin() {
        let temp = tempfile::tempdir().unwrap();
        let original = parse_lock().unwrap().model_artifact;
        let profile = native().unwrap();
        let file = temp.path().join("models-lock.json");
        let marker = serde_json::json!({"distributionProfile":profile.profile_id,
            "sourceAggregateSha256":original.aggregate_sha256});
        fs::write(&file, marker.to_string()).unwrap();
        assert_eq!(
            model_expectation(temp.path(), &original, &profile.artifact)
                .unwrap()
                .aggregate_sha256,
            profile.model_artifact.as_ref().unwrap().aggregate_sha256
        );
        assert!(model_expectation(temp.path(), &original, &approved().unwrap().artifact).is_err());
        fs::write(
            &file,
            r#"{"distributionProfile":"windows-native-ocr-v1","sourceAggregateSha256":"wrong"}"#,
        )
        .unwrap();
        assert!(model_expectation(temp.path(), &original, &profile.artifact).is_err());
        fs::write(&file, "{}").unwrap();
        assert!(model_expectation(temp.path(), &original, &profile.artifact).is_err());
        assert_eq!(
            model_expectation(temp.path(), &original, &approved().unwrap().artifact)
                .unwrap()
                .aggregate_sha256,
            original.aggregate_sha256
        );
    }

    #[test]
    fn profiles_preserve_original_archive_expectations_and_reject_unknown_variants() {
        let selected = parse_lock()
            .unwrap()
            .platform_selections
            .into_iter()
            .find(|item| item.platform == "windows-x64")
            .unwrap();
        let temp = tempfile::tempdir().unwrap();
        let manifest = temp.path().join("runtime-manifest.json");
        fs::write(&manifest, "{}").unwrap();
        assert_eq!(
            expectation(temp.path(), &selected)
                .unwrap()
                .aggregate_sha256,
            selected.artifact.as_ref().unwrap().aggregate_sha256
        );
        let approved = approved().unwrap();
        fs::write(
            &manifest,
            serde_json::json!({"distributionProfile": approved.profile_id,
                "sourceAggregateSha256": approved.source_artifact.aggregate_sha256})
            .to_string(),
        )
        .unwrap();
        let mut historical = selected.clone();
        historical.artifact = Some(approved.source_artifact.clone());
        assert_eq!(
            expectation(temp.path(), &historical)
                .unwrap()
                .aggregate_sha256,
            approved.artifact.aggregate_sha256
        );
        let mut mismatched = historical;
        mismatched.artifact.as_mut().unwrap().aggregate_sha256 = "wrong".into();
        assert!(expectation(temp.path(), &mismatched).is_err());
        for marker in [
            r#"{"distributionProfile":"unknown"}"#,
            r#"{"distributionProfile":"windows-offline-ocr-v1","sourceAggregateSha256":"wrong"}"#,
        ] {
            fs::write(&manifest, marker).unwrap();
            assert!(expectation(temp.path(), &selected).is_err());
        }
    }
}
