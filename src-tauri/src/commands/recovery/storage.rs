use super::*;
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_STATE_BYTES: u64 = 2 * 1024 * 1024;
const RETENTION_SECONDS: u64 = 24 * 60 * 60;
const STATE_FILE: &str = "last-batch.json";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    schema_version: u32,
    enabled: bool,
    checkpoint: Option<Checkpoint>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            schema_version: 1,
            enabled: false,
            checkpoint: None,
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Checkpoint {
    saved_at_unix_seconds: u64,
    quality_profile: QualityProfile,
    files: Vec<StoredFile>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredFile {
    file: RecoveryFile,
    fingerprint: Fingerprint,
}

#[derive(Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fingerprint {
    bytes: u64,
    modified_seconds: u64,
    modified_nanos: u32,
}

pub(super) fn load(root: &Path) -> CommandResult<RecoveryState> {
    let mut config = read(root)?;
    if !config.enabled {
        return Ok(RecoveryState {
            enabled: false,
            plan: None,
            skipped_files: 0,
        });
    }
    let Some(checkpoint) = &config.checkpoint else {
        return Ok(RecoveryState {
            enabled: true,
            plan: None,
            skipped_files: 0,
        });
    };
    let now = now()?;
    if checkpoint.saved_at_unix_seconds > now
        || now - checkpoint.saved_at_unix_seconds >= RETENTION_SECONDS
    {
        config.checkpoint = None;
        write(root, &config)?;
        return Ok(RecoveryState {
            enabled: true,
            plan: None,
            skipped_files: 0,
        });
    }
    if checkpoint.files.len() > 2_000 {
        return Err(invalid());
    }
    let mut files = Vec::new();
    for entry in &checkpoint.files {
        validate_file(&entry.file)?;
        if fingerprint(Path::new(&entry.file.path)).as_ref() == Some(&entry.fingerprint) {
            files.push(entry.file.clone());
        }
    }
    let skipped_files = checkpoint.files.len() - files.len();
    let plan = (!files.is_empty()).then_some(RecoveryPlan {
        schema_version: 1,
        quality_profile: checkpoint.quality_profile,
        files,
    });
    Ok(RecoveryState {
        enabled: true,
        plan,
        skipped_files,
    })
}

pub(super) fn set_enabled(root: &Path, enabled: bool) -> CommandResult<RecoveryState> {
    // An explicit settings change can replace a corrupt checkpoint, but never
    // follows a linked storage directory (write validates that separately).
    let mut config = read(root).unwrap_or_default();
    config.enabled = enabled;
    if !enabled {
        config.checkpoint = None;
    }
    write(root, &config)?;
    load(root)
}

pub(super) fn clear(root: &Path) -> CommandResult<bool> {
    let mut config = read(root)?;
    if config.checkpoint.is_some() {
        config.checkpoint = None;
        write(root, &config)?;
    }
    Ok(true)
}

pub(super) fn save(root: &Path, plan: RecoveryPlan) -> CommandResult<usize> {
    let mut config = read(root)?;
    // This check is inside the same command lock as disabling/clearing, so a
    // queued save cannot restore paths after the user disables the setting.
    if !config.enabled {
        return Ok(0);
    }
    if plan.schema_version != 1 || plan.files.is_empty() || plan.files.len() > 2_000 {
        return Err(invalid());
    }
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    for mut file in plan.files {
        validate_file(&file)?;
        let Some(fingerprint) = fingerprint(Path::new(&file.path)) else {
            continue;
        };
        let path = Path::new(&file.path)
            .canonicalize()
            .map_err(|_| invalid())?;
        file.path = path.to_string_lossy().into_owned();
        if seen.insert(file.path.clone()) {
            files.push(StoredFile { file, fingerprint });
        }
    }
    let count = files.len();
    config.checkpoint = (count > 0).then_some(Checkpoint {
        saved_at_unix_seconds: now()?,
        quality_profile: plan.quality_profile,
        files,
    });
    write(root, &config)?;
    Ok(count)
}

fn validate_file(file: &RecoveryFile) -> CommandResult<()> {
    if file.path.len() > 32_768
        || !Path::new(&file.path).is_absolute()
        || file.path.contains('\0')
        || crate::registry::get_format_by_id(&file.target_format).is_none()
        || file
            .import_origin
            .as_ref()
            .is_some_and(|origin| !super::super::export::valid_recovery_origin(origin))
    {
        return Err(invalid());
    }
    Ok(())
}

fn fingerprint(path: &Path) -> Option<Fingerprint> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.is_file() || linked(&metadata) {
        return None;
    }
    let modified = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    Some(Fingerprint {
        bytes: metadata.len(),
        modified_seconds: modified.as_secs(),
        modified_nanos: modified.subsec_nanos(),
    })
}

fn read(root: &Path) -> CommandResult<Config> {
    if let Ok(metadata) = fs::symlink_metadata(root)
        && (!metadata.is_dir() || linked(&metadata))
    {
        return Err(invalid());
    }
    let path = root.join(STATE_FILE);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Config::default()),
        Err(_) => return Err(invalid()),
    };
    if !metadata.is_file() || linked(&metadata) || metadata.len() > MAX_STATE_BYTES {
        return Err(invalid());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| invalid())?
        .take(MAX_STATE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| invalid())?;
    if bytes.len() as u64 > MAX_STATE_BYTES {
        return Err(invalid());
    }
    let config: Config = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    if config.schema_version != 1 {
        return Err(invalid());
    }
    Ok(config)
}

fn write(root: &Path, config: &Config) -> CommandResult<()> {
    fs::create_dir_all(root).map_err(|_| invalid())?;
    let metadata = fs::symlink_metadata(root).map_err(|_| invalid())?;
    if !metadata.is_dir() || linked(&metadata) {
        return Err(invalid());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root, fs::Permissions::from_mode(0o700)).map_err(|_| invalid())?;
    }
    let bytes = serde_json::to_vec(config).map_err(|_| invalid())?;
    if bytes.len() as u64 > MAX_STATE_BYTES {
        return Err(invalid());
    }
    let mut file = tempfile::NamedTempFile::new_in(root).map_err(|_| invalid())?;
    file.write_all(&bytes).map_err(|_| invalid())?;
    file.as_file().sync_all().map_err(|_| invalid())?;
    file.persist(root.join(STATE_FILE)).map_err(|_| invalid())?;
    Ok(())
}

fn linked(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

fn now() -> CommandResult<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_secs())
        .map_err(|_| invalid())
}
fn invalid() -> String {
    "Le plan de reprise local est invalide ou inaccessible.".to_string()
}

#[cfg(test)]
pub(super) fn expire_for_test(root: &Path) {
    let mut config = read(root).unwrap();
    config.checkpoint.as_mut().unwrap().saved_at_unix_seconds = now().unwrap() - RETENTION_SECONDS;
    write(root, &config).unwrap();
}
