use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileLock {
    profile_id: String,
    source_artifact: ArtifactLock,
    artifact: ArtifactLock,
    retired_files: Vec<ContentFile>,
}

static APPROVED: OnceLock<Result<ProfileLock, String>> = OnceLock::new();

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
    let profile = approved()?;
    Ok(
        (expected.aggregate_sha256 == profile.artifact.aggregate_sha256
            && expected.file_count == profile.artifact.file_count
            && expected.total_bytes == profile.artifact.total_bytes)
            .then_some(profile.retired_files.as_slice()),
    )
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
    let mut bytes = Vec::new();
    File::open(root.join("runtime-manifest.json"))
        .and_then(|file| file.take(MAX_MANIFEST_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("OCR_RUNTIME_UNVERIFIED:Manifest exceeds size limit.".to_string());
    }
    let marker: Marker = serde_json::from_slice(&bytes)
        .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    let Some(id) = marker.distribution_profile else {
        return Ok(original.clone());
    };
    let profile = approved()?;
    if id != profile.profile_id
        || marker.source_aggregate_sha256.as_deref()
            != Some(profile.source_artifact.aggregate_sha256.as_str())
        || original.file_count != profile.source_artifact.file_count
        || original.total_bytes != profile.source_artifact.total_bytes
        || original.aggregate_sha256 != profile.source_artifact.aggregate_sha256
    {
        return Err(
            "OCR_RUNTIME_UNVERIFIED:Unknown runtime profile or changed origin.".to_string(),
        );
    }
    // This selects an embedded approved expectation, never a hash supplied by
    // the resource. The existing verifier still hashes every file and rejects
    // unknown files and incorrect architecture before inference. Leftovers from
    // the previous installer must match the embedded original hashes exactly.
    Ok(profile.artifact.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let approved: ProfileLock =
            serde_json::from_str(include_str!("../../windows-ocr-profile.json")).unwrap();
        fs::write(
            &manifest,
            serde_json::json!({"distributionProfile": approved.profile_id,
                "sourceAggregateSha256": approved.source_artifact.aggregate_sha256})
            .to_string(),
        )
        .unwrap();
        assert_eq!(
            expectation(temp.path(), &selected)
                .unwrap()
                .aggregate_sha256,
            approved.artifact.aggregate_sha256
        );
        for marker in [
            r#"{"distributionProfile":"unknown"}"#,
            r#"{"distributionProfile":"windows-offline-ocr-v1","sourceAggregateSha256":"wrong"}"#,
        ] {
            fs::write(&manifest, marker).unwrap();
            assert!(expectation(temp.path(), &selected).is_err());
        }
    }
}
