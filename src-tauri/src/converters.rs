use crate::engines;
use crate::process_support::{
    ProcessRunError, configure_child_process, configure_linux_portable_engine_env,
    drain_child_output, join_child_output, run_command_bounded, terminate_child_process,
};
use crate::registry::{
    get_engine, get_format_by_extension, get_format_by_id, get_targets_for_extension,
};
use crate::runtime_log;
use ::image::{ImageFormat, imageops::FilterType};
use encoding_rs::WINDOWS_1252;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock, mpsc};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;
use zip::write::SimpleFileOptions;

const LARGE_FILE_WARNING_BYTES: u64 = 256 * 1024 * 1024;
const INTEGRATED_MEMORY_LIMIT_BYTES: u64 = 512 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_INTEGRATED_IMAGE_PIXELS: u64 = 120_000_000;
const MAX_INTEGRATED_IMAGE_DIMENSION: u32 = 32_768;
const MAX_FFMPEG_PROGRESS_LOG_CHARS: usize = 64 * 1024;

mod cancellation;
mod contracts;
mod describe;
mod external;
#[path = "converters/image.rs"]
mod image_conversion;
mod media;
mod orchestrator;
mod output;
mod text;

#[cfg(test)]
mod tests;

use cancellation::{check_cancelled, clear_cancelled, is_cancelled};
use describe::gif_is_animated;
use external::{
    convert_with_libreoffice, convert_with_libvips, convert_with_pandoc, convert_with_pdfium,
};
use image_conversion::{convert_image, uses_integrated_image_pipeline};
use media::{convert_audio, convert_video};
use orchestrator::{emit_progress, system_time_to_iso};
use text::{
    ExternalDocumentFallbackContext, convert_external_document_with_text_fallback,
    convert_text_document, ensure_integrated_memory_budget,
};

pub use cancellation::cancel_conversion;
pub use contracts::{
    ConversionJob, ConversionResult, ConvertError, FileDescription, FileWarning, ProgressPayload,
    Result,
};
pub use describe::describe_file_with_app;
pub use orchestrator::convert;

pub(crate) use external::{
    ExternalCommandProgress, engine_command, engine_path, run_external_command_with_progress,
};
pub(crate) use orchestrator::convert_office_document_strict;

pub(crate) fn available_output_path(
    input_path: &Path,
    output_dir: &Path,
    target_extension: &str,
) -> PathBuf {
    output::available_output_path(input_path, output_dir, target_extension)
}

#[cfg(test)]
use external::*;
#[cfg(test)]
use image_conversion::*;
#[cfg(test)]
use media::*;
#[cfg(test)]
use orchestrator::*;
#[cfg(test)]
use output::*;
#[cfg(test)]
use text::*;
