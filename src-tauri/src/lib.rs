#[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
compile_error!("Multi-Converter supports macOS on Apple Silicon (aarch64) only.");

mod commands;
mod converters;
mod engine_archive;
mod engine_distribution;
mod engines;
mod ocr;
mod path_safety;
mod private_temp;
mod process_support;
mod registry;
mod runtime_log;
mod window_theme;

use commands::*;

// Only the opt-in native test binary needs access to these desktop entry points.
#[cfg(feature = "native-format-tests")]
pub mod format_test_api {
    pub use crate::converters::describe_file_with_app;
    pub use crate::engines::resolve_tool;
    pub use crate::ocr::OcrState;
    pub use crate::registry::formats;

    pub async fn convert(
        app: tauri::AppHandle,
        job: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let job = serde_json::from_value(job).map_err(|e| e.to_string())?;
        let result = crate::commands::start_conversion(app, job).await?;
        serde_json::to_value(result).map_err(|e| e.to_string())
    }
}

pub fn run() {
    runtime_log::install_panic_hook();
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ocr::OcrState::default())
        .setup(|_| {
            runtime_log::write("startup", "Multi-Converter starting");
            cleanup_stale_temp_output_folders();
            cleanup_stale_clipboard_folders();
            if engine_distribution::cleanup_stale_installing_dirs().is_err() {
                runtime_log::write("cleanup", "engine cleanup failed");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            welcome_state,
            mark_welcome_seen,
            pick_file_paths,
            describe_paths,
            save_clipboard_files,
            pick_output_folder,
            create_temp_output_folder,
            cleanup_temp_output_folder,
            bootstrap_dependencies,
            engine_statuses,
            start_conversion,
            cancel_conversion,
            ocr::get_ocr_runtime_info,
            ocr::recognize_image,
            ocr::cancel_ocr,
            reveal_file,
            open_external_url,
            export_to_downloads,
            export_to_folder,
            export_batch_report,
            load_batch_recovery,
            set_batch_recovery_enabled,
            save_batch_recovery,
            clear_batch_recovery,
            window_theme::sync_window_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Multi-Converter");
}
