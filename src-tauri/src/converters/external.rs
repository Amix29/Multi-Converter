use super::*;

mod libreoffice_profile;
#[cfg(test)]
mod native_tests;
mod office_resources;
mod offline_input;
mod output;
mod process;
mod resources;

pub(in crate::converters) use output::{move_external_output, path_to_file_url};
pub(crate) use process::{
    ExternalCommandProgress, engine_command, engine_path, run_external_command_with_progress,
};

pub(in crate::converters) fn convert_with_libreoffice(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
) -> Result<()> {
    let source_input = absolute_engine_input(input_path)?;
    let input_staging = tempfile::Builder::new()
        .prefix("multi-converter-office-input-")
        .tempdir()?;
    let engine_input = offline_input::prepare(app, job_id, &source_input, input_staging.path())?;
    let soffice = libreoffice_conversion_launcher(&engine_path(app, "libreoffice")?);
    let out_dir = output_path
        .parent()
        .ok_or_else(|| ConvertError::Message("Dossier de sortie invalide.".to_string()))?;
    let profile_dir = tempfile::Builder::new()
        .prefix("multi-converter-lo-")
        .tempdir()?;
    libreoffice_profile::prepare(profile_dir.path())?;
    let engine_output_dir = tempfile::Builder::new()
        .prefix(".multi-converter-lo-output-")
        .tempdir_in(out_dir)?;
    emit_progress(app, job_id, 24, "Conversion LibreOffice");
    let filter = match target_format {
        "txt" => "txt:Text",
        "html" => "html:XHTML Writer File",
        other => other,
    };
    let mut command = engine_command(&soffice);
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
            path_to_file_url(profile_dir.path())
        ))
        .arg("--convert-to")
        .arg(filter)
        .arg("--outdir")
        .arg(engine_output_dir.path())
        .arg(&engine_input);
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
    result?;
    move_external_output(
        input_path,
        engine_output_dir.path(),
        output_path,
        target_format,
    )?;
    emit_progress(app, job_id, 88, "Finalisation LibreOffice");
    Ok(())
}

#[cfg(target_os = "windows")]
pub(in crate::converters) fn libreoffice_conversion_launcher(configured: &Path) -> PathBuf {
    // soffice.exe delegates to soffice.bin and can exit before the conversion
    // has completely consumed its temporary profile. soffice.com is the
    // synchronous console launcher shipped beside it, so waiting on the child
    // really means the document and its repeated page styles are finalized.
    let console = configured.with_extension("com");
    if console.is_file() {
        console
    } else {
        configured.to_path_buf()
    }
}

#[cfg(not(target_os = "windows"))]
pub(in crate::converters) fn libreoffice_conversion_launcher(configured: &Path) -> PathBuf {
    configured.to_path_buf()
}

pub(in crate::converters) fn convert_with_pandoc(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
) -> Result<()> {
    let engine_input = absolute_engine_input(input_path)?;
    let pandoc = engine_path(app, "pandoc")?;
    let staging = tempfile::Builder::new()
        .prefix("multi-converter-document-")
        .tempdir()?;
    let prepared_input = prepare_pandoc_input(app, job_id, &pandoc, &engine_input, staging.path())?;
    emit_progress(app, job_id, 24, "Conversion Pandoc");
    run_external_command_with_progress(
        engine_command(&pandoc)
            .arg("--sandbox")
            .arg("--fail-if-warnings")
            .arg(&prepared_input)
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

fn prepare_pandoc_input(
    app: &AppHandle,
    job_id: &str,
    pandoc: &Path,
    input: &Path,
    staging: &Path,
) -> Result<PathBuf> {
    prepare_local_input(pandoc, input, staging, |command| {
        run_external_command_with_progress(
            command,
            "Pandoc",
            Duration::from_secs(180),
            ExternalCommandProgress {
                app,
                job_id,
                phase: "Analyse des ressources locales",
                start: 12,
                max: 22,
            },
        )
    })
}

fn prepare_local_input(
    pandoc: &Path,
    input: &Path,
    staging: &Path,
    mut run: impl FnMut(&mut Command) -> Result<()>,
) -> Result<PathBuf> {
    let extension = input
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "md" | "markdown" | "html" | "htm") {
        return Ok(input.to_path_buf());
    }
    let ast_path = staging.join("document.json");
    run(engine_command(pandoc)
        .args(["--sandbox", "--fail-if-warnings", "--to=json"])
        .arg(input)
        .arg("-o")
        .arg(&ast_path))?;
    if fs::metadata(&ast_path)?.len() > MAX_EXTRACTED_TEXT_BYTES {
        return Err(ConvertError::Message(
            "Document trop volumineux pour la préparation locale.".to_string(),
        ));
    }
    let mut ast: serde_json::Value = serde_json::from_reader(File::open(&ast_path)?)?;
    resources::embed_local_images(&mut ast, input.parent().unwrap_or(Path::new(".")))?;
    serde_json::to_writer(File::create(&ast_path)?, &ast)?;
    Ok(ast_path)
}

pub(in crate::converters) fn convert_with_pdfium(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
    quality: QualityProfile,
) -> Result<()> {
    let engine_input = absolute_engine_input(input_path)?;
    let pdfium = engine_path(app, "pdfium")?;
    emit_progress(app, job_id, 24, "Rendu PDFium");
    let format = if target_format == "jpg" { "jpg" } else { "png" };
    let render_dir = tempfile::Builder::new()
        .prefix("multi-converter-pdf-pages-")
        .tempdir()?;
    let render_result = run_external_command_with_progress(
        engine_command(&pdfium)
            .arg("--render-all")
            .arg(&engine_input)
            .arg(render_dir.path())
            .arg("--format")
            .arg(format)
            .arg("--dpi")
            .arg(quality.pdf_dpi()),
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
    render_result?;
    zip_rendered_pages(render_dir.path(), output_path, format)?;
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

pub(in crate::converters) fn convert_with_libvips(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    quality: QualityProfile,
    batch_concurrency: usize,
) -> Result<()> {
    let engine_input = absolute_engine_input(input_path)?;
    let vips = engine_path(app, "libvips")?;
    let staging = tempfile::Builder::new()
        .prefix("multi-converter-image-")
        .tempdir()?;
    let normalized = staging.path().join("oriented.v");
    let threads = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(2)
        .checked_div(batch_concurrency.max(1))
        .unwrap_or(1)
        .max(1)
        .to_string();
    emit_progress(app, job_id, 24, "Conversion libvips");
    run_external_command_with_progress(
        engine_command(&vips)
            .env("VIPS_CONCURRENCY", &threads)
            .arg("autorot")
            .arg(&engine_input)
            .arg(&normalized),
        "libvips",
        Duration::from_secs(180),
        ExternalCommandProgress {
            app,
            job_id,
            phase: "Conversion libvips",
            start: 24,
            max: 52,
        },
    )?;
    let mut command = engine_command(&vips);
    command.env("VIPS_CONCURRENCY", &threads);
    if output_path.extension().and_then(OsStr::to_str) == Some("jpg") {
        command
            .arg("jpegsave")
            .arg(&normalized)
            .arg(output_path)
            .arg("--Q")
            .arg(quality.jpeg_quality().to_string())
            .arg("--background")
            .arg("255");
    } else {
        command.arg("copy").arg(&normalized).arg(output_path);
    }
    run_external_command_with_progress(
        &mut command,
        "libvips",
        Duration::from_secs(180),
        ExternalCommandProgress {
            app,
            job_id,
            phase: "Encodage de l’image",
            start: 52,
            max: 82,
        },
    )?;
    emit_progress(app, job_id, 88, "Finalisation libvips");
    Ok(())
}

fn absolute_engine_input(input_path: &Path) -> Result<PathBuf> {
    if input_path.is_absolute() {
        Ok(input_path.to_path_buf())
    } else {
        Ok(std::env::current_dir()?.join(input_path))
    }
}

#[cfg(test)]
mod tests {
    use super::absolute_engine_input;
    use std::path::Path;

    #[test]
    fn option_like_relative_inputs_become_positional_absolute_paths() {
        let path = absolute_engine_input(Path::new("-document.docx")).unwrap();

        assert!(path.is_absolute());
        assert_eq!(path.file_name().unwrap(), "-document.docx");
    }
}
