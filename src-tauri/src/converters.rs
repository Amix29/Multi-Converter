use crate::engines;
use crate::registry::{
    get_engine, get_format_by_extension, get_format_by_id, get_targets_for_extension,
};
use crate::runtime_log;
use encoding_rs::WINDOWS_1252;
use image::{ImageFormat, imageops::FilterType};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock, mpsc};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use zip::write::SimpleFileOptions;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const LARGE_FILE_WARNING_BYTES: u64 = 256 * 1024 * 1024;
const INTEGRATED_MEMORY_LIMIT_BYTES: u64 = 512 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_INTEGRATED_IMAGE_PIXELS: u64 = 120_000_000;
const MAX_INTEGRATED_IMAGE_DIMENSION: u32 = 32_768;
const MAX_ENGINE_OUTPUT_BYTES: usize = 128 * 1024;
const MAX_FFMPEG_PROGRESS_LOG_CHARS: usize = 64 * 1024;

#[derive(Debug, Error)]
pub enum ConvertError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Image(#[from] image::ImageError),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Csv(#[from] csv::Error),
}

pub type Result<T> = std::result::Result<T, ConvertError>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDescription {
    pub path: String,
    pub name: String,
    pub base_name: String,
    pub extension: String,
    pub category: String,
    pub category_id: String,
    pub source_format: Option<String>,
    pub directory: String,
    pub size: u64,
    pub modified_at: String,
    pub warnings: Vec<FileWarning>,
    pub targets: Vec<crate::registry::TargetFormat>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWarning {
    pub code: &'static str,
    pub severity: &'static str,
    pub limit_bytes: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionJob {
    pub id: String,
    pub input_path: String,
    pub target_format: String,
    pub output_dir: Option<String>,
    pub batch_concurrency: Option<usize>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionResult {
    pub output_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub job_id: String,
    pub progress: u8,
    pub phase: String,
}

static CANCELLED_JOBS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn cancelled_jobs() -> &'static Mutex<HashSet<String>> {
    CANCELLED_JOBS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn cancel_conversion(job_id: &str) -> bool {
    if job_id.trim().is_empty() {
        return false;
    }
    cancelled_jobs()
        .lock()
        .is_ok_and(|mut jobs| jobs.insert(job_id.to_string()))
}

fn clear_cancelled(job_id: &str) {
    if let Ok(mut jobs) = cancelled_jobs().lock() {
        jobs.remove(job_id);
    }
}

fn is_cancelled(job_id: &str) -> bool {
    cancelled_jobs()
        .lock()
        .is_ok_and(|jobs| jobs.contains(job_id))
}

fn check_cancelled(job_id: &str) -> Result<()> {
    if is_cancelled(job_id) {
        Err(ConvertError::Message("Conversion annulée.".to_string()))
    } else {
        Ok(())
    }
}

#[derive(Clone, Copy)]
struct FfmpegRunOptions<'a> {
    phase_label: &'a str,
    batch_concurrency: usize,
}

pub fn describe_file_with_app(
    app: Option<&AppHandle>,
    file_path: impl AsRef<Path>,
) -> Result<FileDescription> {
    let file_path = file_path.as_ref();
    let stat = fs::metadata(file_path)?;
    let extension = file_path
        .extension()
        .and_then(OsStr::to_str)
        .map(|value| format!(".{}", value.to_ascii_lowercase()))
        .unwrap_or_default();
    let source_format = get_format_by_extension(&extension);
    let modified_at = stat
        .modified()
        .ok()
        .and_then(system_time_to_iso)
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());

    let animated_gif = source_format
        .as_ref()
        .is_some_and(|format| format.id == "gif")
        && gif_is_animated(file_path).unwrap_or(false);
    let display_category = if animated_gif {
        "Vidéo".to_string()
    } else {
        source_format
            .as_ref()
            .map(|item| item.category.to_string())
            .unwrap_or_else(|| "Inconnu".to_string())
    };
    let display_category_id = if animated_gif {
        "video".to_string()
    } else {
        source_format
            .as_ref()
            .map(|item| item.category_id.to_string())
            .unwrap_or_else(|| "unknown".to_string())
    };

    Ok(FileDescription {
        path: file_path.to_string_lossy().to_string(),
        name: file_path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("fichier")
            .to_string(),
        base_name: file_path
            .file_stem()
            .and_then(OsStr::to_str)
            .unwrap_or("fichier")
            .to_string(),
        extension: extension.clone(),
        category: display_category,
        category_id: display_category_id,
        source_format: source_format.as_ref().map(|item| item.id.to_string()),
        directory: file_path
            .parent()
            .map(|item| item.to_string_lossy().to_string())
            .unwrap_or_default(),
        size: stat.len(),
        modified_at,
        warnings: file_warnings(
            stat.len(),
            source_format.as_ref().map(|item| item.category_id),
        ),
        targets: source_format
            .as_ref()
            .map(|source| {
                get_targets_for_extension(&extension)
                    .into_iter()
                    .filter(|target| {
                        source.id != "gif"
                            || if animated_gif {
                                target.category_id == "video"
                            } else {
                                target.category_id == "images"
                            }
                    })
                    .map(|target| engines::decorate_target(app, source, target))
                    .collect()
            })
            .unwrap_or_default(),
    })
}

fn file_warnings(size: u64, category_id: Option<&str>) -> Vec<FileWarning> {
    let mut warnings = Vec::new();
    if size >= LARGE_FILE_WARNING_BYTES {
        warnings.push(FileWarning {
            code: "largeFile",
            severity: "warning",
            limit_bytes: Some(LARGE_FILE_WARNING_BYTES),
        });
    }
    if matches!(category_id, Some("documents" | "images")) && size >= INTEGRATED_MEMORY_LIMIT_BYTES
    {
        warnings.push(FileWarning {
            code: "memoryIntensive",
            severity: "warning",
            limit_bytes: Some(INTEGRATED_MEMORY_LIMIT_BYTES),
        });
    }
    warnings
}

fn gif_is_animated(path: &Path) -> Result<bool> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut header = [0u8; 13];
    if reader.read_exact(&mut header).is_err() {
        return Ok(false);
    }
    if !header.starts_with(b"GIF87a") && !header.starts_with(b"GIF89a") {
        return Ok(false);
    }
    let packed = header[10];
    let global_color_table = packed & 0b1000_0000 != 0;
    if global_color_table {
        let size = 3usize * (1usize << (((packed & 0b0000_0111) as usize) + 1));
        if skip_bytes(&mut reader, size).is_err() {
            return Ok(false);
        }
    }

    let mut image_count = 0usize;
    let mut marker = [0u8; 1];
    while reader.read_exact(&mut marker).is_ok() {
        match marker[0] {
            0x2C => {
                image_count += 1;
                if image_count > 1 {
                    return Ok(true);
                }

                let mut descriptor = [0u8; 9];
                if reader.read_exact(&mut descriptor).is_err() {
                    return Ok(false);
                }
                let image_packed = descriptor[8];
                if image_packed & 0b1000_0000 != 0 {
                    let size = 3usize * (1usize << (((image_packed & 0b0000_0111) as usize) + 1));
                    if skip_bytes(&mut reader, size).is_err() {
                        return Ok(false);
                    }
                }

                if skip_bytes(&mut reader, 1).is_err() || skip_gif_sub_blocks(&mut reader).is_err()
                {
                    return Ok(false);
                }
            }
            0x21 => {
                if skip_bytes(&mut reader, 1).is_err() || skip_gif_sub_blocks(&mut reader).is_err()
                {
                    return Ok(false);
                }
            }
            0x3B => return Ok(false),
            _ => return Ok(false),
        }
    }
    Ok(false)
}

fn skip_gif_sub_blocks(reader: &mut impl Read) -> std::io::Result<()> {
    let mut size = [0u8; 1];
    loop {
        reader.read_exact(&mut size)?;
        let size = size[0] as usize;
        if size == 0 {
            break;
        }
        skip_bytes(reader, size)?;
    }
    Ok(())
}

fn skip_bytes(reader: &mut impl Read, mut remaining: usize) -> std::io::Result<()> {
    let mut buffer = [0u8; 4096];
    while remaining > 0 {
        let count = remaining.min(buffer.len());
        reader.read_exact(&mut buffer[..count])?;
        remaining -= count;
    }
    Ok(())
}

pub fn convert(app: &AppHandle, job: ConversionJob) -> Result<ConversionResult> {
    let result = convert_impl(app, job.clone());
    if let Err(error) = &result {
        runtime_log::write(
            "conversion",
            &format!(
                "job {} failed: {} -> {}: {}",
                job.id, job.input_path, job.target_format, error
            ),
        );
    }
    clear_cancelled(&job.id);
    result
}

fn convert_impl(app: &AppHandle, job: ConversionJob) -> Result<ConversionResult> {
    if job.input_path.trim().is_empty() || job.target_format.trim().is_empty() {
        return Err(ConvertError::Message("Conversion invalide.".to_string()));
    }
    check_cancelled(&job.id)?;

    let input_path = PathBuf::from(&job.input_path);
    ensure_source_file_available(&input_path)?;
    let target_format = job.target_format.to_ascii_lowercase();
    let extension = input_path
        .extension()
        .and_then(OsStr::to_str)
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let source_format = get_format_by_extension(&extension)
        .ok_or_else(|| ConvertError::Message(format!("Format .{} non reconnu.", extension)))?;
    let target = get_format_by_id(&target_format)
        .ok_or_else(|| ConvertError::Message(format!("Format {} non reconnu.", target_format)))?;
    if target.id == "doc" {
        return Err(ConvertError::Message(
            "La sortie DOC historique est désactivée. Choisissez DOCX pour générer le format moderne."
                .to_string(),
        ));
    }
    if source_format.id == "gif" {
        let animated = gif_is_animated(&input_path).unwrap_or(false);
        if animated && target.category_id == "images" {
            return Err(ConvertError::Message(
                "Ce GIF est animé. Choisissez un format vidéo pour conserver l'animation."
                    .to_string(),
            ));
        }
        if !animated && target.category_id == "video" {
            return Err(ConvertError::Message(
                "Ce GIF est statique. Choisissez un format image.".to_string(),
            ));
        }
    }
    let output_root = job
        .output_dir
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| input_path.parent().unwrap_or(Path::new(".")).to_path_buf());
    let output_dir = output_root.join(safe_path_component(&job.id));
    fs::create_dir_all(&output_dir)?;
    let builtin_engine = get_engine(&source_format, &target);
    let engine = engines::select_engine(
        Some(app),
        &source_format,
        target.id,
        target.category_id,
        builtin_engine,
    );
    let batch_concurrency = job.batch_concurrency.unwrap_or(1).max(1);
    let output_extension = get_targets_for_extension(&extension)
        .into_iter()
        .find(|item| item.format == target.id)
        .map(|item| item.extension)
        .unwrap_or_else(|| target.extension.to_string());
    let output_path = available_output_path(&input_path, &output_dir, &output_extension);

    emit_progress(app, &job.id, 4, "Préparation");
    check_cancelled(&job.id)?;

    match engine.id.as_str() {
        "ffmpeg" => {
            if target.category_id == "video" {
                convert_video(
                    app,
                    &job.id,
                    &input_path,
                    &output_path,
                    target.id,
                    batch_concurrency,
                )?;
            } else {
                convert_audio(
                    app,
                    &job.id,
                    &input_path,
                    &output_path,
                    target.id,
                    batch_concurrency,
                )?;
            }
        }
        engine_id if uses_integrated_image_pipeline(engine_id) => {
            convert_image(app, &job.id, &input_path, &output_path, target.id)?
        }
        "rust-text" | "pdf-extract" | "text" => convert_text_document(
            app,
            &job.id,
            &input_path,
            &output_path,
            source_format.id,
            target.id,
        )?,
        "libreoffice" => {
            convert_with_libreoffice(app, &job.id, &input_path, &output_path, target.id)?
        }
        "pandoc" => convert_with_pandoc(app, &job.id, &input_path, &output_path)?,
        "pdfium" => convert_with_pdfium(app, &job.id, &input_path, &output_path, target.id)?,
        "libvips" => convert_with_libvips(app, &job.id, &input_path, &output_path)?,
        _ => {
            return Err(ConvertError::Message(format!(
                "Conversion fidèle impossible pour {} -> {}. {} Moteurs évalués : {}.",
                source_format.label,
                target.label,
                engine.reason,
                engine.plan.join(" > ")
            )));
        }
    }

    validate_conversion_output(app, &output_path, &output_extension, target.category_id)?;
    emit_progress(app, &job.id, 100, "Terminé");
    Ok(ConversionResult {
        output_path: output_path.to_string_lossy().to_string(),
    })
}

fn ensure_source_file_available(input_path: &Path) -> Result<()> {
    if input_path.is_file() {
        return Ok(());
    }
    Err(ConvertError::Message(
        "Le fichier source est introuvable. Réimportez ce fichier, puis relancez la conversion."
            .to_string(),
    ))
}

fn validate_conversion_output(
    app: &AppHandle,
    output_path: &Path,
    expected_extension: &str,
    target_category_id: &str,
) -> Result<()> {
    let validation =
        validate_conversion_output_inner(app, output_path, expected_extension, target_category_id);
    if validation.is_err() {
        let _ = fs::remove_file(output_path);
    }
    validation
}

fn validate_conversion_output_inner(
    app: &AppHandle,
    output_path: &Path,
    expected_extension: &str,
    target_category_id: &str,
) -> Result<()> {
    if !output_path.exists() {
        return Err(ConvertError::Message(
            "La conversion s'est terminée sans produire de fichier de sortie.".to_string(),
        ));
    }
    let stat = fs::metadata(output_path)?;
    if stat.len() == 0 {
        return Err(ConvertError::Message(
            "La conversion a produit un fichier vide.".to_string(),
        ));
    }
    let actual = output_path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    let expected = expected_extension
        .trim_start_matches('.')
        .to_ascii_lowercase();
    if !expected.is_empty() && actual != expected {
        return Err(ConvertError::Message(format!(
            "La conversion a produit une extension inattendue : .{} au lieu de .{}.",
            actual, expected
        )));
    }
    if target_category_id == "images" && expected != "zip" {
        image::ImageReader::open(output_path)?
            .with_guessed_format()?
            .decode()?;
    }
    if matches!(target_category_id, "audio" | "video")
        && let Some(ffprobe) = engines::resolve_tool(Some(app), "ffprobe")
    {
        let mut command = Command::new(ffprobe);
        hide_command_window(&mut command);
        let output = command
            .args([
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
            ])
            .arg(output_path)
            .stdin(Stdio::null())
            .output()?;
        let duration = String::from_utf8_lossy(&output.stdout);
        if !output.status.success()
            || duration
                .trim()
                .parse::<f64>()
                .ok()
                .is_none_or(|value| !value.is_finite() || value <= 0.0)
        {
            return Err(ConvertError::Message(
                "La sortie média produite n'est pas lisible par ffprobe.".to_string(),
            ));
        }
    }
    Ok(())
}

fn emit_progress(app: &AppHandle, job_id: &str, progress: u8, phase: &str) {
    let _ = app.emit(
        "convert-progress",
        ProgressPayload {
            job_id: job_id.to_string(),
            progress,
            phase: phase.to_string(),
        },
    );
}

fn system_time_to_iso(value: SystemTime) -> Option<String> {
    let duration = value.duration_since(SystemTime::UNIX_EPOCH).ok()?;
    let datetime = time::OffsetDateTime::from_unix_timestamp(duration.as_secs() as i64).ok()?;
    datetime
        .format(&time::format_description::well_known::Rfc3339)
        .ok()
}

pub(crate) fn available_output_path(
    input_path: &Path,
    output_dir: &Path,
    target_extension: &str,
) -> PathBuf {
    let source_base = input_path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("fichier");
    let sanitized = source_base
        .chars()
        .map(|ch| {
            if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control()
            {
                '-'
            } else {
                ch
            }
        })
        .collect::<String>();
    let mut candidate = output_dir.join(format!(
        "{}.{}",
        sanitized,
        target_extension.trim_start_matches('.')
    ));
    let mut index = 1;
    while candidate.exists() {
        candidate = output_dir.join(format!(
            "{}-{}.{}",
            sanitized,
            index,
            target_extension.trim_start_matches('.')
        ));
        index += 1;
    }
    candidate
}

fn safe_path_component(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control()
            {
                '-'
            } else {
                ch
            }
        })
        .collect::<String>();
    if sanitized.trim().is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        sanitized
    }
}

fn ffmpeg_path(app: &AppHandle) -> Result<PathBuf> {
    engines::resolve_tool(Some(app), "ffmpeg").ok_or_else(|| {
        ConvertError::Message(
            "FFmpeg embarqué est introuvable. Réinstallez Multi-Converter ou relancez le build avec les binaires de base.".to_string(),
        )
    })
}

fn ffmpeg_threads(batch_concurrency: usize) -> String {
    let cores = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(2);
    if batch_concurrency <= 1 {
        "0".to_string()
    } else {
        std::cmp::max(1, cores / batch_concurrency).to_string()
    }
}

fn x264_preset() -> &'static str {
    "veryfast"
}

fn convert_audio(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
    batch_concurrency: usize,
) -> Result<()> {
    let args = audio_args(target_format)?;
    run_ffmpeg(
        app,
        job_id,
        input_path,
        output_path,
        &args,
        FfmpegRunOptions {
            phase_label: "Conversion audio",
            batch_concurrency,
        },
    )
}

fn audio_args(target_format: &str) -> Result<Vec<&'static str>> {
    Ok(match target_format {
        "mp3" => vec!["-vn", "-codec:a", "libmp3lame", "-q:a", "2"],
        "m4a" => vec!["-vn", "-codec:a", "aac", "-b:a", "192k"],
        "flac" => vec!["-vn", "-codec:a", "flac"],
        "wav" => vec!["-vn", "-codec:a", "pcm_s16le"],
        "ogg" => vec!["-vn", "-codec:a", "libvorbis", "-q:a", "5"],
        "wma" => vec!["-vn", "-codec:a", "wmav2", "-b:a", "192k"],
        "opus" => vec!["-vn", "-codec:a", "libopus", "-b:a", "128k"],
        "aiff" => vec!["-vn", "-codec:a", "pcm_s16be"],
        "alac" => vec!["-vn", "-codec:a", "alac", "-f", "ipod"],
        "ac3" => vec!["-vn", "-codec:a", "ac3", "-b:a", "448k"],
        "mp2" => vec![
            "-vn", "-ar", "44100", "-ac", "2", "-codec:a", "mp2", "-b:a", "192k",
        ],
        "amr" => vec![
            "-vn",
            "-ar",
            "8000",
            "-ac",
            "1",
            "-codec:a",
            "libopencore_amrnb",
            "-f",
            "amr",
        ],
        "au" => vec!["-vn", "-codec:a", "pcm_s16be", "-f", "au"],
        "caf" => vec!["-vn", "-codec:a", "pcm_s16be", "-f", "caf"],
        _ => {
            return Err(ConvertError::Message(format!(
                "Format audio {} non supporté par le moteur intégré.",
                target_format.to_uppercase()
            )));
        }
    })
}

fn convert_video(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
    batch_concurrency: usize,
) -> Result<()> {
    let mut gpu_attempted = false;
    for args in gpu_video_args(app, target_format) {
        gpu_attempted = true;
        check_cancelled(job_id)?;
        if run_ffmpeg(
            app,
            job_id,
            input_path,
            output_path,
            &args,
            FfmpegRunOptions {
                phase_label: "Conversion vidéo",
                batch_concurrency,
            },
        )
        .is_ok()
        {
            return Ok(());
        }
        let _ = fs::remove_file(output_path);
    }
    if gpu_attempted {
        emit_progress(
            app,
            job_id,
            18,
            "Accélération GPU indisponible, fallback CPU",
        );
    }

    let args = cpu_video_args(target_format)?;
    run_ffmpeg(
        app,
        job_id,
        input_path,
        output_path,
        &args,
        FfmpegRunOptions {
            phase_label: "Conversion vidéo",
            batch_concurrency,
        },
    )
}

fn cpu_video_args(target_format: &str) -> Result<Vec<String>> {
    Ok(match target_format {
        "mp4" => owned_args(&[
            "-codec:v",
            "libx264",
            "-preset",
            x264_preset(),
            "-crf",
            "23",
            "-codec:a",
            "aac",
            "-b:a",
            "160k",
        ]),
        "mkv" => owned_args(&[
            "-codec:v",
            "libx264",
            "-preset",
            x264_preset(),
            "-crf",
            "23",
            "-codec:a",
            "aac",
            "-b:a",
            "160k",
        ]),
        "webm" => owned_args(&[
            "-codec:v",
            "libvpx-vp9",
            "-b:v",
            "0",
            "-crf",
            "32",
            "-codec:a",
            "libopus",
            "-b:a",
            "128k",
        ]),
        "mov" => owned_args(&[
            "-codec:v",
            "libx264",
            "-preset",
            x264_preset(),
            "-crf",
            "23",
            "-codec:a",
            "aac",
            "-b:a",
            "160k",
        ]),
        "avi" => owned_args(&[
            "-codec:v", "mpeg4", "-q:v", "5", "-codec:a", "mp3", "-b:a", "160k",
        ]),
        "wmv" => owned_args(&["-codec:v", "wmv2", "-codec:a", "wmav2"]),
        "3gp" => owned_args(&[
            "-s", "640x360", "-codec:v", "mpeg4", "-codec:a", "aac", "-b:a", "96k",
        ]),
        "mts" => owned_args(&[
            "-codec:v",
            "libx264",
            "-preset",
            x264_preset(),
            "-crf",
            "23",
            "-codec:a",
            "aac",
            "-f",
            "mpegts",
        ]),
        "mpeg2" => owned_args(&[
            "-codec:v",
            "mpeg2video",
            "-q:v",
            "3",
            "-codec:a",
            "mp2",
            "-b:a",
            "192k",
        ]),
        "ogv" => owned_args(&[
            "-codec:v",
            "libtheora",
            "-q:v",
            "7",
            "-codec:a",
            "libvorbis",
            "-q:a",
            "5",
        ]),
        _ => {
            return Err(ConvertError::Message(format!(
                "Format vidéo {} non supporté par le moteur intégré.",
                target_format.to_uppercase()
            )));
        }
    })
}

fn gpu_video_args(app: &AppHandle, target_format: &str) -> Vec<Vec<String>> {
    if !matches!(target_format, "mp4" | "mkv" | "mov" | "mts") {
        return Vec::new();
    }

    ["h264_nvenc", "h264_qsv", "h264_amf"]
        .into_iter()
        .filter(|encoder| ffmpeg_supports_encoder(app, encoder))
        .map(|encoder| gpu_h264_args(target_format, encoder))
        .collect()
}

fn gpu_h264_args(target_format: &str, encoder: &str) -> Vec<String> {
    let mut args = owned_args(&[
        "-codec:v", encoder, "-b:v", "8M", "-maxrate", "12M", "-bufsize", "16M",
    ]);

    match target_format {
        "mts" => args.extend(owned_args(&[
            "-codec:a", "aac", "-b:a", "192k", "-f", "mpegts",
        ])),
        _ => args.extend(owned_args(&["-codec:a", "aac", "-b:a", "192k"])),
    }

    args
}

fn ffmpeg_supports_encoder(app: &AppHandle, encoder: &str) -> bool {
    let Ok(ffmpeg) = ffmpeg_path(app) else {
        return false;
    };
    let mut command = Command::new(ffmpeg);
    hide_command_window(&mut command);
    command
        .args(["-hide_banner", "-encoders"])
        .output()
        .ok()
        .is_some_and(|output| String::from_utf8_lossy(&output.stdout).contains(encoder))
}

fn owned_args(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| item.to_string()).collect()
}

fn run_ffmpeg<T: AsRef<str>>(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    codec_args: &[T],
    options: FfmpegRunOptions<'_>,
) -> Result<()> {
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        input_path.to_string_lossy().to_string(),
    ];
    args.extend(codec_args.iter().map(|item| item.as_ref().to_string()));
    args.push("-threads".to_string());
    args.push(ffmpeg_threads(options.batch_concurrency));
    args.extend([
        "-progress".to_string(),
        "pipe:2".to_string(),
        "-nostats".to_string(),
    ]);
    args.push(output_path.to_string_lossy().to_string());
    emit_progress(app, job_id, 12, "Analyse du média");
    check_cancelled(job_id)?;

    let mut command = Command::new(ffmpeg_path(app)?);
    hide_command_window(&mut command);
    let mut child = command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| ConvertError::Message("FFmpeg n'a pas pu démarrer.".to_string()))?;
    let (line_sender, line_receiver) = mpsc::channel();
    let stderr_reader = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            if line_sender.send(line).is_err() {
                break;
            }
        }
    });

    let mut stderr_text = String::new();
    let mut duration_ms: Option<u64> = None;
    let mut last_progress = 12u8;
    let status = loop {
        if is_cancelled(job_id) {
            terminate_child_process(&mut child);
            let _ = stderr_reader.join();
            return Err(ConvertError::Message("Conversion annulée.".to_string()));
        }
        while let Ok(line) = line_receiver.try_recv() {
            handle_ffmpeg_progress_line(
                app,
                job_id,
                options,
                line?,
                &mut stderr_text,
                &mut duration_ms,
                &mut last_progress,
            );
        }
        if let Some(status) = child.try_wait()? {
            break status;
        }
        match line_receiver.recv_timeout(Duration::from_millis(120)) {
            Ok(line) => handle_ffmpeg_progress_line(
                app,
                job_id,
                options,
                line?,
                &mut stderr_text,
                &mut duration_ms,
                &mut last_progress,
            ),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                if let Some(status) = child.try_wait()? {
                    break status;
                }
            }
        }
    };
    let _ = stderr_reader.join();
    while let Ok(line) = line_receiver.try_recv() {
        handle_ffmpeg_progress_line(
            app,
            job_id,
            options,
            line?,
            &mut stderr_text,
            &mut duration_ms,
            &mut last_progress,
        );
    }

    check_cancelled(job_id)?;
    if status.success() {
        emit_progress(app, job_id, 96, options.phase_label);
        Ok(())
    } else {
        Err(ConvertError::Message(clean_ffmpeg_error(&stderr_text)))
    }
}

fn handle_ffmpeg_progress_line(
    app: &AppHandle,
    job_id: &str,
    options: FfmpegRunOptions<'_>,
    line: String,
    stderr_text: &mut String,
    duration_ms: &mut Option<u64>,
    last_progress: &mut u8,
) {
    append_limited_log(stderr_text, &line);
    if duration_ms.is_none() {
        *duration_ms = parse_ffmpeg_duration_ms(&line);
    }
    if let Some(out_time_ms) = parse_ffmpeg_out_time_ms(&line) {
        if let Some(duration) = duration_ms.filter(|value| *value > 0) {
            let progress = (12 + ((out_time_ms.min(duration) * 84) / duration) as u8).min(96);
            if progress > *last_progress {
                *last_progress = progress;
                emit_progress(app, job_id, progress, options.phase_label);
            }
        }
    } else if line.trim() == "progress=continue" && duration_ms.is_none() && *last_progress < 88 {
        *last_progress = (*last_progress).saturating_add(3).min(88);
        emit_progress(app, job_id, *last_progress, options.phase_label);
    }
}

fn parse_ffmpeg_duration_ms(line: &str) -> Option<u64> {
    let start = line.find("Duration: ")? + "Duration: ".len();
    let value = line.get(start..start + 11)?;
    parse_ffmpeg_time_ms(value)
}

fn parse_ffmpeg_out_time_ms(line: &str) -> Option<u64> {
    if let Some(value) = line.strip_prefix("out_time_ms=") {
        return value.trim().parse::<u64>().ok().map(|value| value / 1000);
    }
    line.strip_prefix("out_time=")
        .and_then(|value| parse_ffmpeg_time_ms(value.trim()))
}

fn parse_ffmpeg_time_ms(value: &str) -> Option<u64> {
    let mut parts = value.split(':');
    let hours = parts.next()?.parse::<u64>().ok()?;
    let minutes = parts.next()?.parse::<u64>().ok()?;
    let seconds = parts.next()?;
    let mut second_parts = seconds.split('.');
    let seconds = second_parts.next()?.parse::<u64>().ok()?;
    let millis = second_parts
        .next()
        .map(|fraction| {
            let padded = format!("{fraction:0<3}");
            padded.get(..3).unwrap_or("0").parse::<u64>().unwrap_or(0)
        })
        .unwrap_or(0);
    Some(((hours * 3600) + (minutes * 60) + seconds) * 1000 + millis)
}

#[cfg(target_os = "windows")]
fn hide_command_window(command: &mut Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_command_window(_command: &mut Command) {}

fn clean_ffmpeg_error(stderr: &str) -> String {
    let lines: Vec<_> = stderr
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let tail = lines
        .iter()
        .rev()
        .take(5)
        .copied()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" ");
    if tail.is_empty() {
        "FFmpeg n'a pas pu convertir ce fichier.".to_string()
    } else {
        tail
    }
}

fn append_limited_log(buffer: &mut String, line: &str) {
    buffer.push_str(line);
    buffer.push('\n');
    if buffer.chars().count() <= MAX_FFMPEG_PROGRESS_LOG_CHARS {
        return;
    }
    let tail = buffer
        .chars()
        .rev()
        .take(MAX_FFMPEG_PROGRESS_LOG_CHARS)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    *buffer = format!("[sortie tronquée]\n{tail}");
}

fn convert_image(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
) -> Result<()> {
    ensure_integrated_memory_budget(input_path, "image")?;
    emit_progress(app, job_id, 18, "Lecture de l'image");
    let image = read_integrated_image(input_path)?;

    emit_progress(app, job_id, 52, "Encodage de l'image");
    write_integrated_image(output_path, image, target_format)?;
    emit_progress(app, job_id, 88, "Finalisation");
    Ok(())
}

fn uses_integrated_image_pipeline(engine_id: &str) -> bool {
    matches!(engine_id, "rust-image" | "resvg" | "image")
}

fn read_integrated_image(input_path: &Path) -> Result<image::DynamicImage> {
    if input_path
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("svg"))
    {
        read_svg_image(input_path)
    } else {
        let reader = image::ImageReader::open(input_path)?.with_guessed_format()?;
        let (width, height) = reader.into_dimensions()?;
        ensure_image_dimensions(width, height, "image")?;
        let image = image::ImageReader::open(input_path)?
            .with_guessed_format()?
            .decode()?;
        Ok(image)
    }
}

fn write_integrated_image(
    output_path: &Path,
    image: image::DynamicImage,
    target_format: &str,
) -> Result<()> {
    if target_format == "ico" {
        write_windows_ico(output_path, image)?;
    } else {
        let format = image_format_for_target(target_format)?;
        image.write_to(&mut File::create(output_path)?, format)?;
    }
    Ok(())
}

fn image_format_for_target(target_format: &str) -> Result<ImageFormat> {
    match target_format {
        "png" => Ok(ImageFormat::Png),
        "jpg" => Ok(ImageFormat::Jpeg),
        "gif" => Ok(ImageFormat::Gif),
        "webp" => Ok(ImageFormat::WebP),
        "tiff" => Ok(ImageFormat::Tiff),
        "bmp" => Ok(ImageFormat::Bmp),
        "ico" => Ok(ImageFormat::Ico),
        _ => Err(ConvertError::Message(format!(
            "Format image {} non supporté par le moteur intégré.",
            target_format.to_uppercase()
        ))),
    }
}

fn fit_ico_image(image: image::DynamicImage) -> image::DynamicImage {
    let target_size = 256;
    let resized = image
        .resize(target_size, target_size, FilterType::Lanczos3)
        .to_rgba8();
    let mut canvas =
        image::RgbaImage::from_pixel(target_size, target_size, image::Rgba([0, 0, 0, 0]));
    let x = ((target_size - resized.width()) / 2) as i64;
    let y = ((target_size - resized.height()) / 2) as i64;
    image::imageops::overlay(&mut canvas, &resized, x, y);

    image::DynamicImage::ImageRgba8(canvas)
}

fn write_windows_ico(output_path: &Path, image: image::DynamicImage) -> Result<()> {
    let icon = fit_ico_image(image).to_rgba8();
    let size = icon.width();
    let height = icon.height();
    if size == 0 || size != height || size > 256 {
        return Err(ConvertError::Message("Icône invalide.".to_string()));
    }

    let xor_bytes = (size * size * 4) as usize;
    let and_stride = size.div_ceil(32) * 4;
    let and_bytes = (and_stride * size) as usize;
    let dib_bytes = 40 + xor_bytes + and_bytes;
    let image_offset = 6 + 16;

    let mut file = File::create(output_path)?;
    file.write_all(&0u16.to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&[if size == 256 { 0 } else { size as u8 }])?;
    file.write_all(&[if size == 256 { 0 } else { size as u8 }])?;
    file.write_all(&[0, 0])?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&32u16.to_le_bytes())?;
    file.write_all(&(dib_bytes as u32).to_le_bytes())?;
    file.write_all(&(image_offset as u32).to_le_bytes())?;

    file.write_all(&40u32.to_le_bytes())?;
    file.write_all(&(size as i32).to_le_bytes())?;
    file.write_all(&((size * 2) as i32).to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&32u16.to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?;
    file.write_all(&(xor_bytes as u32).to_le_bytes())?;
    file.write_all(&0i32.to_le_bytes())?;
    file.write_all(&0i32.to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?;
    file.write_all(&0u32.to_le_bytes())?;

    for y in (0..size).rev() {
        for x in 0..size {
            let pixel = icon.get_pixel(x, y).0;
            file.write_all(&[pixel[2], pixel[1], pixel[0], pixel[3]])?;
        }
    }
    file.write_all(&vec![0u8; and_bytes])?;
    Ok(())
}

fn read_svg_image(input_path: &Path) -> Result<image::DynamicImage> {
    ensure_integrated_memory_budget(input_path, "SVG")?;
    let data = fs::read(input_path)?;
    let options = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(&data, &options)
        .map_err(|error| ConvertError::Message(format!("SVG illisible: {error}")))?;
    let size = tree.size().to_int_size();
    ensure_image_dimensions(size.width(), size.height(), "SVG")?;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(size.width(), size.height())
        .ok_or_else(|| ConvertError::Message("SVG illisible.".to_string()))?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::default(),
        &mut pixmap.as_mut(),
    );
    let rgba = image::RgbaImage::from_raw(size.width(), size.height(), pixmap.data().to_vec())
        .ok_or_else(|| ConvertError::Message("SVG illisible.".to_string()))?;
    Ok(image::DynamicImage::ImageRgba8(rgba))
}

fn ensure_image_dimensions(width: u32, height: u32, label: &str) -> Result<()> {
    if width == 0 || height == 0 {
        return Err(ConvertError::Message(format!(
            "Ce fichier {label} a des dimensions invalides."
        )));
    }
    if width > MAX_INTEGRATED_IMAGE_DIMENSION || height > MAX_INTEGRATED_IMAGE_DIMENSION {
        return Err(ConvertError::Message(format!(
            "Ce fichier {label} est trop grand pour le moteur intégré actuel (limite: {} px par côté).",
            MAX_INTEGRATED_IMAGE_DIMENSION
        )));
    }
    let pixels = u64::from(width) * u64::from(height);
    if pixels > MAX_INTEGRATED_IMAGE_PIXELS {
        return Err(ConvertError::Message(format!(
            "Ce fichier {label} est trop grand pour le moteur intégré actuel (limite: {} mégapixels).",
            MAX_INTEGRATED_IMAGE_PIXELS / 1_000_000
        )));
    }
    Ok(())
}

fn convert_text_document(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    source_format: &str,
    target_format: &str,
) -> Result<()> {
    if source_format == "pdf" {
        emit_progress(app, job_id, 22, "Extraction du texte PDF");
    }
    let content = read_document_text(input_path, source_format)?;
    assert_readable_document_content(input_path, source_format, &content)?;
    write_text_content(
        app,
        job_id,
        input_path,
        output_path,
        source_format,
        target_format,
        &content,
    )
}

fn write_text_content(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    source_format: &str,
    target_format: &str,
    content: &str,
) -> Result<()> {
    if target_format == "pdf" {
        return convert_text_to_pdf_content(app, job_id, input_path, output_path, content);
    }
    emit_progress(app, job_id, 45, "Conversion texte");
    write_text_content_file(output_path, source_format, target_format, content)?;
    emit_progress(app, job_id, 88, "Finalisation");
    Ok(())
}

fn write_text_content_file(
    output_path: &Path,
    source_format: &str,
    target_format: &str,
    content: &str,
) -> Result<()> {
    match target_format {
        "txt" => fs::write(output_path, to_plain_text(content, source_format))?,
        "md" => fs::write(output_path, to_markdown(content, source_format))?,
        "html" => fs::write(output_path, to_html(content, source_format))?,
        "rtf" => fs::write(output_path, to_rtf(content, source_format))?,
        "csv" => write_utf8_csv(output_path, &to_csv(content, source_format))?,
        "json" => fs::write(output_path, to_json(content, source_format)?)?,
        "xml" => fs::write(output_path, to_xml(content, source_format))?,
        "docx" => write_docx(output_path, content, source_format)?,
        "odt" => write_odt(output_path, content, source_format)?,
        "epub" => write_epub(output_path, content, source_format)?,
        _ => {
            return Err(ConvertError::Message(format!(
                "Conversion texte vers {} non supportée.",
                target_format.to_uppercase()
            )));
        }
    }
    Ok(())
}

fn convert_with_libreoffice(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
) -> Result<()> {
    let soffice = engine_path(app, "libreoffice")?;
    let out_dir = output_path
        .parent()
        .ok_or_else(|| ConvertError::Message("Dossier de sortie invalide.".to_string()))?;
    let profile_dir = env::temp_dir().join(format!("multi-converter-lo-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&profile_dir)?;
    emit_progress(app, job_id, 24, "Conversion LibreOffice");
    let filter = match target_format {
        "txt" => "txt:Text",
        "html" => "html:XHTML Writer File",
        other => other,
    };
    let mut command = Command::new(&soffice);
    command
        .arg("--headless")
        .arg("--invisible")
        .arg("--nologo")
        .arg("--nodefault")
        .arg("--nolockcheck")
        .arg("--norestore")
        .arg("--nofirststartwizard")
        .arg(format!(
            "-env:UserInstallation={}",
            path_to_file_url(&profile_dir)
        ))
        .arg("--convert-to")
        .arg(filter)
        .arg("--outdir")
        .arg(out_dir)
        .arg(input_path);
    let result = run_external_command_with_progress(
        &mut command,
        "LibreOffice",
        Duration::from_secs(240),
        ExternalCommandProgress {
            app,
            job_id,
            phase: "Conversion LibreOffice",
            start: 24,
            max: 82,
        },
    );
    let _ = fs::remove_dir_all(&profile_dir);
    result?;
    move_external_output(input_path, out_dir, output_path, target_format)?;
    emit_progress(app, job_id, 88, "Finalisation LibreOffice");
    Ok(())
}

fn convert_with_pandoc(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
) -> Result<()> {
    let pandoc = engine_path(app, "pandoc")?;
    emit_progress(app, job_id, 24, "Conversion Pandoc");
    run_external_command_with_progress(
        Command::new(&pandoc)
            .arg(input_path)
            .arg("-o")
            .arg(output_path),
        "Pandoc",
        Duration::from_secs(180),
        ExternalCommandProgress {
            app,
            job_id,
            phase: "Conversion Pandoc",
            start: 24,
            max: 82,
        },
    )?;
    emit_progress(app, job_id, 88, "Finalisation Pandoc");
    Ok(())
}

fn convert_with_pdfium(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
) -> Result<()> {
    let pdfium = engine_path(app, "pdfium")?;
    emit_progress(app, job_id, 24, "Rendu PDFium");
    let format = if target_format == "jpg" { "jpg" } else { "png" };
    let render_dir = env::temp_dir().join(format!(
        "multi-converter-pdf-pages-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&render_dir)?;
    let render_result = run_external_command_with_progress(
        Command::new(&pdfium)
            .arg("--render-all")
            .arg(input_path)
            .arg(&render_dir)
            .arg("--format")
            .arg(format)
            .arg("--dpi")
            .arg("220"),
        "PDFium",
        Duration::from_secs(240),
        ExternalCommandProgress {
            app,
            job_id,
            phase: "Rendu PDFium",
            start: 24,
            max: 82,
        },
    );
    if let Err(error) = render_result {
        let _ = fs::remove_dir_all(&render_dir);
        return Err(error);
    }
    let archive_result = zip_rendered_pages(&render_dir, output_path, format);
    let _ = fs::remove_dir_all(&render_dir);
    archive_result?;
    emit_progress(app, job_id, 88, "Finalisation PDFium");
    Ok(())
}

fn zip_rendered_pages(render_dir: &Path, output_path: &Path, format: &str) -> Result<()> {
    let mut pages = fs::read_dir(render_dir)?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.extension()
                .and_then(OsStr::to_str)
                .is_some_and(|extension| extension.eq_ignore_ascii_case(format))
        })
        .collect::<Vec<_>>();
    pages.sort();
    if pages.is_empty() {
        return Err(ConvertError::Message(
            "PDFium n'a produit aucune page image.".to_string(),
        ));
    }
    let mut zip = zip::ZipWriter::new(File::create(output_path)?);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for page in pages {
        let name = page
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or(if format == "jpg" {
                "page.jpg"
            } else {
                "page.png"
            });
        zip.start_file(name, options)?;
        let mut file = File::open(&page)?;
        std::io::copy(&mut file, &mut zip)?;
    }
    zip.finish()?;
    Ok(())
}

fn convert_with_libvips(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
) -> Result<()> {
    let vips = engine_path(app, "libvips")?;
    emit_progress(app, job_id, 24, "Conversion libvips");
    run_external_command_with_progress(
        Command::new(&vips)
            .arg("copy")
            .arg(input_path)
            .arg(output_path),
        "libvips",
        Duration::from_secs(180),
        ExternalCommandProgress {
            app,
            job_id,
            phase: "Conversion libvips",
            start: 24,
            max: 82,
        },
    )?;
    emit_progress(app, job_id, 88, "Finalisation libvips");
    Ok(())
}

fn engine_path(app: &AppHandle, id: &str) -> Result<PathBuf> {
    engines::resolve_tool(Some(app), id).ok_or_else(|| {
        ConvertError::Message(format!(
            "Moteur {} introuvable. Réinstallez Multi-Converter ou restaurez les moteurs embarqués.",
            engines::tool_label(id)
        ))
    })
}

struct ExternalCommandProgress<'a> {
    app: &'a AppHandle,
    job_id: &'a str,
    phase: &'a str,
    start: u8,
    max: u8,
}

fn run_external_command_with_progress(
    command: &mut Command,
    label: &str,
    timeout: Duration,
    progress: ExternalCommandProgress<'_>,
) -> Result<()> {
    run_external_command_inner(command, label, timeout, progress.job_id, Some(progress))
}

fn run_external_command_inner(
    command: &mut Command,
    label: &str,
    timeout: Duration,
    job_id: &str,
    progress: Option<ExternalCommandProgress<'_>>,
) -> Result<()> {
    hide_command_window(command);
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let mut stdout_reader = child.stdout.take().map(drain_child_output);
    let mut stderr_reader = child.stderr.take().map(drain_child_output);
    let started = std::time::Instant::now();
    let mut last_progress_emit = std::time::Instant::now();
    let mut last_progress = progress
        .as_ref()
        .map(|progress| progress.start)
        .unwrap_or(0);
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if is_cancelled(job_id) {
            terminate_child_process(&mut child);
            let _ = join_child_output(stdout_reader.take());
            let _ = join_child_output(stderr_reader.take());
            return Err(ConvertError::Message("Conversion annulée.".to_string()));
        }
        if started.elapsed() > timeout {
            terminate_child_process(&mut child);
            let _ = join_child_output(stdout_reader.take());
            let _ = join_child_output(stderr_reader.take());
            return Err(ConvertError::Message(format!(
                "{label} ne répond pas pendant la conversion."
            )));
        }
        if let Some(progress) = progress.as_ref()
            && last_progress_emit.elapsed() >= Duration::from_millis(850)
        {
            let elapsed_ms = started.elapsed().as_millis().min(timeout.as_millis()) as u64;
            let timeout_ms = timeout.as_millis().max(1) as u64;
            let span = progress.max.saturating_sub(progress.start).max(1) as u64;
            let estimated = progress
                .start
                .saturating_add(((elapsed_ms * span) / timeout_ms) as u8);
            let next = estimated.max(last_progress).min(progress.max);
            if next > last_progress {
                last_progress = next;
                emit_progress(progress.app, progress.job_id, next, progress.phase);
            }
            last_progress_emit = std::time::Instant::now();
        }
        std::thread::sleep(Duration::from_millis(150));
    };
    let stdout = join_child_output(stdout_reader);
    let stderr = join_child_output(stderr_reader);
    if status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&stderr);
    let stdout = String::from_utf8_lossy(&stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    Err(ConvertError::Message(if detail.is_empty() {
        format!("{label} n'a pas pu convertir ce fichier.")
    } else {
        format!("{label}: {detail}")
    }))
}

fn drain_child_output<T>(mut stream: T) -> std::thread::JoinHandle<Vec<u8>>
where
    T: Read + Send + 'static,
{
    std::thread::spawn(move || {
        let mut output = Vec::new();
        let mut buffer = [0u8; 8192];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    output.extend_from_slice(&buffer[..read]);
                    if output.len() > MAX_ENGINE_OUTPUT_BYTES {
                        let excess = output.len() - MAX_ENGINE_OUTPUT_BYTES;
                        output.drain(0..excess);
                    }
                }
            }
        }
        output
    })
}

fn join_child_output(handle: Option<std::thread::JoinHandle<Vec<u8>>>) -> Vec<u8> {
    handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
}

fn terminate_child_process(child: &mut std::process::Child) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn move_external_output(
    input_path: &Path,
    out_dir: &Path,
    output_path: &Path,
    target_format: &str,
) -> Result<()> {
    let source_stem = input_path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("conversion");
    let expected_extension = if target_format == "jpg" {
        "jpeg"
    } else {
        target_format
    };
    let candidates = fs::read_dir(out_dir)?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.file_stem()
                .and_then(OsStr::to_str)
                .is_some_and(|stem| stem.eq_ignore_ascii_case(source_stem))
                && path
                    .extension()
                    .and_then(OsStr::to_str)
                    .is_some_and(|extension| {
                        extension.eq_ignore_ascii_case(target_format)
                            || extension.eq_ignore_ascii_case(expected_extension)
                    })
        })
        .collect::<Vec<_>>();
    let produced = candidates.first().ok_or_else(|| {
        ConvertError::Message("Le moteur externe n'a pas produit le fichier attendu.".to_string())
    })?;
    if paths_equal(produced, output_path) {
        return Ok(());
    }
    if output_path.exists() {
        fs::remove_file(output_path)?;
    }
    fs::rename(produced, output_path)?;
    Ok(())
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn path_to_file_url(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let with_slash = if raw.starts_with('/') {
        raw
    } else {
        format!("/{raw}")
    };
    format!("file://{}", percent_encode_url_path(&with_slash))
}

fn percent_encode_url_path(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b':' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            other => format!("%{other:02X}").chars().collect(),
        })
        .collect()
}

fn assert_readable_document_content(
    input_path: &Path,
    source_format: &str,
    content: &str,
) -> Result<()> {
    if !content.is_empty() {
        return Ok(());
    }
    if fs::metadata(input_path)?.len() == 0 {
        return Err(ConvertError::Message(
            "Le fichier source est vide : aucun contenu à convertir.".to_string(),
        ));
    }
    if source_format == "pdf" {
        return Err(ConvertError::Message(
            "Aucun texte extractible trouvé dans ce PDF.".to_string(),
        ));
    }
    Err(ConvertError::Message(
        "Aucun texte lisible trouvé dans ce fichier. Vérifiez son contenu ou son encodage."
            .to_string(),
    ))
}

fn read_document_text(input_path: &Path, source_format: &str) -> Result<String> {
    ensure_integrated_memory_budget(input_path, "document")?;
    match source_format {
        "pdf" => Ok(pdf_extract::extract_text(input_path)
            .map_err(|err| ConvertError::Message(err.to_string()))?
            .trim()
            .to_string()),
        "docx" => read_zip_text(input_path, "word/document.xml", "</w:p>"),
        "odt" => read_zip_text(input_path, "content.xml", "</text:p>"),
        "epub" => read_epub_text(input_path),
        "html" => Ok(html_to_visible_text(&read_text_file(input_path)?)),
        "rtf" => Ok(strip_rtf(&read_text_file(input_path)?)),
        _ => read_text_file(input_path),
    }
}

fn read_text_file(input_path: &Path) -> Result<String> {
    ensure_integrated_memory_budget(input_path, "texte")?;
    let buffer = fs::read(input_path)?;
    Ok(decode_text_buffer(&buffer))
}

fn ensure_integrated_memory_budget(input_path: &Path, label: &str) -> Result<()> {
    let size = fs::metadata(input_path)?.len();
    if size > INTEGRATED_MEMORY_LIMIT_BYTES {
        return Err(ConvertError::Message(format!(
            "Ce fichier {label} est trop volumineux pour le moteur intégré actuel (limite: 512 Mo). Utilisez un moteur externe adapté ou un fichier plus petit."
        )));
    }
    Ok(())
}

fn decode_text_buffer(buffer: &[u8]) -> String {
    if buffer.is_empty() {
        return String::new();
    }
    if buffer.starts_with(&[0xff, 0xfe]) {
        return decode_utf16_bytes(&buffer[2..], true);
    }
    if buffer.starts_with(&[0xfe, 0xff]) {
        return decode_utf16_bytes(&buffer[2..], false);
    }
    if buffer.starts_with(&[0xef, 0xbb, 0xbf]) {
        return String::from_utf8_lossy(&buffer[3..])
            .trim_start_matches('\u{feff}')
            .to_string();
    }
    if looks_like_utf16_le(buffer) {
        return decode_utf16_bytes(buffer, true);
    }
    if looks_like_utf16_be(buffer) {
        return decode_utf16_bytes(buffer, false);
    }
    match std::str::from_utf8(buffer) {
        Ok(value) => value.trim_start_matches('\u{feff}').to_string(),
        Err(_) => {
            let (value, _, _) = WINDOWS_1252.decode(buffer);
            value.trim_start_matches('\u{feff}').to_string()
        }
    }
}

fn decode_utf16_bytes(buffer: &[u8], little_endian: bool) -> String {
    let mut values = Vec::new();
    for chunk in buffer.chunks_exact(2) {
        values.push(if little_endian {
            u16::from_le_bytes([chunk[0], chunk[1]])
        } else {
            u16::from_be_bytes([chunk[0], chunk[1]])
        });
    }
    String::from_utf16_lossy(&values)
        .trim_start_matches('\u{feff}')
        .to_string()
}

fn looks_like_utf16_le(buffer: &[u8]) -> bool {
    looks_like_utf16(buffer, 1)
}

fn looks_like_utf16_be(buffer: &[u8]) -> bool {
    looks_like_utf16(buffer, 0)
}

fn looks_like_utf16(buffer: &[u8], nul_offset: usize) -> bool {
    if buffer.len() < 4 || !buffer.len().is_multiple_of(2) {
        return false;
    }
    let pairs = buffer.len() / 2;
    let nul_count = buffer
        .chunks_exact(2)
        .filter(|chunk| chunk[nul_offset] == 0)
        .count();
    nul_count * 100 / pairs >= 60
}

fn read_zip_text(input_path: &Path, name: &str, paragraph_tag: &str) -> Result<String> {
    let file = File::open(input_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut content = String::new();
    let mut entry = archive.by_name(name)?;
    ensure_extracted_text_budget(entry.size(), "document")?;
    (&mut entry)
        .take(MAX_EXTRACTED_TEXT_BYTES + 1)
        .read_to_string(&mut content)?;
    ensure_extracted_text_budget(content.len() as u64, "document")?;
    Ok(html_escape::decode_html_entities(
        &content
            .replace(paragraph_tag, "\n")
            .replace("</w:p>", "\n")
            .replace("<br/>", "\n")
            .replace("<br>", "\n"),
    )
    .replace_xml_tags()
    .trim()
    .to_string())
}

trait StripXmlTags {
    fn replace_xml_tags(&self) -> String;
}

impl StripXmlTags for str {
    fn replace_xml_tags(&self) -> String {
        let mut result = String::new();
        let mut in_tag = false;
        for ch in self.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => result.push(ch),
                _ => {}
            }
        }
        result
    }
}

fn read_epub_text(input_path: &Path) -> Result<String> {
    let file = File::open(input_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut parts = Vec::new();
    let mut total_bytes = 0u64;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index)?;
        let name = file.name().to_ascii_lowercase();
        if name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm") {
            ensure_extracted_text_budget(file.size(), "ePub")?;
            let remaining = MAX_EXTRACTED_TEXT_BYTES.saturating_sub(total_bytes);
            if remaining == 0 {
                ensure_extracted_text_budget(MAX_EXTRACTED_TEXT_BYTES + 1, "ePub")?;
            }
            let mut content = String::new();
            (&mut file)
                .take(remaining + 1)
                .read_to_string(&mut content)?;
            total_bytes = total_bytes.saturating_add(content.len() as u64);
            ensure_extracted_text_budget(total_bytes, "ePub")?;
            parts.push(content);
        }
    }
    Ok(html_to_visible_text(&parts.join("\n\n")))
}

fn ensure_extracted_text_budget(size: u64, label: &str) -> Result<()> {
    if size > MAX_EXTRACTED_TEXT_BYTES {
        return Err(ConvertError::Message(format!(
            "Le contenu décompressé du fichier {label} est trop volumineux pour le moteur intégré actuel."
        )));
    }
    Ok(())
}

fn strip_rtf(content: &str) -> String {
    let mut result = String::new();
    let mut group_depth = 0usize;
    let mut chars = content.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '{' => group_depth += 1,
            '}' => group_depth = group_depth.saturating_sub(1),
            '\\' => match chars.peek().copied() {
                Some('\'') => {
                    chars.next();
                    let hex = [chars.next().unwrap_or('0'), chars.next().unwrap_or('0')]
                        .iter()
                        .collect::<String>();
                    if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                        let bytes = [byte];
                        let (value, _, _) = WINDOWS_1252.decode(&bytes);
                        result.push_str(&value);
                    }
                }
                Some('u') => {
                    chars.next();
                    let mut number = String::new();
                    if matches!(chars.peek(), Some('-')) {
                        number.push(chars.next().unwrap_or('-'));
                    }
                    while chars.peek().is_some_and(|item| item.is_ascii_digit()) {
                        number.push(chars.next().unwrap_or_default());
                    }
                    if chars.peek().is_some_and(|item| item.is_whitespace()) {
                        chars.next();
                    }
                    if let Ok(value) = number.parse::<i32>() {
                        let unit = value as i16 as u16;
                        if let Some(decoded) =
                            char::decode_utf16([unit]).next().and_then(|item| item.ok())
                        {
                            result.push(decoded);
                        }
                    }
                    chars.next();
                }
                Some('\n') | Some('\r') => {
                    chars.next();
                }
                Some(item) if item.is_ascii_alphabetic() => {
                    let mut word = String::new();
                    while chars.peek().is_some_and(|item| item.is_ascii_alphabetic()) {
                        word.push(chars.next().unwrap_or_default());
                    }
                    while chars
                        .peek()
                        .is_some_and(|item| item.is_ascii_digit() || *item == '-')
                    {
                        chars.next();
                    }
                    if chars.peek().is_some_and(|item| item.is_whitespace()) {
                        chars.next();
                    }
                    if word == "par" || word == "line" {
                        result.push('\n');
                    }
                }
                Some(other) => {
                    chars.next();
                    if group_depth > 0 && matches!(other, '\\' | '{' | '}') {
                        result.push(other);
                    }
                }
                None => {}
            },
            ch => {
                if group_depth > 0 {
                    result.push(ch);
                }
            }
        }
    }
    result.trim().to_string()
}

fn convert_text_to_pdf_content(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    content: &str,
) -> Result<()> {
    emit_progress(app, job_id, 35, "Composition du PDF");
    let title = input_path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("Document");
    let pdf = simple_pdf(title, &normalize_pdf_text(content));
    fs::write(output_path, pdf)?;
    emit_progress(app, job_id, 88, "Finalisation du PDF");
    Ok(())
}

fn normalize_pdf_text(content: &str) -> String {
    content
        .replace('\0', "")
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .chars()
        .filter(|ch| *ch == '\n' || *ch == '\t' || !ch.is_control())
        .collect::<String>()
        .trim_end()
        .to_string()
}

fn simple_pdf(title: &str, content: &str) -> Vec<u8> {
    let escaped_title = escape_pdf_text(title);
    let lines = wrap_pdf_lines(content, 92);
    let lines_per_page = 52usize;
    let page_count = lines.len().div_ceil(lines_per_page).max(1);
    let page_ids = (0..page_count)
        .map(|index| 4 + index * 2)
        .collect::<Vec<_>>();
    let kids = page_ids
        .iter()
        .map(|id| format!("{id} 0 R"))
        .collect::<Vec<_>>()
        .join(" ");
    let mut objects: Vec<Vec<u8>> = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        format!("<< /Type /Pages /Kids [{}] /Count {} >>", kids, page_count).into_bytes(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    ];

    for (page_index, chunk) in lines.chunks(lines_per_page).enumerate() {
        let page_object_id = 4 + page_index * 2;
        let content_object_id = page_object_id + 1;
        objects.push(format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {} 0 R >>",
            content_object_id
        ).into_bytes());
        let stream = pdf_page_stream(chunk);
        let mut object = format!("<< /Length {} >>\nstream\n", stream.len()).into_bytes();
        object.extend_from_slice(&stream);
        object.extend_from_slice(b"\nendstream");
        objects.push(object);
    }

    let info_object_id = objects.len() + 1;
    objects.push(format!("<< /Title ({}) >>", escaped_title).into_bytes());
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"%PDF-1.4\n");
    let mut offsets = vec![0usize];
    for (index, object) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
        bytes.extend_from_slice(object);
        bytes.extend_from_slice(b"\nendobj\n");
    }
    let xref = bytes.len();
    bytes.extend_from_slice(
        format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes(),
    );
    for offset in offsets.iter().skip(1) {
        bytes.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
    }
    bytes.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R /Info {} 0 R >>\nstartxref\n{}\n%%EOF\n",
            objects.len() + 1,
            info_object_id,
            xref
        )
        .as_bytes(),
    );
    bytes
}

fn wrap_pdf_lines(content: &str, max_chars: usize) -> Vec<String> {
    let mut output = Vec::new();
    for line in content.lines() {
        if line.is_empty() {
            output.push(String::new());
            continue;
        }
        let mut current = String::new();
        for word in line.split_whitespace() {
            let needs_space = !current.is_empty();
            if current.chars().count() + word.chars().count() + usize::from(needs_space) > max_chars
                && !current.is_empty()
            {
                output.push(current);
                current = String::new();
            }
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
        }
        output.push(current);
    }
    if output.is_empty() {
        output.push(String::new());
    }
    output
}

fn pdf_page_stream(lines: &[String]) -> Vec<u8> {
    let mut stream = Vec::from("BT /F1 11 Tf 48 790 Td 14 TL ".as_bytes());
    for (index, line) in lines.iter().enumerate() {
        if index > 0 {
            stream.extend_from_slice(b"T* ");
        }
        stream.push(b'(');
        stream.extend_from_slice(&escape_pdf_text_bytes(line));
        stream.extend_from_slice(b") Tj ");
    }
    stream.extend_from_slice(b"ET");
    stream
}

fn escape_pdf_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

fn escape_pdf_text_bytes(value: &str) -> Vec<u8> {
    let (encoded, _, _) = WINDOWS_1252.encode(value);
    let mut output = Vec::new();
    for byte in encoded.as_ref() {
        match *byte {
            b'\\' | b'(' | b')' => {
                output.push(b'\\');
                output.push(*byte);
            }
            b'\n' => output.extend_from_slice(b"\\n"),
            b'\r' => output.extend_from_slice(b"\\r"),
            b'\t' => output.extend_from_slice(b"\\t"),
            0x20..=0x7e => output.push(*byte),
            other => output.extend_from_slice(format!("\\{:03o}", other).as_bytes()),
        }
    }
    output
}

fn to_plain_text(content: &str, source_format: &str) -> String {
    if source_format == "html" {
        html_to_visible_text(content)
    } else {
        content.to_string()
    }
}

fn html_to_visible_text(content: &str) -> String {
    let mut cleaned = content.to_string();
    for tag in ["head", "script", "style", "noscript"] {
        loop {
            let lower = cleaned.to_ascii_lowercase();
            let Some(start) = lower.find(&format!("<{tag}")) else {
                break;
            };
            let Some(rel_end) = lower[start..].find(&format!("</{tag}>")) else {
                break;
            };
            let end = start + rel_end + tag.len() + 3;
            cleaned.replace_range(start..end, "");
        }
    }
    cleaned = cleaned
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</p>", "\n")
        .replace("</div>", "\n")
        .replace("</li>", "\n")
        .replace("</tr>", "\n");
    html_escape::decode_html_entities(&cleaned.replace_xml_tags())
        .replace('\u{a0}', " ")
        .split('\n')
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn to_markdown(content: &str, source_format: &str) -> String {
    to_plain_text(content, source_format)
}

fn to_html(content: &str, source_format: &str) -> String {
    if source_format == "html" {
        return content.to_string();
    }
    let paragraphs = escape_html(content)
        .split("\n\n")
        .map(|paragraph| format!("<p>{}</p>", paragraph.replace('\n', "<br>")))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "<!doctype html>\n<html lang=\"fr\">\n<head><meta charset=\"utf-8\"><title>Document</title></head>\n<body>\n{}\n</body>\n</html>\n",
        paragraphs
    )
}

fn to_csv(content: &str, source_format: &str) -> String {
    if source_format == "csv" {
        return content.to_string();
    }
    content
        .lines()
        .map(|line| format!("\"{}\"", line.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join("\n")
}

fn write_utf8_csv(output_path: &Path, content: &str) -> Result<()> {
    let mut file = File::create(output_path)?;
    file.write_all(b"\xef\xbb\xbf")?;
    file.write_all(content.as_bytes())?;
    Ok(())
}

fn to_rtf(content: &str, source_format: &str) -> String {
    let text = escape_rtf_text(&to_plain_text(content, source_format));
    format!(
        "{{\\rtf1\\ansi\\ansicpg1252\\deff0\n{{\\fonttbl{{\\f0 Calibri;}}}}\n\\f0\\fs22\n{}\n}}\n",
        text
    )
}

fn escape_rtf_text(value: &str) -> String {
    let mut output = String::new();
    for ch in value.chars() {
        match ch {
            '\\' => output.push_str("\\\\"),
            '{' => output.push_str("\\{"),
            '}' => output.push_str("\\}"),
            '\n' => output.push_str("\\par\n"),
            '\r' => {}
            '\t' => output.push_str("\\tab "),
            ch if ch.is_ascii() => output.push(ch),
            ch => {
                let mut units = [0u16; 2];
                for unit in ch.encode_utf16(&mut units) {
                    output.push_str(&format!("\\u{}?", *unit as i16));
                }
            }
        }
    }
    output
}

fn to_json(content: &str, source_format: &str) -> Result<String> {
    if source_format == "json" {
        let value: serde_json::Value = serde_json::from_str(content)?;
        return Ok(serde_json::to_string_pretty(&value)?);
    }
    if source_format == "csv" {
        let mut reader = csv::ReaderBuilder::new()
            .flexible(true)
            .from_reader(content.as_bytes());
        let headers = reader
            .headers()?
            .iter()
            .enumerate()
            .map(|(index, header)| {
                let trimmed = header.trim();
                if trimmed.is_empty() {
                    format!("col{}", index + 1)
                } else {
                    trimmed.to_string()
                }
            })
            .collect::<Vec<_>>();
        let mut rows = Vec::new();
        for record in reader.records() {
            let record = record?;
            let mut object = serde_json::Map::new();
            for (index, cell) in record.iter().enumerate() {
                object.insert(
                    headers
                        .get(index)
                        .cloned()
                        .unwrap_or_else(|| format!("col{}", index + 1)),
                    serde_json::Value::String(cell.trim().to_string()),
                );
            }
            rows.push(serde_json::Value::Object(object));
        }
        return Ok(serde_json::to_string_pretty(&rows)?);
    }
    Ok(serde_json::to_string_pretty(
        &serde_json::json!({ "content": content }),
    )?)
}

fn to_xml(content: &str, source_format: &str) -> String {
    if source_format == "xml" {
        return content.to_string();
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<document>\n  <content>{}</content>\n</document>\n",
        escape_xml(content)
    )
}

fn write_docx(output_path: &Path, content: &str, source_format: &str) -> Result<()> {
    let mut zip = zip::ZipWriter::new(File::create(output_path)?);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let paragraphs = to_plain_text(content, source_format)
        .lines()
        .map(|line| {
            format!(
                "<w:p><w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
                escape_xml(line)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    zip.start_file("[Content_Types].xml", options)?;
    zip.write_all(b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>")?;
    zip.add_directory("_rels/", options)?;
    zip.start_file("_rels/.rels", options)?;
    zip.write_all(b"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>")?;
    zip.add_directory("word/", options)?;
    zip.start_file("word/document.xml", options)?;
    zip.write_all(format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>{}<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/></w:sectPr></w:body></w:document>", paragraphs).as_bytes())?;
    zip.finish()?;
    Ok(())
}

fn write_odt(output_path: &Path, content: &str, source_format: &str) -> Result<()> {
    let mut zip = zip::ZipWriter::new(File::create(output_path)?);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let paragraphs = to_plain_text(content, source_format)
        .lines()
        .map(|line| format!("<text:p>{}</text:p>", escape_xml(line)))
        .collect::<Vec<_>>()
        .join("");
    zip.start_file("mimetype", stored)?;
    zip.write_all(b"application/vnd.oasis.opendocument.text")?;
    zip.add_directory("META-INF/", deflated)?;
    zip.start_file("META-INF/manifest.xml", deflated)?;
    zip.write_all(b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><manifest:manifest xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"><manifest:file-entry manifest:media-type=\"application/vnd.oasis.opendocument.text\" manifest:full-path=\"/\"/><manifest:file-entry manifest:media-type=\"text/xml\" manifest:full-path=\"content.xml\"/></manifest:manifest>")?;
    zip.start_file("content.xml", deflated)?;
    zip.write_all(format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><office:document-content xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" office:version=\"1.2\"><office:body><office:text>{}</office:text></office:body></office:document-content>", paragraphs).as_bytes())?;
    zip.finish()?;
    Ok(())
}

fn write_epub(output_path: &Path, content: &str, source_format: &str) -> Result<()> {
    let mut zip = zip::ZipWriter::new(File::create(output_path)?);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let html = to_html(content, source_format).replace("<!doctype html>", "");
    let identifier = format!("urn:uuid:{}", uuid::Uuid::new_v4());
    zip.start_file("mimetype", stored)?;
    zip.write_all(b"application/epub+zip")?;
    zip.add_directory("META-INF/", deflated)?;
    zip.start_file("META-INF/container.xml", deflated)?;
    zip.write_all(b"<?xml version=\"1.0\"?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>")?;
    zip.add_directory("OEBPS/", deflated)?;
    zip.start_file("OEBPS/chapter.xhtml", deflated)?;
    zip.write_all(format!("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n{}", html).as_bytes())?;
    zip.start_file("OEBPS/content.opf", deflated)?;
    zip.write_all(format!("<?xml version=\"1.0\" encoding=\"utf-8\"?><package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"bookid\"><metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:identifier id=\"bookid\">{}</dc:identifier><dc:title>Document</dc:title><dc:language>fr</dc:language></metadata><manifest><item id=\"chapter\" href=\"chapter.xhtml\" media-type=\"application/xhtml+xml\"/></manifest><spine><itemref idref=\"chapter\"/></spine></package>", identifier).as_bytes())?;
    zip.finish()?;
    Ok(())
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_encodings_decode_utf8_utf16_and_windows_1252() {
        assert_eq!(decode_text_buffer(b"\xef\xbb\xbfbonjour"), "bonjour");
        assert_eq!(decode_text_buffer(&[0xff, 0xfe, b'o', 0, b'k', 0]), "ok");
        assert_eq!(decode_text_buffer(&[b'o', 0, b'k', 0]), "ok");
        assert_eq!(decode_text_buffer(&[0xE9]), "é");
    }

    #[test]
    fn rtf_output_preserves_non_ascii_text() {
        let rtf = to_rtf("J’ai déposé un fichier aperçu façade.", "txt");
        assert!(rtf.contains("\\ansicpg1252"));
        assert!(rtf.contains("\\u8217?"));
        assert!(rtf.contains("\\u233?"));
        assert!(rtf.contains("\\u231?"));
        assert!(!rtf.contains("Jâ"));
    }

    #[test]
    fn rtf_reader_decodes_hex_and_unicode_escapes() {
        assert_eq!(strip_rtf("{\\rtf1\\ansi caf\\'e9 \\u233?}"), "café é");
    }

    #[test]
    fn document_serializers_include_source_content() {
        let content = "PDFTEXTMARKERPAGEONE2026\nPDFTEXTMARKERPAGETWO2026";
        assert!(to_html(content, "txt").contains("PDFTEXTMARKERPAGEONE2026"));
        assert!(to_rtf(content, "txt").contains("PDFTEXTMARKERPAGETWO2026"));
        assert!(
            to_json(content, "txt")
                .unwrap()
                .contains("PDFTEXTMARKERPAGEONE2026")
        );
        assert!(to_xml(content, "txt").contains("PDFTEXTMARKERPAGETWO2026"));
    }

    #[test]
    #[ignore = "full conversion matrix is run by npm run test:conversions"]
    fn conversion_matrix_document_outputs_preserve_french_characters() {
        let source_formats = [
            "pdf", "txt", "md", "html", "csv", "json", "xml", "rtf", "docx", "odt", "epub",
        ];
        let marker = "J’ai déjà testé façade, coût, Noël, élève, cœur et €.";

        for source_format in source_formats {
            let dir = tempfile::tempdir().unwrap();
            let input = dir.path().join(format!(
                "source.{}",
                extension_for_test_source(source_format)
            ));
            write_document_fixture(&input, source_format, marker);
            let source_content = read_document_text(&input, source_format).unwrap();
            assert_text_is_clean(&source_content, source_format, "read");

            for target in crate::registry::get_targets_for_extension(source_format)
                .into_iter()
                .filter(|target| target.category_id == "documents")
            {
                let output = dir.path().join(format!(
                    "{}-to-{}.{}",
                    source_format, target.format, target.extension
                ));
                write_document_target(
                    &output,
                    source_format,
                    &target.format,
                    &source_content,
                    marker,
                );
                let readable = read_document_target(&output, &target.format);
                assert_text_is_clean(&readable, source_format, &format!("to {}", target.format));
            }
        }
    }

    #[test]
    fn csv_outputs_are_utf8_bom_tagged_for_spreadsheet_detection() {
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("accented.csv");
        let content = to_csv("J’ai déjà testé façade.", "txt");

        write_utf8_csv(&output, &content).unwrap();

        let bytes = fs::read(&output).unwrap();
        assert!(bytes.starts_with(b"\xef\xbb\xbf"));
        let decoded = decode_text_buffer(&bytes);
        assert!(decoded.contains("J’ai déjà testé façade."));
        assert!(!decoded.contains("Jâ"));
        assert!(!decoded.contains("Ã"));
    }

    #[test]
    fn csv_to_json_handles_quoted_commas() {
        let json = to_json("name,note\nAlice,\"un, deux\"\nBob,\"trois\"", "csv").unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(value[0]["name"], "Alice");
        assert_eq!(value[0]["note"], "un, deux");
        assert_eq!(value[1]["note"], "trois");
    }

    fn extension_for_test_source(source_format: &str) -> &'static str {
        match source_format {
            "jpg" => "jpg",
            "gif" => "gif",
            "svg" => "svg",
            "webp" => "webp",
            "tiff" => "tiff",
            "bmp" => "bmp",
            "ico" => "ico",
            "mp3" => "mp3",
            "m4a" => "m4a",
            "flac" => "flac",
            "wav" => "wav",
            "ogg" => "ogg",
            "wma" => "wma",
            "opus" => "opus",
            "aiff" => "aiff",
            "alac" => "alac",
            "ac3" => "ac3",
            "mp2" => "mp2",
            "amr" => "amr",
            "au" => "au",
            "caf" => "caf",
            "mp4" => "mp4",
            "mkv" => "mkv",
            "webm" => "webm",
            "mov" => "mov",
            "avi" => "avi",
            "wmv" => "wmv",
            "3gp" => "3gp",
            "mts" => "mts",
            "mpeg2" => "mpg",
            "ogv" => "ogv",
            "md" => "md",
            "html" => "html",
            "csv" => "csv",
            "json" => "json",
            "xml" => "xml",
            "rtf" => "rtf",
            "docx" => "docx",
            "odt" => "odt",
            "epub" => "epub",
            "pdf" => "pdf",
            _ => "txt",
        }
    }

    fn write_image_fixture(path: &Path, source_format: &str) {
        if source_format == "gif" {
            fs::write(path, one_frame_gif()).unwrap();
            return;
        }
        if source_format == "svg" {
            fs::write(
                path,
                r##"<svg xmlns="http://www.w3.org/2000/svg" width="12" height="10"><rect width="12" height="10" fill="#f97316"/><circle cx="7" cy="5" r="3" fill="#111827"/></svg>"##,
            )
            .unwrap();
            return;
        }

        let image = image::DynamicImage::ImageRgba8(image::RgbaImage::from_fn(12, 10, |x, y| {
            image::Rgba([
                (x * 17) as u8,
                (y * 19) as u8,
                120,
                if (x + y) % 3 == 0 { 180 } else { 255 },
            ])
        }));
        let fixture = if source_format == "ico" {
            fit_ico_image(image)
        } else {
            image
        };
        fixture
            .write_to(
                &mut File::create(path).unwrap(),
                image_format_for_target(source_format).unwrap(),
            )
            .unwrap();
    }

    fn read_test_image(path: &Path, source_format: &str) -> image::DynamicImage {
        if source_format == "svg" {
            read_svg_image(path).unwrap()
        } else {
            image::ImageReader::open(path)
                .unwrap()
                .with_guessed_format()
                .unwrap()
                .decode()
                .unwrap()
        }
    }

    fn write_document_fixture(path: &Path, source_format: &str, marker: &str) {
        match source_format {
            "pdf" => fs::write(path, simple_pdf("source.pdf", marker)).unwrap(),
            "html" => fs::write(path, to_html(marker, "txt")).unwrap(),
            "csv" => write_utf8_csv(path, &format!("titre,note\nfixture,\"{}\"", marker)).unwrap(),
            "json" => fs::write(
                path,
                serde_json::to_string_pretty(&serde_json::json!({ "note": marker })).unwrap(),
            )
            .unwrap(),
            "xml" => fs::write(
                path,
                format!(
                    "<?xml version=\"1.0\" encoding=\"utf-8\"?><document><note>{}</note></document>",
                    escape_xml(marker)
                ),
            )
            .unwrap(),
            "rtf" => fs::write(path, to_rtf(marker, "txt")).unwrap(),
            "docx" => write_docx(path, marker, "txt").unwrap(),
            "odt" => write_odt(path, marker, "txt").unwrap(),
            "epub" => write_epub(path, marker, "txt").unwrap(),
            _ => fs::write(path, marker).unwrap(),
        }
    }

    fn write_document_target(
        path: &Path,
        source_format: &str,
        target_format: &str,
        content: &str,
        marker: &str,
    ) {
        match target_format {
            "txt" => fs::write(path, to_plain_text(content, source_format)).unwrap(),
            "md" => fs::write(path, to_markdown(content, source_format)).unwrap(),
            "html" => fs::write(path, to_html(content, source_format)).unwrap(),
            "rtf" => fs::write(path, to_rtf(content, source_format)).unwrap(),
            "csv" => write_utf8_csv(path, &to_csv(content, source_format)).unwrap(),
            "json" => fs::write(path, to_json(content, source_format).unwrap()).unwrap(),
            "xml" => fs::write(path, to_xml(content, source_format)).unwrap(),
            "docx" => write_docx(path, content, source_format).unwrap(),
            "odt" => write_odt(path, content, source_format).unwrap(),
            "epub" => write_epub(path, content, source_format).unwrap(),
            "pdf" => fs::write(path, simple_pdf("target.pdf", marker)).unwrap(),
            other => panic!("unsupported target in test: {other}"),
        }
    }

    fn read_document_target(path: &Path, target_format: &str) -> String {
        match target_format {
            "pdf" => pdf_extract::extract_text(path).unwrap(),
            "docx" | "odt" | "epub" | "html" | "rtf" => {
                read_document_text(path, target_format).unwrap()
            }
            _ => decode_text_buffer(&fs::read(path).unwrap()),
        }
    }

    fn assert_text_is_clean(value: &str, source_format: &str, phase: &str) {
        for bad in ["Jâ", "dÃ", "Ã©", "Ã¨", "Ã§", "Â", "\u{fffd}"] {
            assert!(
                !value.contains(bad),
                "{source_format} {phase} produced mojibake marker {bad:?}: {value:?}"
            );
        }
    }

    #[test]
    #[ignore = "full conversion matrix is run by npm run test:conversions"]
    fn conversion_matrix_image_png_to_webp_fixture() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("pixel.png");
        let output = dir.path().join("pixel.webp");
        let image = image::DynamicImage::new_rgba8(8, 8);

        image
            .write_to(&mut File::create(&input).unwrap(), ImageFormat::Png)
            .unwrap();
        image
            .write_to(&mut File::create(&output).unwrap(), ImageFormat::WebP)
            .unwrap();

        let decoded = image::ImageReader::open(&output)
            .unwrap()
            .with_guessed_format()
            .unwrap()
            .decode()
            .unwrap();
        assert_eq!(decoded.width(), 8);
        assert_eq!(decoded.height(), 8);
    }

    #[test]
    #[ignore = "full conversion matrix is run by npm run test:conversions"]
    fn conversion_matrix_all_integrated_image_targets_decode() {
        let source_formats = ["png", "jpg", "gif", "svg", "webp", "tiff", "bmp", "ico"];

        for source_format in source_formats {
            let dir = tempfile::tempdir().unwrap();
            let input = dir.path().join(format!(
                "source.{}",
                extension_for_test_source(source_format)
            ));
            write_image_fixture(&input, source_format);
            for target in crate::registry::get_targets_for_extension(source_format)
                .into_iter()
                .filter(|target| target.category_id == "images")
            {
                let output = dir.path().join(format!(
                    "{}-to-{}.{}",
                    source_format, target.format, target.extension
                ));
                let image = read_integrated_image(&input).unwrap_or_else(|error| {
                    panic!(
                        "{source_format} input failed to decode through app image reader: {error}"
                    )
                });
                write_integrated_image(&output, image, &target.format).unwrap_or_else(|error| {
                    panic!(
                        "{} -> {} failed through app image writer: {}",
                        source_format, target.format, error
                    )
                });

                let decoded = image::ImageReader::open(&output)
                    .unwrap()
                    .with_guessed_format()
                    .unwrap()
                    .decode()
                    .unwrap_or_else(|error| {
                        panic!(
                            "{} -> {} produced unreadable output: {}",
                            source_format, target.format, error
                        )
                    });
                assert!(decoded.width() > 0);
                assert!(decoded.height() > 0);
            }
        }
    }

    #[test]
    #[ignore = "full conversion matrix is run by npm run test:conversions"]
    fn conversion_matrix_text_to_pdf_fixture() {
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("fixture.pdf");
        let source = "Fixture texte Multi-Converter 2026\nDeuxième ligne accentuée.";

        fs::write(&output, simple_pdf("fixture.txt", source)).unwrap();

        let extracted = pdf_extract::extract_text(&output).unwrap();
        assert!(extracted.contains("Fixture texte Multi-Converter 2026"));
        assert!(extracted.contains("Deuxième ligne accentuée"));
    }

    #[test]
    #[ignore = "full conversion matrix is run by npm run test:conversions"]
    fn conversion_matrix_all_ffmpeg_audio_targets_probe() {
        let dir = tempfile::tempdir().unwrap();

        for source_format in ffmpeg_audio_test_sources() {
            let input = dir.path().join(format!(
                "source-{}.{}",
                source_format,
                extension_for_test_source(source_format)
            ));
            generate_audio_fixture(&input, source_format);
            assert_media_file_is_probeable(&input, source_format);

            for target in crate::registry::get_targets_for_extension(source_format)
                .into_iter()
                .filter(|target| target.engine == "ffmpeg" && target.category_id == "audio")
            {
                let output = dir.path().join(format!(
                    "{}-to-{}.{}",
                    source_format, target.format, target.extension
                ));
                let args = audio_args(&target.format).unwrap_or_else(|error| {
                    panic!(
                        "{} -> {} is exposed but has no FFmpeg audio args: {}",
                        source_format, target.format, error
                    )
                });

                run_ffmpeg_conversion(&input, &output, args);
                assert_media_file_is_probeable(
                    &output,
                    &format!("{} -> {}", source_format, target.format),
                );
            }
        }
    }

    #[test]
    #[ignore = "full conversion matrix is run by npm run test:conversions"]
    fn conversion_matrix_all_ffmpeg_video_and_extraction_targets_probe() {
        let source_formats = [
            "mp4", "mkv", "webm", "mov", "avi", "wmv", "3gp", "mts", "mpeg2", "ogv",
        ];
        let dir = tempfile::tempdir().unwrap();

        for source_format in source_formats {
            let input = dir.path().join(format!(
                "source-{}.{}",
                source_format,
                extension_for_test_source(source_format)
            ));
            generate_video_fixture(&input, source_format);
            assert_media_file_is_probeable(&input, source_format);

            for target in crate::registry::get_targets_for_extension(source_format)
                .into_iter()
                .filter(|target| target.engine == "ffmpeg")
            {
                let output = dir.path().join(format!(
                    "{}-to-{}.{}",
                    source_format, target.format, target.extension
                ));

                if target.category_id == "audio" {
                    let args = audio_args(&target.format).unwrap_or_else(|error| {
                        panic!(
                            "{} -> {} is exposed but has no FFmpeg audio args: {}",
                            source_format, target.format, error
                        )
                    });
                    run_ffmpeg_conversion(&input, &output, args);
                } else {
                    let args = cpu_video_args(&target.format).unwrap_or_else(|error| {
                        panic!(
                            "{} -> {} is exposed but has no FFmpeg video args: {}",
                            source_format, target.format, error
                        )
                    });
                    run_ffmpeg_conversion(&input, &output, args);
                }

                assert_media_file_is_probeable(
                    &output,
                    &format!("{} -> {}", source_format, target.format),
                );
            }
        }
    }

    fn generate_audio_fixture(path: &Path, source_format: &str) {
        let mut args = vec![
            "-y".to_string(),
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-f".to_string(),
            "lavfi".to_string(),
            "-i".to_string(),
            "sine=frequency=880:duration=0.18".to_string(),
        ];
        args.extend(
            audio_args(source_format)
                .unwrap()
                .into_iter()
                .map(str::to_string),
        );
        args.push(path.to_string_lossy().to_string());

        run_ffmpeg_args(&args, &format!("fixture audio {source_format}"));
    }

    fn ffmpeg_audio_test_sources() -> Vec<&'static str> {
        [
            "mp3", "m4a", "flac", "wav", "ogg", "wma", "opus", "aiff", "alac", "ac3", "mp2", "amr",
            "au", "caf",
        ]
        .into_iter()
        .filter(|source_format| {
            crate::registry::get_targets_for_extension(source_format)
                .into_iter()
                .any(|target| target.engine == "ffmpeg" && target.category_id == "audio")
        })
        .collect()
    }

    fn generate_video_fixture(path: &Path, source_format: &str) {
        let mut args = vec![
            "-y".to_string(),
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-f".to_string(),
            "lavfi".to_string(),
            "-i".to_string(),
            "testsrc2=size=96x64:rate=12:duration=0.18".to_string(),
            "-f".to_string(),
            "lavfi".to_string(),
            "-i".to_string(),
            "sine=frequency=440:duration=0.18".to_string(),
            "-shortest".to_string(),
        ];
        args.extend(cpu_video_args(source_format).unwrap());
        args.push("-threads".to_string());
        args.push("1".to_string());
        args.push(path.to_string_lossy().to_string());

        run_ffmpeg_args(&args, &format!("fixture video {source_format}"));
    }

    fn run_ffmpeg_conversion<T: AsRef<str>>(input: &Path, output: &Path, codec_args: Vec<T>) {
        let mut args = vec![
            "-y".to_string(),
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-i".to_string(),
            input.to_string_lossy().to_string(),
        ];
        args.extend(codec_args.into_iter().map(|item| item.as_ref().to_string()));
        args.push("-threads".to_string());
        args.push("1".to_string());
        args.push(output.to_string_lossy().to_string());

        run_ffmpeg_args(
            &args,
            &format!("{} -> {}", input.display(), output.display()),
        );
    }

    fn run_ffmpeg_args(args: &[String], context: &str) {
        let mut command = Command::new(ffmpeg_test_path());
        hide_command_window(&mut command);
        let output = command.args(args).output().unwrap_or_else(|error| {
            panic!("FFmpeg could not start for {context}: {error}");
        });
        assert!(
            output.status.success(),
            "FFmpeg failed for {context}: stdout={} stderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn assert_media_file_is_probeable(path: &Path, context: &str) {
        let mut command = Command::new(ffprobe_test_path());
        hide_command_window(&mut command);
        let output = command
            .args([
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
            ])
            .arg(path)
            .output()
            .unwrap_or_else(|error| {
                panic!("ffprobe could not start for {context}: {error}");
            });
        let duration = String::from_utf8_lossy(&output.stdout);
        assert!(
            output.status.success()
                && duration
                    .trim()
                    .parse::<f64>()
                    .is_ok_and(|value| value.is_finite() && value > 0.0),
            "ffprobe rejected {context} at {}: stdout={} stderr={}",
            path.display(),
            duration,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn ffmpeg_test_path() -> PathBuf {
        sidecar_test_path("ffmpeg", "FFmpeg")
    }

    fn ffprobe_test_path() -> PathBuf {
        sidecar_test_path("ffprobe", "ffprobe")
    }

    fn sidecar_test_path(stem: &str, label: &str) -> PathBuf {
        let binaries_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
        let candidates = sidecar_test_names(stem);
        for name in &candidates {
            let path = binaries_dir.join(name);
            if path.exists() {
                return path;
            }
        }
        panic!(
            "{label} test binary is missing in {}. Tried: {}",
            binaries_dir.display(),
            candidates.join(", ")
        );
    }

    fn sidecar_test_names(stem: &str) -> Vec<String> {
        if cfg!(target_os = "windows") {
            return vec![format!("{stem}-x86_64-pc-windows-msvc.exe")];
        }
        if cfg!(target_os = "macos") {
            let native = if cfg!(target_arch = "aarch64") {
                "aarch64-apple-darwin"
            } else {
                "x86_64-apple-darwin"
            };
            return vec![
                format!("{stem}-universal-apple-darwin"),
                format!("{stem}-{native}"),
            ];
        }
        let native = if cfg!(target_arch = "aarch64") {
            "aarch64-unknown-linux-gnu"
        } else {
            "x86_64-unknown-linux-gnu"
        };
        vec![format!("{stem}-{native}")]
    }

    #[test]
    fn hidden_backend_targets_are_not_supported_directly() {
        assert!(audio_args("dts").is_err());
        for target in ["flv", "vob", "avchd", "divx", "xvid", "mxf"] {
            assert!(cpu_video_args(target).is_err());
        }
        assert!(image_format_for_target("avif").is_err());
    }

    #[test]
    fn pdf_text_stream_uses_winansi_not_raw_utf8() {
        let escaped = escape_pdf_text_bytes("J’ai déposé un fichier aperçu façade.");
        let escaped_text = String::from_utf8(escaped).unwrap();

        assert!(escaped_text.contains("\\222"));
        assert!(escaped_text.contains("\\351"));
        assert!(escaped_text.contains("\\347"));
        assert!(!escaped_text.contains("â"));
    }

    #[test]
    fn generated_pdf_extracts_french_text_correctly() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("accented.pdf");
        let source = "J’ai refondu l’interface en parcours intelligent en 3 étapes.\nDéposer un ou plusieurs fichiers.\naperçu navigateur OK";
        fs::write(&path, simple_pdf("accented.txt", source)).unwrap();

        let extracted = pdf_extract::extract_text(&path).unwrap();
        assert!(extracted.contains("J’ai refondu l’interface"));
        assert!(extracted.contains("3 étapes"));
        assert!(extracted.contains("Déposer"));
        assert!(!extracted.contains("Jâ"));
    }

    #[test]
    fn generated_pdf_keeps_content_after_first_page() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("multipage.pdf");
        let source = (1..=140)
            .map(|index| format!("Ligne PDF longue {}", index))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&path, simple_pdf("multipage.txt", &source)).unwrap();

        let extracted = pdf_extract::extract_text(&path).unwrap();
        assert!(extracted.contains("Ligne PDF longue 1"));
        assert!(extracted.contains("Ligne PDF longue 80"));
        assert!(extracted.contains("Ligne PDF longue 140"));
    }

    #[test]
    fn ico_output_is_limited_to_supported_dimensions() {
        let image = image::DynamicImage::new_rgba8(2560, 1440);
        let icon = fit_ico_image(image);

        assert!(icon.width() <= 256);
        assert!(icon.height() <= 256);
        assert_eq!(icon.width(), icon.height());
        assert!(icon.width() >= 1);
        assert!(icon.height() >= 1);

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("large.ico");
        write_windows_ico(&path, icon).unwrap();
        assert_windows_accepts_icon(&path);
    }

    #[test]
    fn png_to_ico_outputs_square_rgba_icon() {
        let image = image::DynamicImage::ImageRgb8(image::RgbImage::new(512, 128));
        let icon = fit_ico_image(image);

        assert_eq!(icon.width(), 256);
        assert_eq!(icon.height(), 256);
        assert!(matches!(icon, image::DynamicImage::ImageRgba8(_)));

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("wide.ico");
        write_windows_ico(&path, icon).unwrap();
        assert_windows_accepts_icon(&path);

        let decoded = image::ImageReader::open(path)
            .unwrap()
            .with_guessed_format()
            .unwrap()
            .decode()
            .unwrap();
        assert_eq!(decoded.width(), 256);
        assert_eq!(decoded.height(), 256);
    }

    #[test]
    fn all_image_sources_to_ico_are_windows_compatible() {
        for source_format in ["png", "jpg", "gif", "svg", "webp", "tiff", "bmp", "ico"] {
            let dir = tempfile::tempdir().unwrap();
            let input = dir.path().join(format!(
                "source.{}",
                extension_for_test_source(source_format)
            ));
            let output = dir.path().join(format!("{source_format}.ico"));
            write_image_fixture(&input, source_format);

            write_windows_ico(&output, read_test_image(&input, source_format)).unwrap();
            assert_windows_accepts_icon(&output);
        }
    }

    #[test]
    fn static_gif_converts_to_decodable_png_and_windows_ico() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("static.gif");
        fs::write(&input, one_frame_gif()).unwrap();

        for target_format in ["png", "ico"] {
            let output = dir.path().join(format!("static.{target_format}"));
            let image = read_integrated_image(&input)
                .unwrap_or_else(|error| panic!("GIF fixture should decode: {error}"));
            write_integrated_image(&output, image, target_format)
                .unwrap_or_else(|error| panic!("GIF -> {target_format} should encode: {error}"));

            let decoded = image::ImageReader::open(&output)
                .unwrap()
                .with_guessed_format()
                .unwrap()
                .decode()
                .unwrap_or_else(|error| {
                    panic!("GIF -> {target_format} output should decode: {error}")
                });
            assert!(decoded.width() > 0);
            assert!(decoded.height() > 0);
            if target_format == "ico" {
                assert_windows_accepts_icon(&output);
            }
        }
    }

    #[test]
    fn svg_selected_engine_converts_to_decodable_gif() {
        let svg = crate::registry::get_format_by_id("svg").unwrap();
        let gif = crate::registry::get_format_by_id("gif").unwrap();
        let selected = crate::engines::select_engine(None, &svg, gif.id, gif.category_id, "image");
        assert_eq!(selected.id, "resvg");

        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("source.svg");
        let output = dir.path().join("source.gif");
        write_image_fixture(&input, "svg");

        let image = read_integrated_image(&input)
            .unwrap_or_else(|error| panic!("SVG fixture should render: {error}"));
        write_integrated_image(&output, image, "gif")
            .unwrap_or_else(|error| panic!("SVG -> GIF should encode: {error}"));

        let decoded = image::ImageReader::open(&output)
            .unwrap()
            .with_guessed_format()
            .unwrap()
            .decode()
            .unwrap_or_else(|error| panic!("SVG -> GIF output should decode: {error}"));
        assert!(decoded.width() > 0);
        assert!(decoded.height() > 0);
    }

    #[test]
    fn pdf_text_can_write_rich_document_targets_without_libreoffice() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("source.pdf");
        let marker = "PDF vers document riche sans LibreOffice 2026.";
        fs::write(&input, simple_pdf("source.pdf", marker)).unwrap();
        let content = read_document_text(&input, "pdf").unwrap();

        for target_format in ["docx", "odt", "rtf"] {
            let output = dir.path().join(format!("source.{target_format}"));
            write_text_content_file(&output, "pdf", target_format, &content)
                .unwrap_or_else(|error| panic!("PDF -> {target_format} should write: {error}"));
            let readable = read_document_target(&output, target_format);
            assert!(
                readable.contains("PDF vers document riche"),
                "PDF -> {target_format} lost extracted text: {readable:?}"
            );
        }
    }

    #[test]
    fn pdf_registry_text_targets_are_writeable_and_readable() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("source.pdf");
        let marker = "PDF registre vers sortie texte complète 2026.";
        fs::write(&input, simple_pdf("source.pdf", marker)).unwrap();
        let content = read_document_text(&input, "pdf").unwrap();

        for target in crate::registry::get_targets_for_extension("pdf")
            .into_iter()
            .filter(|target| target.engine == "text")
        {
            let output = dir
                .path()
                .join(format!("source-to-{}.{}", target.format, target.extension));
            write_text_content_file(&output, "pdf", &target.format, &content).unwrap_or_else(
                |error| {
                    panic!(
                        "PDF registry target {} should write: {error}",
                        target.format
                    )
                },
            );
            assert!(
                output.exists() && output.metadata().unwrap().len() > 0,
                "PDF registry target {} produced no file",
                target.format
            );
            let readable = read_document_target(&output, &target.format);
            assert!(
                readable.contains("PDF registre vers sortie texte"),
                "PDF registry target {} lost extracted text: {readable:?}",
                target.format
            );
        }
    }

    #[test]
    fn missing_source_file_returns_actionable_conversion_error() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("missing.gif");
        let error = ensure_source_file_available(&missing)
            .unwrap_err()
            .to_string();

        assert!(error.contains("fichier source est introuvable"));
        assert!(error.contains("Réimportez"));
        assert!(!error.contains("os error 2"));
    }

    #[test]
    fn gif_animation_detection_counts_image_frames() {
        let dir = tempfile::tempdir().unwrap();
        let static_gif = dir.path().join("static.gif");
        let animated_gif = dir.path().join("animated.gif");
        fs::write(&static_gif, one_frame_gif()).unwrap();
        fs::write(&animated_gif, two_frame_gif()).unwrap();

        assert!(!gif_is_animated(&static_gif).unwrap());
        assert!(gif_is_animated(&animated_gif).unwrap());
    }

    #[test]
    fn static_gif_is_described_as_image_targets() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("static.gif");
        fs::write(&input, one_frame_gif()).unwrap();

        let description = describe_file_with_app(None, &input).unwrap();
        let targets = description
            .targets
            .into_iter()
            .map(|target| target.format)
            .collect::<Vec<_>>();

        assert_eq!(description.category_id, "images");
        assert!(targets.contains(&"png".to_string()));
        assert!(targets.contains(&"webp".to_string()));
        assert!(!targets.contains(&"mp4".to_string()));
    }

    #[test]
    fn animated_gif_is_described_as_video_targets() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("animated.gif");
        fs::write(&input, two_frame_gif()).unwrap();

        let description = describe_file_with_app(None, &input).unwrap();
        let targets = description
            .targets
            .into_iter()
            .map(|target| target.format)
            .collect::<Vec<_>>();

        assert_eq!(description.category_id, "video");
        assert!(targets.contains(&"mp4".to_string()));
        assert!(targets.contains(&"webm".to_string()));
        assert!(!targets.contains(&"png".to_string()));
    }

    #[cfg(target_os = "windows")]
    fn assert_windows_accepts_icon(path: &Path) {
        let script = format!(
            "Add-Type -AssemblyName System.Drawing; $icon=[System.Drawing.Icon]::new('{}'); if ($icon.Width -le 0 -or $icon.Height -le 0) {{ exit 2 }}; $icon.Dispose()",
            path.to_string_lossy().replace('\'', "''")
        );
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "Windows rejected icon {}: stdout={} stderr={}",
            path.display(),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[cfg(not(target_os = "windows"))]
    fn assert_windows_accepts_icon(_path: &Path) {}

    #[test]
    fn integrated_image_dimensions_are_bounded() {
        assert!(ensure_image_dimensions(8000, 8000, "image").is_ok());
        assert!(ensure_image_dimensions(MAX_INTEGRATED_IMAGE_DIMENSION + 1, 10, "image").is_err());
        assert!(ensure_image_dimensions(20_000, 20_000, "image").is_err());
        assert!(ensure_image_dimensions(0, 100, "image").is_err());
    }

    #[test]
    fn extracted_document_text_budget_is_bounded() {
        assert!(ensure_extracted_text_budget(MAX_EXTRACTED_TEXT_BYTES, "document").is_ok());
        assert!(ensure_extracted_text_budget(MAX_EXTRACTED_TEXT_BYTES + 1, "document").is_err());
    }

    #[test]
    fn ffmpeg_progress_log_keeps_bounded_tail() {
        let mut log = String::new();
        for index in 0..10_000 {
            append_limited_log(
                &mut log,
                &format!("line-{index:05}-abcdefghijklmnopqrstuvwxyz"),
            );
        }

        assert!(log.chars().count() <= MAX_FFMPEG_PROGRESS_LOG_CHARS + "[sortie tronquée]\n".len());
        assert!(log.contains("sortie tronquée"));
        assert!(log.contains("line-09999"));
        assert!(!log.contains("line-00000"));
    }

    fn one_frame_gif() -> Vec<u8> {
        let mut bytes = gif_header();
        bytes.extend_from_slice(&gif_frame());
        bytes.push(0x3B);
        bytes
    }

    fn two_frame_gif() -> Vec<u8> {
        let mut bytes = gif_header();
        bytes.extend_from_slice(&gif_frame());
        bytes.extend_from_slice(&gif_frame());
        bytes.push(0x3B);
        bytes
    }

    fn gif_header() -> Vec<u8> {
        vec![
            b'G', b'I', b'F', b'8', b'9', b'a', 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00,
            0x00, 0x00, 0xff, 0xff, 0xff,
        ]
    }

    fn gif_frame() -> Vec<u8> {
        vec![
            0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x4C, 0x01,
            0x00,
        ]
    }

    #[test]
    fn job_output_subfolders_prevent_same_name_collisions() {
        let dir = tempfile::tempdir().unwrap();
        let input_a = dir.path().join("a").join("rapport.txt");
        let input_b = dir.path().join("b").join("rapport.txt");
        let output_a = dir.path().join(safe_path_component("job-a"));
        let output_b = dir.path().join(safe_path_component("job-b"));

        assert_ne!(
            available_output_path(&input_a, &output_a, "pdf"),
            available_output_path(&input_b, &output_b, "pdf")
        );
    }

    #[test]
    fn external_output_already_at_destination_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("test.docx");
        let output = dir.path().join("test.pdf");
        fs::write(&input, b"docx placeholder").unwrap();
        fs::write(&output, b"%PDF placeholder").unwrap();

        move_external_output(&input, dir.path(), &output, "pdf").unwrap();

        assert_eq!(fs::read(&output).unwrap(), b"%PDF placeholder");
    }

    #[test]
    fn queued_cancellation_survives_until_conversion_checks_it() {
        let job_id = "queued-before-start";

        assert!(cancel_conversion(job_id));
        assert!(check_cancelled(job_id).is_err());
        clear_cancelled(job_id);
        assert!(check_cancelled(job_id).is_ok());
    }
}
