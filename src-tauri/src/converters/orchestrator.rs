use super::output::{AtomicOutput, safe_path_component};
use super::*;

pub(crate) fn convert_registered(
    app: &AppHandle,
    job: ConversionJob,
    registration: ActiveConversion,
) -> Result<ConversionResult> {
    if !registration.matches(&job.id) {
        return Err(ConvertError::Message(
            "Identifiant de conversion incohérent.".to_string(),
        ));
    }
    let result = convert_impl(app, job.clone());
    if result.is_err() {
        runtime_log::write(
            "conversion",
            &format!("job {} failed; target={}", job.id, job.target_format),
        );
    }
    result
}

fn convert_impl(app: &AppHandle, job: ConversionJob) -> Result<ConversionResult> {
    let started = std::time::Instant::now();
    if job.input_path.trim().is_empty() || job.target_format.trim().is_empty() {
        return Err(ConvertError::Message("Conversion invalide.".to_string()));
    }
    check_cancelled(&job.id)?;

    let input_path = PathBuf::from(&job.input_path);
    ensure_source_file_available(&input_path)?;
    let input_bytes = fs::metadata(&input_path)?.len();
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
    if job.media_mode == MediaMode::Copy && (engine.id != "ffmpeg" || target.category_id != "video")
    {
        return Err(ConvertError::Message(
            "La copie des flux est réservée aux conteneurs vidéo compatibles.".to_string(),
        ));
    }
    let output_extension = get_targets_for_extension(&extension)
        .into_iter()
        .find(|item| item.format == target.id)
        .map(|item| item.extension)
        .unwrap_or_else(|| target.extension.to_string());
    let final_output_path =
        super::available_output_path(&input_path, &output_dir, &output_extension);
    let staged_output = AtomicOutput::new(&final_output_path)?;
    let output_path = staged_output.path().to_path_buf();

    emit_progress(app, &job.id, 4, "Préparation");
    let _resource_lease =
        resources::for_conversion(&input_path, &engine.id, target.category_id, &job.id)?;
    check_cancelled(&job.id)?;

    let mut warnings = Vec::new();
    if source_format.category_id == "images" && target.category_id == "images" {
        image_conversion::fidelity::ensure_single_image(&input_path)?;
    }
    match engine.id.as_str() {
        "ffmpeg" if job.media_mode == MediaMode::Copy => {
            media::copy_streams(app, &job.id, &input_path, &output_path, target.id)?;
        }
        "ffmpeg" => {
            warnings = media::source_warnings(app, &input_path, target.category_id == "video")?;
            if target.category_id == "video" {
                convert_video(
                    app,
                    &job.id,
                    &input_path,
                    &output_path,
                    target.id,
                    batch_concurrency,
                    job.quality_profile,
                )?;
            } else {
                convert_audio(
                    app,
                    &job.id,
                    &input_path,
                    &output_path,
                    target.id,
                    batch_concurrency,
                    job.quality_profile,
                )?;
            }
        }
        engine_id if uses_integrated_image_pipeline(engine_id) => {
            warnings = convert_image(
                &input_path,
                &output_path,
                target.id,
                job.quality_profile,
                |percent, phase| emit_progress(app, &job.id, percent, phase),
            )?
        }
        "rust-text" | "pdf-extract" | "text" => {
            warnings = convert_text_document(
                app,
                &job.id,
                &input_path,
                &output_path,
                source_format.id,
                target.id,
            )?
        }
        "libreoffice" => {
            warnings = convert_external_document_with_text_fallback(
                ExternalDocumentFallbackContext {
                    app,
                    job_id: &job.id,
                    input_path: &input_path,
                    output_path: &output_path,
                    source_format: source_format.id,
                    target_format: target.id,
                },
                "LibreOffice",
                |app, job_id, input_path, output_path| {
                    convert_with_libreoffice(app, job_id, input_path, output_path, target.id)
                },
            )?
        }
        "pandoc" => {
            warnings = convert_external_document_with_text_fallback(
                ExternalDocumentFallbackContext {
                    app,
                    job_id: &job.id,
                    input_path: &input_path,
                    output_path: &output_path,
                    source_format: source_format.id,
                    target_format: target.id,
                },
                "Pandoc",
                convert_with_pandoc,
            )?
        }
        "pdfium" => convert_with_pdfium(
            app,
            &job.id,
            &input_path,
            &output_path,
            target.id,
            job.quality_profile,
        )?,
        "libvips" => convert_with_libvips(
            app,
            &job.id,
            &input_path,
            &output_path,
            job.quality_profile,
            batch_concurrency,
        )?,
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
    check_cancelled(&job.id)?;
    let output_path = staged_output.commit()?;
    let output_bytes = fs::metadata(&output_path)?.len();
    emit_progress(app, &job.id, 100, "Terminé");
    Ok(ConversionResult {
        output_path: output_path.to_string_lossy().to_string(),
        engine: if job.media_mode == MediaMode::Copy {
            "ffmpeg-copy".to_string()
        } else if warnings
            .iter()
            .any(|warning| warning.code == "integrated-text-fallback")
        {
            "rust-text".to_string()
        } else {
            engine.id
        },
        warnings,
        input_bytes,
        output_bytes,
        duration_ms: started.elapsed().as_millis().try_into().unwrap_or(u64::MAX),
        quality_profile: job.quality_profile,
        media_mode: job.media_mode,
    })
}

pub(super) fn ensure_source_file_available(input_path: &Path) -> Result<()> {
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
        // Use the same decoded-pixel/allocation limits as the input path.
        image_conversion::read_integrated_image(output_path)?;
    }
    if matches!(target_category_id, "audio" | "video")
        && let Some(ffprobe) = engines::resolve_tool(Some(app), "ffprobe")
    {
        let mut command = Command::new(ffprobe);
        command
            .args([
                "-v",
                "error",
                "-protocol_whitelist",
                media::INPUT_PROTOCOLS,
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
            ])
            .arg(output_path)
            .stdin(Stdio::null());
        let output = match run_command_bounded(&mut command, Duration::from_secs(30)) {
            Ok(output) => output,
            Err(ProcessRunError::Io(error)) => return Err(error.into()),
            Err(ProcessRunError::TimedOut) => {
                return Err(ConvertError::Message(
                    "ffprobe ne répond pas pendant la validation de la sortie média.".to_string(),
                ));
            }
        };
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

pub(super) fn emit_progress(app: &AppHandle, job_id: &str, progress: u8, phase: &str) {
    let _ = app.emit(
        "convert-progress",
        ProgressPayload {
            job_id: job_id.to_string(),
            progress,
            phase: phase.to_string(),
        },
    );
}

pub(super) fn system_time_to_iso(value: SystemTime) -> Option<String> {
    let duration = value.duration_since(SystemTime::UNIX_EPOCH).ok()?;
    let datetime = time::OffsetDateTime::from_unix_timestamp(duration.as_secs() as i64).ok()?;
    datetime
        .format(&time::format_description::well_known::Rfc3339)
        .ok()
}
