use super::CommandResult;
use crate::{
    converters::{self, ConversionJob, ConversionResult},
    ocr,
};
use tauri::AppHandle;

#[tauri::command]
pub(crate) async fn start_conversion(
    app: AppHandle,
    job: ConversionJob,
) -> CommandResult<ConversionResult> {
    tauri::async_runtime::spawn_blocking(move || converters::convert(&app, job))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn cancel_conversion(
    job_id: String,
    ocr_state: tauri::State<'_, ocr::OcrState>,
) -> CommandResult<bool> {
    let conversion = converters::cancel_conversion(&job_id);
    let ocr = ocr_state.cancel(&job_id);
    Ok(conversion || ocr)
}
