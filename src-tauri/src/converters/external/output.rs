use super::*;

pub(in crate::converters) fn move_external_output(
    input_path: &Path,
    out_dir: &Path,
    output_path: &Path,
    target_format: &str,
) -> Result<()> {
    let source_stem = input_path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("conversion");
    let expected_extension = if target_format == "jpg" {
        "jpeg"
    } else {
        target_format
    };
    let mut candidates = fs::read_dir(out_dir)?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.file_stem()
                .and_then(OsStr::to_str)
                .is_some_and(|stem| stem.eq_ignore_ascii_case(source_stem))
                && path
                    .extension()
                    .and_then(OsStr::to_str)
                    .is_some_and(|extension| {
                        extension.eq_ignore_ascii_case(target_format)
                            || extension.eq_ignore_ascii_case(expected_extension)
                    })
        })
        .collect::<Vec<_>>();
    candidates.sort();
    let produced = match candidates.as_slice() {
        [produced] => produced,
        [] => {
            return Err(ConvertError::Message(
                "Le moteur externe n'a pas produit le fichier attendu.".to_string(),
            ));
        }
        _ => {
            return Err(ConvertError::Message(
                "Le moteur externe a produit plusieurs sorties ambiguës.".to_string(),
            ));
        }
    };
    if paths_equal(produced, output_path) {
        return Ok(());
    }
    if output_path.exists() {
        fs::remove_file(output_path)?;
    }
    fs::rename(produced, output_path)?;
    Ok(())
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

pub(in crate::converters) fn path_to_file_url(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let with_slash = if raw.starts_with('/') {
        raw
    } else {
        format!("/{raw}")
    };
    format!("file://{}", percent_encode_url_path(&with_slash))
}

fn percent_encode_url_path(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b':' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            other => format!("%{other:02X}").chars().collect(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ambiguous_external_outputs_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let input = directory.path().join("source.pdf");
        let output = directory.path().join("result.jpg");
        fs::write(directory.path().join("source.jpg"), "one").unwrap();
        fs::write(directory.path().join("source.jpeg"), "two").unwrap();

        let error = move_external_output(&input, directory.path(), &output, "jpg").unwrap_err();

        assert!(error.to_string().contains("plusieurs sorties ambiguës"));
        assert!(!output.exists());
    }
}
