use super::copy::{copy_export_file, staging_files};
use super::paths::ParsedRelativePath;
use super::source::ensure_exportable_conversion_file;
#[cfg(not(target_os = "windows"))]
use super::source::test_path_contains_link_or_reparse_point;
use super::*;
use std::{env, fs, path::PathBuf};

mod hierarchy;
mod legacy;
mod security;

pub(super) struct ManagedFixture {
    root: PathBuf,
    job: PathBuf,
}

impl ManagedFixture {
    pub(super) fn new(label: &str) -> Self {
        let root = env::temp_dir().join(format!(
            "multi-converter-export-{label}-{}",
            uuid::Uuid::new_v4()
        ));
        let job = root.join("job-1");
        fs::create_dir_all(&job).unwrap();
        Self { root, job }
    }

    pub(super) fn output(&self, name: &str, content: &str) -> PathBuf {
        let path = self.job.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&path, content).unwrap();
        path
    }

    pub(super) fn root(&self) -> &Path {
        &self.root
    }
}

impl Drop for ManagedFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

pub(super) fn entry(
    output_path: &Path,
    relative_path: &str,
    root_id: Option<&str>,
) -> ExportEntryV1 {
    ExportEntryV1 {
        output_path: output_path.to_string_lossy().to_string(),
        relative_path: relative_path.to_string(),
        root_id: root_id.map(str::to_string),
    }
}

pub(super) fn copy_entries(
    entries: &[ExportEntryV1],
    destination: &Path,
    output_dir: Option<&Path>,
) -> CommandResult<ExportResult> {
    let file_paths: Vec<String> = entries
        .iter()
        .map(|entry| entry.output_path.clone())
        .collect();
    let inferred_output_dir = entries.first().and_then(|entry| {
        Path::new(&entry.output_path)
            .parent()
            .and_then(Path::parent)
            .map(Path::to_path_buf)
    });
    let output_dir = output_dir.map(Path::to_path_buf).or(inferred_output_dir);
    copy_files_to_folder(
        &file_paths,
        destination,
        output_dir
            .as_ref()
            .map(|path| path.to_string_lossy())
            .as_deref(),
        Some(entries),
    )
}
