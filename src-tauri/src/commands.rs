mod clipboard;
mod conversion;
mod engines;
mod export;
mod files;
mod system;
mod temp_output;
mod welcome;

type CommandResult<T> = std::result::Result<T, String>;

pub(crate) use clipboard::{cleanup_stale_clipboard_folders, save_clipboard_files};
pub(crate) use conversion::{cancel_conversion, start_conversion};
pub(crate) use engines::{bootstrap_dependencies, engine_statuses};
pub(crate) use export::{export_to_downloads, export_to_folder};
pub(crate) use files::{describe_paths, pick_file_paths, pick_output_folder};
pub(crate) use system::{open_external_url, reveal_file};
use temp_output::is_managed_temp_output_folder;
pub(crate) use temp_output::{
    cleanup_stale_temp_output_folders, cleanup_temp_output_folder, create_temp_output_folder,
};
pub(crate) use welcome::{mark_welcome_seen, welcome_state};
