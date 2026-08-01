use super::*;

pub fn describe_file_with_app(
    app: Option<&AppHandle>,
    file_path: impl AsRef<Path>,
) -> Result<FileDescription> {
    let file_path = file_path.as_ref();
    let stat = fs::metadata(file_path)?;
    let extension = file_path
        .extension()
        .and_then(OsStr::to_str)
        .map(|value| format!(".{}", value.to_ascii_lowercase()))
        .unwrap_or_default();
    let source_format = get_format_by_extension(&extension);
    let modified_at = stat
        .modified()
        .ok()
        .and_then(system_time_to_iso)
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());

    let animated_gif = source_format
        .as_ref()
        .is_some_and(|format| format.id == "gif")
        && gif_is_animated(file_path).unwrap_or(false);
    let display_category = if animated_gif {
        "Vidéo".to_string()
    } else {
        source_format
            .as_ref()
            .map(|item| item.category.to_string())
            .unwrap_or_else(|| "Inconnu".to_string())
    };
    let display_category_id = if animated_gif {
        "video".to_string()
    } else {
        source_format
            .as_ref()
            .map(|item| item.category_id.to_string())
            .unwrap_or_else(|| "unknown".to_string())
    };

    Ok(FileDescription {
        path: file_path.to_string_lossy().to_string(),
        name: file_path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("fichier")
            .to_string(),
        base_name: file_path
            .file_stem()
            .and_then(OsStr::to_str)
            .unwrap_or("fichier")
            .to_string(),
        extension: extension.clone(),
        category: display_category,
        category_id: display_category_id,
        source_format: source_format.as_ref().map(|item| item.id.to_string()),
        directory: file_path
            .parent()
            .map(|item| item.to_string_lossy().to_string())
            .unwrap_or_default(),
        size: stat.len(),
        modified_at,
        warnings: file_warnings(
            stat.len(),
            source_format.as_ref().map(|item| item.category_id),
        ),
        targets: source_format
            .as_ref()
            .map(|source| {
                get_targets_for_extension(&extension)
                    .into_iter()
                    .filter(|target| {
                        source.id != "gif"
                            || if animated_gif {
                                target.category_id == "video"
                            } else {
                                target.category_id == "images"
                            }
                    })
                    .map(|target| engines::decorate_target(app, source, target))
                    .collect()
            })
            .unwrap_or_default(),
    })
}

fn file_warnings(size: u64, category_id: Option<&str>) -> Vec<FileWarning> {
    let mut warnings = Vec::new();
    if size >= LARGE_FILE_WARNING_BYTES {
        warnings.push(FileWarning {
            code: "largeFile",
            severity: "warning",
            limit_bytes: Some(LARGE_FILE_WARNING_BYTES),
        });
    }
    if matches!(category_id, Some("documents" | "images")) && size >= INTEGRATED_MEMORY_LIMIT_BYTES
    {
        warnings.push(FileWarning {
            code: "memoryIntensive",
            severity: "warning",
            limit_bytes: Some(INTEGRATED_MEMORY_LIMIT_BYTES),
        });
    }
    warnings
}

pub(super) fn gif_is_animated(path: &Path) -> Result<bool> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut header = [0u8; 13];
    if reader.read_exact(&mut header).is_err() {
        return Ok(false);
    }
    if !header.starts_with(b"GIF87a") && !header.starts_with(b"GIF89a") {
        return Ok(false);
    }
    let packed = header[10];
    let global_color_table = packed & 0b1000_0000 != 0;
    if global_color_table {
        let size = 3usize * (1usize << (((packed & 0b0000_0111) as usize) + 1));
        if skip_bytes(&mut reader, size).is_err() {
            return Ok(false);
        }
    }

    let mut image_count = 0usize;
    let mut marker = [0u8; 1];
    while reader.read_exact(&mut marker).is_ok() {
        match marker[0] {
            0x2C => {
                image_count += 1;
                if image_count > 1 {
                    return Ok(true);
                }

                let mut descriptor = [0u8; 9];
                if reader.read_exact(&mut descriptor).is_err() {
                    return Ok(false);
                }
                let image_packed = descriptor[8];
                if image_packed & 0b1000_0000 != 0 {
                    let size = 3usize * (1usize << (((image_packed & 0b0000_0111) as usize) + 1));
                    if skip_bytes(&mut reader, size).is_err() {
                        return Ok(false);
                    }
                }

                if skip_bytes(&mut reader, 1).is_err() || skip_gif_sub_blocks(&mut reader).is_err()
                {
                    return Ok(false);
                }
            }
            0x21 => {
                if skip_bytes(&mut reader, 1).is_err() || skip_gif_sub_blocks(&mut reader).is_err()
                {
                    return Ok(false);
                }
            }
            0x3B => return Ok(false),
            _ => return Ok(false),
        }
    }
    Ok(false)
}

fn skip_gif_sub_blocks(reader: &mut impl Read) -> std::io::Result<()> {
    let mut size = [0u8; 1];
    loop {
        reader.read_exact(&mut size)?;
        let size = size[0] as usize;
        if size == 0 {
            break;
        }
        skip_bytes(reader, size)?;
    }
    Ok(())
}

fn skip_bytes(reader: &mut impl Read, mut remaining: usize) -> std::io::Result<()> {
    let mut buffer = [0u8; 4096];
    while remaining > 0 {
        let count = remaining.min(buffer.len());
        reader.read_exact(&mut buffer[..count])?;
        remaining -= count;
    }
    Ok(())
}
