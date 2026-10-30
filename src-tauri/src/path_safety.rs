use std::path::{Component, Path, PathBuf};

pub(crate) fn windows_drive_prefix(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

pub(crate) fn windows_absolute(value: &str) -> bool {
    windows_drive_prefix(value) && matches!(value.as_bytes().get(2), Some(b'/' | b'\\'))
}

pub(crate) fn resource_relative(value: &str) -> Option<PathBuf> {
    let path = Path::new(value);
    if value.is_empty()
        || value.contains(['\\', '\0'])
        || path.is_absolute()
        || windows_drive_prefix(value)
        || value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return None;
    }
    #[cfg(windows)]
    if value.contains(':') {
        return None;
    }
    Some(path.to_path_buf())
}

/// Historic Windows bundles use backslashes; interpret both separator forms
/// identically on every host, then reject ambiguous or escaping components.
pub(crate) fn archive_relative(raw: &[u8], directory: bool) -> Option<PathBuf> {
    let name = std::str::from_utf8(raw).ok()?.replace('\\', "/");
    resource_relative(if directory {
        name.strip_suffix('/').unwrap_or(&name)
    } else {
        &name
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resource_names_are_relative_and_unambiguous_on_every_host() {
        for unsafe_name in [
            "",
            "/root",
            "../root",
            "C:/root",
            "C:root",
            "C:\\root",
            "root\\file",
            "root//file",
            "root/./file",
            "root/file/",
        ] {
            assert!(resource_relative(unsafe_name).is_none(), "{unsafe_name}");
        }
        assert!(resource_relative("modèles/module/inference.json").is_some());
        assert!(!windows_absolute("folder/report:2026.pdf"));
        assert!(windows_absolute("C:/absolute"));
        assert!(windows_absolute("C:\\absolute"));
    }

    #[test]
    fn raw_archive_names_preserve_portable_separators() {
        assert_eq!(
            archive_relative(b"help/a11y-toggle.js", false),
            Some(PathBuf::from("help").join("a11y-toggle.js"))
        );
        assert_eq!(
            archive_relative(b"help/", true),
            Some(PathBuf::from("help"))
        );
        for name in [
            b"help\\..\\file".as_slice(),
            b"C:/outside",
            b"../outside",
            b"help//file",
            b"help/./file",
            b"help/\xff",
        ] {
            assert!(archive_relative(name, false).is_none());
        }
        assert_eq!(
            archive_relative(b"help\\file", false),
            archive_relative(b"help/file", false)
        );
    }
}
