use super::CommandResult;
use crate::converters::{self, ImportedFileDescription};
use tauri::AppHandle;

mod expansion;

#[tauri::command]
pub(crate) async fn describe_paths(
    app: AppHandle,
    paths: Vec<String>,
) -> CommandResult<Vec<ImportedFileDescription>> {
    tauri::async_runtime::spawn_blocking(move || {
        expansion::expand_file_paths(&paths)?
            .files
            .into_iter()
            .map(|expanded| {
                let mut description =
                    converters::describe_file_with_app(Some(&app), &expanded.path)
                        .map_err(|error| error.to_string())?;
                if expanded.partial_import {
                    description.warnings.push(converters::FileWarning {
                        code: "partialFolderImport",
                        severity: "warning",
                        limit_bytes: None,
                    });
                }
                Ok(ImportedFileDescription {
                    description,
                    import_origin: Some(expanded.import_origin),
                })
            })
            .collect()
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
