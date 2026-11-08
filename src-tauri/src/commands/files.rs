use super::CommandResult;
use crate::converters::{self, ImportBatchResult, ImportRejection, ImportedFileDescription};
use tauri::AppHandle;

mod expansion;

#[tauri::command]
pub(crate) async fn describe_paths(
    app: AppHandle,
    paths: Vec<String>,
) -> CommandResult<ImportBatchResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let expanded_paths = expansion::expand_file_paths(&paths)?;
        let mut rejected = expanded_paths.rejected;
        let mut files = Vec::new();
        let mut unsupported_count = expanded_paths.unsupported_count;
        let mut checks = crate::engines::EngineChecks::new(Some(&app));
        for expanded in expanded_paths.files {
            let mut description = match converters::describe_for_import(&mut checks, &expanded.path)
            {
                Ok(description) => description,
                Err(error) => {
                    rejected.push(ImportRejection {
                        path: expanded.path.to_string_lossy().to_string(),
                        message: error.to_string(),
                    });
                    continue;
                }
            };
            if !description
                .targets
                .iter()
                .any(|target| target.engine_available && target.availability == "available")
            {
                unsupported_count += 1;
                continue;
            }
            if expanded.partial_import {
                description.warnings.push(converters::FileWarning {
                    code: "partialFolderImport",
                    severity: "warning",
                    limit_bytes: None,
                });
            }
            files.push(ImportedFileDescription {
                description,
                import_origin: Some(expanded.import_origin),
            });
        }
        Ok(ImportBatchResult {
            files,
            rejected,
            unsupported_count,
            truncated: expanded_paths.partial_import,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn pick_file_paths() -> CommandResult<Vec<String>> {
    let handles = rfd::AsyncFileDialog::new()
        .set_title("Choisir des fichiers")
        .pick_files()
        .await
        .unwrap_or_default();

    Ok(handles
        .into_iter()
        .map(|handle| handle.path().to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub(crate) async fn pick_output_folder() -> CommandResult<Option<String>> {
    Ok(rfd::AsyncFileDialog::new()
        .set_title("Choisir le dossier de sortie")
        .pick_folder()
        .await
        .map(|handle| handle.path().to_string_lossy().to_string()))
}
