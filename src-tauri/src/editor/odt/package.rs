use super::{MAX_ARCHIVE_ENTRIES, MAX_COMPRESSION_RATIO, MAX_UNCOMPRESSED_BYTES};
use crate::editor::document::CommandResult;
use std::collections::HashSet;
use std::fs;
use std::io::Read;

pub(super) fn validate_archive(archive: &mut zip::ZipArchive<fs::File>) -> CommandResult<()> {
    if archive.is_empty() || archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("ODT_ARCHIVE_LIMIT:Nombre d’entrées ODT invalide.".to_string());
    }
    let first = archive
        .by_index(0)
        .map_err(|error| format!("ODT_ARCHIVE_INVALID:{error}"))?;
    if first.name() != "mimetype" || first.compression() != zip::CompressionMethod::Stored {
        return Err(
            "ODT_ARCHIVE_INVALID:L’entrée mimetype doit être la première et non compressée."
                .to_string(),
        );
    }
    drop(first);

    let mut total = 0u64;
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("ODT_ARCHIVE_INVALID:{error}"))?;
        let enclosed = entry.enclosed_name().ok_or_else(|| {
            "ODT_PATH_TRAVERSAL:Un chemin dangereux a été détecté dans l’archive.".to_string()
        })?;
        let normalized = enclosed
            .to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_string();
        if normalized.starts_with('/')
            || normalized.is_empty()
            || normalized
                .split('/')
                .any(|part| part == ".." || part.is_empty())
        {
            return Err("ODT_PATH_TRAVERSAL:Chemin d’archive invalide.".to_string());
        }
        if !names.insert(normalized.to_ascii_lowercase()) {
            return Err("ODT_ARCHIVE_INVALID:Entrées ODT ambiguës ou dupliquées.".to_string());
        }
        total = total
            .checked_add(entry.size())
            .ok_or_else(|| "ODT_ARCHIVE_LIMIT:Taille ODT invalide.".to_string())?;
        if total > MAX_UNCOMPRESSED_BYTES {
            return Err(
                "ODT_ARCHIVE_LIMIT:Le contenu décompressé est trop volumineux.".to_string(),
            );
        }
        if entry.size() > 1024 * 1024
            && entry.compressed_size() > 0
            && entry.size() / entry.compressed_size() > MAX_COMPRESSION_RATIO
        {
            return Err("ODT_ARCHIVE_LIMIT:Ratio de compression ODT dangereux.".to_string());
        }
    }
    Ok(())
}

pub(super) fn read_entry(
    archive: &mut zip::ZipArchive<fs::File>,
    name: &str,
    limit: u64,
) -> CommandResult<Vec<u8>> {
    let entry = archive
        .by_name(name)
        .map_err(|_| format!("ODT_ARCHIVE_INVALID:Entrée {name} introuvable."))?;
    if entry.size() > limit {
        return Err(format!(
            "ODT_ARCHIVE_LIMIT:L’entrée {name} est trop volumineuse."
        ));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > limit {
        return Err(format!(
            "ODT_ARCHIVE_LIMIT:L’entrée {name} est trop volumineuse."
        ));
    }
    Ok(bytes)
}

pub(super) fn normalize_package_path(value: &str) -> CommandResult<String> {
    let value = value.trim_start_matches("./").replace('\\', "/");
    if value.is_empty()
        || value.starts_with('/')
        || value.contains(':')
        || value.split('/').any(|part| part.is_empty() || part == "..")
    {
        return Err("ODT_PATH_TRAVERSAL:Chemin de ressource ODT invalide.".to_string());
    }
    Ok(value)
}
