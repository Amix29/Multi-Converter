mod commands;
mod converters;
mod editor;
mod editor_fonts;
mod engine_archive;
mod engine_distribution;
mod engines;
mod ocr;
mod pdf_editor;
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
        .manage(editor::GeneratedWriteState::default())
        .manage(pdf_editor::PdfEditorState::default())
        .setup(|_| {
            runtime_log::write("startup", "Multi-Converter starting");
            cleanup_stale_temp_output_folders();
            cleanup_stale_clipboard_folders();
            if let Err(error) = editor::cleanup_stale_generated_writes() {
                runtime_log::write(
                    "cleanup",
                    &format!("generated document cleanup failed: {error}"),
                );
            }
            if let Err(error) = engine_distribution::cleanup_stale_installing_dirs() {
                runtime_log::write("cleanup", &format!("engine cleanup failed: {error}"));
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
            pdf_editor::pdf_editor_open,
            pdf_editor::pdf_editor_inspect_pages,
            pdf_editor::pdf_editor_render_page,
            pdf_editor::pdf_editor_recognize_page,
            pdf_editor::digitize::pdf_editor_digitize,
            pdf_editor::pdf_editor_save_as,
            pdf_editor::editable_copy::pdf_editor_create_editable_copy,
            pdf_editor::pdf_editor_close,
            reveal_file,
            open_external_url,
            export_to_downloads,
            export_to_folder,
            editor::editor_create_document,
            editor::editor_list_recent_documents,
            editor::editor_load_document,
            editor::editor_save_draft,
            editor::editor_delete_draft,
            editor::editor_rename_document,
            editor::editor_duplicate_document,
            editor::editor_import_document,
            editor::editor_save_document,
            editor::editor_save_as,
            editor::editor_export_document,
            editor::generated_write::editor_begin_generated_write,
            editor::generated_write::editor_append_generated_write,
            editor::generated_write::editor_commit_generated_write,
            editor::generated_write::editor_abort_generated_write,
            editor::editor_read_asset,
            editor::editor_store_asset,
            editor::editor_import_asset,
            editor::editor_remove_asset,
            editor::editor_prune_assets,
            editor_fonts::editor_list_system_fonts,
            editor_fonts::editor_inspect_font_embedding,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Multi-Converter");
}
