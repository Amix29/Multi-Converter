use crate::engine_distribution::ManifestEngine;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibreOfficeProfile {
    profile_id: String,
    source_archive_sha256: String,
    archive_sha256: String,
    installed_size_bytes: u64,
}

pub(super) struct ArchiveSpec {
    pub sha256: String,
    pub installed_size_bytes: u64,
    pub cache_key: Option<String>,
}

pub(super) fn archive_spec(engine: &ManifestEngine) -> Result<ArchiveSpec, String> {
    if engine.id != "libreoffice" || engine.platform != "windows-x64" {
        return Ok(ArchiveSpec {
            sha256: engine.sha256.clone(),
            installed_size_bytes: engine.installed_size_bytes,
            cache_key: None,
        });
    }
    let profile: LibreOfficeProfile =
        serde_json::from_str(include_str!("../../windows-libreoffice-profile.json"))
            .map_err(|_| "Profil LibreOffice embarqué invalide.".to_string())?;
    spec_for_profile(engine, profile)
}

fn spec_for_profile(
    engine: &ManifestEngine,
    profile: LibreOfficeProfile,
) -> Result<ArchiveSpec, String> {
    if !engine
        .sha256
        .eq_ignore_ascii_case(&profile.source_archive_sha256)
        || profile.archive_sha256.len() != 64
        || !profile
            .archive_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || profile.profile_id != "windows-headless-v1"
        || profile.installed_size_bytes == 0
    {
        return Err("Le profil LibreOffice ne correspond pas au moteur verrouillé.".to_string());
    }
    Ok(ArchiveSpec {
        cache_key: Some(profile.archive_sha256.clone()),
        sha256: profile.archive_sha256,
        installed_size_bytes: profile.installed_size_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine() -> ManifestEngine {
        crate::engine_distribution::load_manifest()
            .unwrap()
            .engines
            .into_iter()
            .find(|engine| engine.id == "libreoffice" && engine.platform == "windows-x64")
            .unwrap()
    }

    #[test]
    fn bundled_profile_uses_its_own_verified_archive_and_cache() {
        let engine = engine();
        let spec = archive_spec(&engine).unwrap();
        assert_ne!(spec.sha256, engine.sha256);
        assert_eq!(spec.cache_key.as_deref(), Some(spec.sha256.as_str()));
        assert!(spec.installed_size_bytes < engine.installed_size_bytes);
    }

    #[test]
    fn profile_rejects_an_unrelated_distribution_archive() {
        let mut engine = engine();
        engine.sha256 = "0".repeat(64);
        assert!(archive_spec(&engine).is_err());
    }

    #[test]
    fn another_platform_keeps_its_original_distribution_identity() {
        let mut engine = engine();
        engine.platform = "linux-x64".to_string();
        let spec = archive_spec(&engine).unwrap();
        assert_eq!(spec.sha256, engine.sha256);
        assert_eq!(spec.installed_size_bytes, engine.installed_size_bytes);
        assert!(spec.cache_key.is_none());
    }
}
