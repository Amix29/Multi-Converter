use super::*;
use std::io::{Read, Seek, SeekFrom};

const MAX_TEXT_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_TEXT_ARCHIVE_UNCOMPRESSED_BYTES: u64 = 512 * 1024 * 1024;
const MAX_TEXT_ARCHIVE_COMPRESSION_RATIO: u64 = 100;
const MIN_RATIO_CHECK_BYTES: u64 = 1024 * 1024;
const MAX_ARCHIVE_ENTRY_NAME_BYTES: usize = 1024;
const EOCD_MIN_BYTES: usize = 22;
const EOCD_MAX_COMMENT_BYTES: usize = u16::MAX as usize;

#[derive(Clone, Copy)]
pub(super) struct TextArchiveLimits {
    entries: usize,
    uncompressed_bytes: u64,
    compression_ratio: u64,
    ratio_check_bytes: u64,
}

pub(super) const TEXT_ARCHIVE_LIMITS: TextArchiveLimits = TextArchiveLimits {
    entries: MAX_TEXT_ARCHIVE_ENTRIES,
    uncompressed_bytes: MAX_TEXT_ARCHIVE_UNCOMPRESSED_BYTES,
    compression_ratio: MAX_TEXT_ARCHIVE_COMPRESSION_RATIO,
    ratio_check_bytes: MIN_RATIO_CHECK_BYTES,
};

pub(super) fn open_validated_text_archive(
    input_path: &Path,
    label: &str,
    case_insensitive_names: bool,
    limits: TextArchiveLimits,
) -> Result<zip::ZipArchive<File>> {
    preflight_archive_entry_count(input_path, label, limits.entries)?;
    let file = File::open(input_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    validate_text_archive(&mut archive, label, case_insensitive_names, limits)?;
    Ok(archive)
}

fn preflight_archive_entry_count(input_path: &Path, label: &str, max_entries: usize) -> Result<()> {
    let mut file = File::open(input_path)?;
    let file_len = file.metadata()?.len();
    if file_len < EOCD_MIN_BYTES as u64 {
        return Err(invalid_archive_error(label));
    }

    let tail_len = file_len.min((EOCD_MIN_BYTES + EOCD_MAX_COMMENT_BYTES) as u64) as usize;
    file.seek(SeekFrom::End(-(tail_len as i64)))?;
    let mut tail = vec![0u8; tail_len];
    file.read_exact(&mut tail)?;
    let eocd_offset = (0..=tail_len - EOCD_MIN_BYTES)
        .rev()
        .find(|offset| {
            tail[*offset..].starts_with(&[0x50, 0x4b, 0x05, 0x06])
                && read_u16(&tail, *offset + 20).is_some_and(|comment_len| {
                    *offset + EOCD_MIN_BYTES + comment_len as usize == tail_len
                })
        })
        .ok_or_else(|| invalid_archive_error(label))?;
    let absolute_eocd_offset = file_len - tail_len as u64 + eocd_offset as u64;
    let disk_number = read_u16(&tail, eocd_offset + 4).unwrap_or(u16::MAX);
    let central_directory_disk = read_u16(&tail, eocd_offset + 6).unwrap_or(u16::MAX);
    let entries_on_disk = read_u16(&tail, eocd_offset + 8).unwrap_or(u16::MAX);
    let total_entries = read_u16(&tail, eocd_offset + 10).unwrap_or(u16::MAX);
    let uses_zip64 = entries_on_disk == u16::MAX || total_entries == u16::MAX;

    let entry_count = if uses_zip64 {
        read_zip64_entry_count(&mut file, absolute_eocd_offset, label)?
    } else {
        if disk_number != 0 || central_directory_disk != 0 || entries_on_disk != total_entries {
            return Err(ConvertError::Message(format!(
                "Le fichier {label} utilise une archive ZIP répartie non prise en charge."
            )));
        }
        u64::from(total_entries)
    };

    if entry_count > max_entries as u64 {
        return Err(ConvertError::Message(format!(
            "Le fichier {label} contient trop d’entrées pour le moteur intégré actuel."
        )));
    }
    Ok(())
}

fn read_zip64_entry_count(file: &mut File, eocd_offset: u64, label: &str) -> Result<u64> {
    const LOCATOR_BYTES: u64 = 20;
    if eocd_offset < LOCATOR_BYTES {
        return Err(invalid_archive_error(label));
    }
    file.seek(SeekFrom::Start(eocd_offset - LOCATOR_BYTES))?;
    let mut locator = [0u8; LOCATOR_BYTES as usize];
    file.read_exact(&mut locator)?;
    if !locator.starts_with(&[0x50, 0x4b, 0x06, 0x07])
        || read_u32(&locator, 4) != Some(0)
        || read_u32(&locator, 16) != Some(1)
    {
        return Err(invalid_archive_error(label));
    }

    let zip64_offset = read_u64(&locator, 8).ok_or_else(|| invalid_archive_error(label))?;
    file.seek(SeekFrom::Start(zip64_offset))?;
    let mut record = [0u8; 56];
    file.read_exact(&mut record)?;
    if !record.starts_with(&[0x50, 0x4b, 0x06, 0x06])
        || read_u64(&record, 4).is_none_or(|size| size < 44)
        || read_u32(&record, 16) != Some(0)
        || read_u32(&record, 20) != Some(0)
    {
        return Err(invalid_archive_error(label));
    }
    let entries_on_disk = read_u64(&record, 24).ok_or_else(|| invalid_archive_error(label))?;
    let total_entries = read_u64(&record, 32).ok_or_else(|| invalid_archive_error(label))?;
    if entries_on_disk != total_entries {
        return Err(invalid_archive_error(label));
    }
    Ok(total_entries)
}

fn validate_text_archive(
    archive: &mut zip::ZipArchive<File>,
    label: &str,
    case_insensitive_names: bool,
    limits: TextArchiveLimits,
) -> Result<()> {
    if archive.len() > limits.entries {
        return Err(ConvertError::Message(format!(
            "Le fichier {label} contient trop d’entrées pour le moteur intégré actuel."
        )));
    }

    let mut names = HashSet::with_capacity(archive.len());
    let mut total_uncompressed = 0u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let normalized_name = normalize_text_archive_entry_name(entry.name(), label)?;
        let identity = if case_insensitive_names {
            normalized_name.to_ascii_lowercase()
        } else {
            normalized_name
        };
        if !names.insert(identity) {
            return Err(ConvertError::Message(format!(
                "Le fichier {label} contient des entrées ambiguës ou dupliquées."
            )));
        }

        total_uncompressed = total_uncompressed
            .checked_add(entry.size())
            .ok_or_else(|| archive_size_error(label))?;
        if total_uncompressed > limits.uncompressed_bytes {
            return Err(archive_size_error(label));
        }

        let compressed_size = entry.compressed_size();
        if entry.size() > limits.ratio_check_bytes
            && (compressed_size == 0
                || entry.size() > compressed_size.saturating_mul(limits.compression_ratio))
        {
            return Err(ConvertError::Message(format!(
                "Le ratio de compression du fichier {label} dépasse la limite de sécurité."
            )));
        }
    }
    Ok(())
}

fn normalize_text_archive_entry_name(name: &str, label: &str) -> Result<String> {
    let normalized = name.replace('\\', "/");
    let normalized = normalized.trim_end_matches('/');
    if normalized.is_empty()
        || normalized.len() > MAX_ARCHIVE_ENTRY_NAME_BYTES
        || normalized.starts_with('/')
        || normalized.contains('\0')
        || normalized
            .as_bytes()
            .get(1)
            .is_some_and(|byte| *byte == b':')
        || normalized
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(ConvertError::Message(format!(
            "Le fichier {label} contient un nom d’entrée d’archive invalide."
        )));
    }
    Ok(normalized.to_string())
}

fn archive_size_error(label: &str) -> ConvertError {
    ConvertError::Message(format!(
        "Le contenu décompressé du fichier {label} est trop volumineux pour le moteur intégré actuel."
    ))
}

fn invalid_archive_error(label: &str) -> ConvertError {
    ConvertError::Message(format!(
        "Le fichier {label} contient une archive ZIP invalide."
    ))
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_le_bytes(
        bytes.get(offset..offset + 2)?.try_into().ok()?,
    ))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes(
        bytes.get(offset..offset + 4)?.try_into().ok()?,
    ))
}

fn read_u64(bytes: &[u8], offset: usize) -> Option<u64> {
    Some(u64::from_le_bytes(
        bytes.get(offset..offset + 8)?.try_into().ok()?,
    ))
}

#[cfg(test)]
pub(in crate::converters) fn validate_text_archive_limits_for_test(
    input_path: &Path,
    max_entries: usize,
    max_uncompressed_bytes: u64,
    ratio_check_bytes: u64,
    max_compression_ratio: u64,
) -> Result<()> {
    open_validated_text_archive(
        input_path,
        "test",
        false,
        TextArchiveLimits {
            entries: max_entries,
            uncompressed_bytes: max_uncompressed_bytes,
            compression_ratio: max_compression_ratio,
            ratio_check_bytes,
        },
    )
    .map(|_| ())
}
