use super::super::document::CommandResult;
use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::{Component, Path};

const ENTRY_COUNT_LIMIT: usize = 4_096;
const UNCOMPRESSED_LIMIT: u64 = 512 * 1024 * 1024;
const ENTRY_LIMIT: u64 = 128 * 1024 * 1024;
const COMPRESSION_RATIO_LIMIT: u64 = 200;
const XML_DEPTH_LIMIT: usize = 512;
const XML_EVENT_LIMIT: usize = 2_000_000;

pub(super) fn validate_docx_archive<F>(path: &Path, mut checkpoint: F) -> CommandResult<()>
where
    F: FnMut() -> CommandResult<()>,
{
    checkpoint()?;
    let file = File::open(path).map_err(|error| format!("EDITOR_DOCX_INVALID:{error}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("EDITOR_DOCX_INVALID:{error}"))?;
    if archive.len() > ENTRY_COUNT_LIMIT {
        return Err("EDITOR_DOCX_INVALID:Trop d’entrées dans le DOCX.".to_string());
    }
    let mut content_types = false;
    let mut document_xml = false;
    let mut names = HashSet::with_capacity(archive.len());
    let mut total_uncompressed = 0_u64;
    for index in 0..archive.len() {
        checkpoint()?;
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("EDITOR_DOCX_INVALID:{error}"))?;
        let name = entry.name().to_string();
        validate_entry_name(&name)?;
        if !names.insert(name.clone()) {
            return Err("EDITOR_DOCX_INVALID:Entrée DOCX dupliquée.".to_string());
        }
        let size = entry.size();
        if size > ENTRY_LIMIT {
            return Err("EDITOR_DOCX_INVALID:Entrée DOCX trop volumineuse.".to_string());
        }
        total_uncompressed = total_uncompressed
            .checked_add(size)
            .ok_or_else(|| "EDITOR_DOCX_INVALID:Taille DOCX débordante.".to_string())?;
        if total_uncompressed > UNCOMPRESSED_LIMIT {
            return Err("EDITOR_DOCX_INVALID:DOCX décompressé trop volumineux.".to_string());
        }
        validate_compression_ratio(size, entry.compressed_size())?;
        let bytes = read_entry(&mut entry, size, &mut checkpoint)?;
        if name.ends_with(".xml") || name.ends_with(".rels") {
            validate_ooxml_part(&name, &bytes, &mut checkpoint)?;
        }
        content_types |= name == "[Content_Types].xml";
        document_xml |= name == "word/document.xml";
    }
    if !content_types || !document_xml {
        return Err("EDITOR_DOCX_INVALID:Structure OOXML incomplète.".to_string());
    }
    Ok(())
}

fn read_entry<R, F>(entry: &mut R, size: u64, checkpoint: &mut F) -> CommandResult<Vec<u8>>
where
    R: Read,
    F: FnMut() -> CommandResult<()>,
{
    let mut bytes = Vec::with_capacity(size as usize);
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        checkpoint()?;
        let read = entry
            .read(&mut buffer)
            .map_err(|error| format!("EDITOR_DOCX_INVALID:{error}"))?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read]);
    }
    if bytes.len() as u64 != size {
        return Err("EDITOR_DOCX_INVALID:Entrée DOCX tronquée.".to_string());
    }
    Ok(bytes)
}

fn validate_entry_name(name: &str) -> CommandResult<()> {
    if Path::new(name).is_absolute()
        || name.contains('\\')
        || name.contains("//")
        || Path::new(name)
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
    {
        return Err("EDITOR_DOCX_INVALID:Chemin d’archive DOCX dangereux.".to_string());
    }
    Ok(())
}

fn validate_compression_ratio(size: u64, compressed_size: u64) -> CommandResult<()> {
    if size > 1024 * 1024
        && (compressed_size == 0 || size / compressed_size.max(1) > COMPRESSION_RATIO_LIMIT)
    {
        return Err("EDITOR_DOCX_INVALID:Ratio de compression DOCX dangereux.".to_string());
    }
    Ok(())
}

fn validate_ooxml_part<F>(name: &str, bytes: &[u8], checkpoint: &mut F) -> CommandResult<()>
where
    F: FnMut() -> CommandResult<()>,
{
    let mut reader = quick_xml::Reader::from_reader(bytes);
    reader.config_mut().enable_all_checks(true);
    let mut buffer = Vec::new();
    let mut depth = 0_usize;
    let mut roots = 0_usize;
    let mut events = 0_usize;
    loop {
        events += 1;
        if events == 1 || events.is_multiple_of(256) {
            checkpoint()?;
        }
        if events > XML_EVENT_LIMIT {
            return Err(format!(
                "EDITOR_DOCX_INVALID:XML OOXML trop complexe ({name})."
            ));
        }
        match reader.read_event_into(&mut buffer) {
            Ok(quick_xml::events::Event::Start(_)) => {
                if depth == 0 {
                    roots += 1;
                }
                depth += 1;
                if depth > XML_DEPTH_LIMIT {
                    return Err(format!(
                        "EDITOR_DOCX_INVALID:XML OOXML trop profond ({name})."
                    ));
                }
            }
            Ok(quick_xml::events::Event::Empty(_)) if depth == 0 => roots += 1,
            Ok(quick_xml::events::Event::End(_)) => {
                depth = depth.checked_sub(1).ok_or_else(|| {
                    format!("EDITOR_DOCX_INVALID:XML OOXML déséquilibré ({name}).")
                })?;
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(error) => {
                return Err(format!(
                    "EDITOR_DOCX_INVALID:XML OOXML invalide ({name}):{error}"
                ));
            }
            _ => {}
        }
        buffer.clear();
    }
    if depth != 0 || roots != 1 {
        return Err(format!(
            "EDITOR_DOCX_INVALID:XML OOXML incomplet ou ambigu ({name})."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    #[test]
    fn archive_validation_requires_real_ooxml_parts() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("invalid.docx");
        std::fs::write(&path, b"PKnot-an-archive").unwrap();
        assert!(validate_docx_archive(&path, || Ok(())).is_err());
    }

    #[test]
    fn archive_validation_rejects_invalid_ooxml_xml() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("invalid-xml.docx");
        write_fixture(&path, b"<Types></Broken>", b"<document/>");
        assert!(validate_docx_archive(&path, || Ok(())).is_err());
    }

    #[test]
    fn archive_validation_accepts_minimal_well_formed_ooxml() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("valid.docx");
        write_fixture(&path, b"<Types/>", b"<document/>");
        assert!(validate_docx_archive(&path, || Ok(())).is_ok());
    }

    #[test]
    fn archive_validation_honors_cancellation_during_entry_reading() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("canceled.docx");
        write_fixture(&path, b"<Types/>", b"<document><body/></document>");
        let mut checkpoints = 0_u8;

        let error = validate_docx_archive(&path, || {
            checkpoints += 1;
            if checkpoints >= 4 {
                Err("EDITOR_GENERATED_CANCELLED:test".to_string())
            } else {
                Ok(())
            }
        })
        .unwrap_err();

        assert_eq!(error, "EDITOR_GENERATED_CANCELLED:test");
    }

    fn write_fixture(path: &Path, content_types: &[u8], document: &[u8]) {
        let file = File::create(path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        writer.start_file("[Content_Types].xml", options).unwrap();
        writer.write_all(content_types).unwrap();
        writer.start_file("word/document.xml", options).unwrap();
        writer.write_all(document).unwrap();
        writer.finish().unwrap();
    }
}
