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

use commands::*;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Multi-Converter");
}
