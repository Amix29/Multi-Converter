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
    // Register before yielding to the blocking pool so an immediate UI cancel
    // cannot race ahead of native job activation.
    let registration = converters::begin_conversion(&job.id).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        converters::convert_registered(&app, job, registration)
    })
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
