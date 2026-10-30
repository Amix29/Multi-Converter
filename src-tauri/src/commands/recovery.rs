mod storage;
#[cfg(test)]
mod tests;

use super::CommandResult;
use crate::converters::{ImportOriginV1, MediaMode, QualityProfile};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

static RECOVERY_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RecoveryFile {
    path: String,
    target_format: String,
    media_mode: MediaMode,
    import_origin: Option<ImportOriginV1>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RecoveryPlan {
    schema_version: u32,
    quality_profile: QualityProfile,
    files: Vec<RecoveryFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveryState {
    enabled: bool,
    plan: Option<RecoveryPlan>,
    skipped_files: usize,
}

fn root(app: &AppHandle) -> CommandResult<PathBuf> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("batch-recovery"))
        .map_err(|_| "Stockage de reprise indisponible.".to_string())
}

async fn locked<T: Send + 'static>(
    app: AppHandle,
    action: impl FnOnce(&Path) -> CommandResult<T> + Send + 'static,
) -> CommandResult<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = RECOVERY_LOCK
            .lock()
            .map_err(|_| "Stockage de reprise indisponible.".to_string())?;
        action(&root(&app)?)
    })
    .await
    .map_err(|_| "Reprise interrompue.".to_string())?
}

#[tauri::command]
pub(crate) async fn load_batch_recovery(app: AppHandle) -> CommandResult<RecoveryState> {
    locked(app, storage::load).await
}

#[tauri::command]
pub(crate) async fn set_batch_recovery_enabled(
    app: AppHandle,
    enabled: bool,
) -> CommandResult<RecoveryState> {
    locked(app, move |root| storage::set_enabled(root, enabled)).await
}

#[tauri::command]
pub(crate) async fn save_batch_recovery(
    app: AppHandle,
    plan: RecoveryPlan,
) -> CommandResult<usize> {
    locked(app, move |root| storage::save(root, plan)).await
}

#[tauri::command]
pub(crate) async fn clear_batch_recovery(app: AppHandle) -> CommandResult<bool> {
    locked(app, storage::clear).await
}
