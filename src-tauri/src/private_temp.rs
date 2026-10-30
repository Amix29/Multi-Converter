//! User document intermediates must not inherit a world-readable Unix umask.
pub(crate) fn builder(prefix: &str) -> tempfile::Builder<'_, '_> {
    let mut builder = tempfile::Builder::new();
    builder.prefix(prefix);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        builder.permissions(std::fs::Permissions::from_mode(0o700));
    }
    builder
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn both_global_and_nested_temporary_directories_are_private() {
        let parent = builder("multi-converter-private-test-").tempdir().unwrap();
        let child = builder(".private-test-").tempdir_in(parent.path()).unwrap();
        for directory in [parent.path(), child.path()] {
            assert_eq!(
                std::fs::metadata(directory).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
    }
}
