mod contracts;
mod normalize;
pub(crate) mod pdf;
mod pdf_image;
mod runtime;
mod runtime_archive;
mod supervisor;
mod validation;

pub use contracts::{OcrDocumentResultV1, OcrRuntimeInfoV1};
pub use supervisor::OcrState;

use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_ocr_runtime_info(app: AppHandle) -> Result<OcrRuntimeInfoV1, String> {
    runtime::runtime_info(&app)
}

#[tauri::command]
pub async fn recognize_image(
    app: AppHandle,
    state: State<'_, OcrState>,
    path: String,
    job_id: String,
) -> Result<OcrDocumentResultV1, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.recognize_image(&app, &path, &job_id))
        .await
        .map_err(|error| format!("OCR_TASK_FAILED:{error}"))?
}

#[tauri::command]
pub fn cancel_ocr(state: State<'_, OcrState>, job_id: String) -> bool {
    state.cancel(&job_id)
}
