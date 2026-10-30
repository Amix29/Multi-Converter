use super::{CommandResult, ExportTransaction};
use crate::runtime_log;
use std::{
    fs,
    path::{Path, PathBuf},
};

const MAX_RELATIVE_PATH_BYTES: usize = 4096;
const MAX_COMPONENT_CHARS: usize = 240;
const MAX_ROOT_ID_BYTES: usize = 128;

pub(super) struct ParsedRelativePath {
    components: Vec<String>,
}

impl ParsedRelativePath {
    pub(super) fn parse(value: &str, root_id: Option<&str>) -> CommandResult<Self> {
        if value.is_empty()
            || value.len() > MAX_RELATIVE_PATH_BYTES
            || value.starts_with(['/', '\\'])
            || Path::new(value).is_absolute()
            || crate::path_safety::windows_absolute(value)
        {
            return Err("Chemin relatif d'export non valide.".to_string());
        }
        if let Some(root_id) = root_id {
            validate_root_id(root_id)?;
        }
        let raw_components: Vec<_> = value.split(['/', '\\']).collect();
        if raw_components.iter().any(|component| component.is_empty()) {
            return Err("Le chemin d'export contient un composant vide.".to_string());
        }
        let mut components = Vec::with_capacity(raw_components.len());
        for component in raw_components {
            validate_component(component)?;
            components.push(component.to_string());
        }
        let expected_minimum = if root_id.is_some() { 2 } else { 1 };
        if components.len() < expected_minimum || (root_id.is_none() && components.len() != 1) {
            return Err("Arborescence d'export incohérente.".to_string());
        }
        Ok(Self { components })
    }

    pub(super) fn components(&self) -> &[String] {
        &self.components
    }

    pub(super) fn normalized(&self) -> String {
        self.components.join("/")
    }
}

fn validate_root_id(value: &str) -> CommandResult<()> {
    if value.is_empty()
        || value.len() > MAX_ROOT_ID_BYTES
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("Identifiant de dossier importé non valide.".to_string());
    }
    Ok(())
}

fn validate_component(value: &str) -> CommandResult<()> {
    if value == "."
        || value == ".."
        || value.chars().count() > MAX_COMPONENT_CHARS
        || value.chars().any(char::is_control)
    {
        return Err(format!("Composant de chemin d'export non valide : {value}"));
    }
    #[cfg(target_os = "windows")]
    {
        if value.ends_with([' ', '.'])
            || value
                .chars()
                .any(|character| "<>:\"/\\|?*".contains(character))
        {
            return Err(format!("Composant de chemin d'export non valide : {value}"));
        }
        let stem = value.split('.').next().unwrap_or("").to_ascii_uppercase();
        if is_windows_reserved_name(&stem) {
            return Err(format!("Nom réservé dans le chemin d'export : {value}"));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn is_windows_reserved_name(value: &str) -> bool {
    matches!(value, "CON" | "PRN" | "AUX" | "NUL")
        || value
            .strip_prefix("COM")
            .or_else(|| value.strip_prefix("LPT"))
            .is_some_and(|suffix| {
                matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            })
}

pub(super) fn prepare_destination(destination: &Path) -> CommandResult<PathBuf> {
    fs::create_dir_all(destination).map_err(|error| {
        runtime_log::write(
            "export",
            &format!(
                "create_dir_all failed for {}: {:?}",
                runtime_log::path(destination),
                error.kind()
            ),
        );
        format!(
            "Impossible de préparer le dossier choisi \"{}\" : {}",
            destination.display(),
            error
        )
    })?;
    let metadata = fs::symlink_metadata(destination).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || is_link_or_reparse_point(&metadata) {
        return Err(
            "Le dossier de destination ne peut pas être un lien ou point de réanalyse.".to_string(),
        );
    }
    destination
        .canonicalize()
        .map_err(|error| error.to_string())
}

pub(super) fn reserve_unique_root(destination: &Path, root_name: &str) -> CommandResult<PathBuf> {
    for index in 1usize.. {
        let name = if index == 1 {
            root_name.to_string()
        } else {
            format!("{root_name} ({index})")
        };
        let candidate = destination.join(name);
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "Impossible de réserver le dossier d'export \"{}\" : {}",
                    candidate.display(),
                    error
                ));
            }
        }
    }
    unreachable!("unbounded collision suffix")
}

pub(super) fn ensure_safe_subdirectories(
    root: &Path,
    components: &[String],
    canonical_destination: &Path,
    transaction: &mut ExportTransaction,
) -> CommandResult<PathBuf> {
    let mut current = root.to_path_buf();
    for component in components {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.is_dir() && !is_link_or_reparse_point(&metadata) => {}
            Ok(_) => {
                return Err(
                    "Un composant d'export est un lien ou n'est pas un dossier.".to_string()
                );
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|error| error.to_string())?;
                transaction.record_directory(current.clone());
            }
            Err(error) => return Err(error.to_string()),
        }
        ensure_within_destination(&current, canonical_destination)?;
    }
    ensure_within_destination(&current, canonical_destination)?;
    Ok(current)
}

fn ensure_within_destination(path: &Path, destination: &Path) -> CommandResult<()> {
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    if !canonical.starts_with(destination) {
        return Err("Export refusé : le chemin sortirait du dossier de destination.".to_string());
    }
    Ok(())
}

pub(super) fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink() || metadata_is_windows_reparse_point(metadata)
}

#[cfg(target_os = "windows")]
fn metadata_is_windows_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(target_os = "windows"))]
fn metadata_is_windows_reparse_point(_metadata: &fs::Metadata) -> bool {
    false
}
