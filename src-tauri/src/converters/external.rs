use super::*;

mod output;
mod process;

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
    let engine_input = absolute_engine_input(input_path)?;
    let soffice = libreoffice_conversion_launcher(&engine_path(app, "libreoffice")?);
    let out_dir = output_path
        .parent()
        .ok_or_else(|| ConvertError::Message("Dossier de sortie invalide.".to_string()))?;
    let profile_dir = tempfile::Builder::new()
        .prefix("multi-converter-lo-")
        .tempdir()?;
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
    emit_progress(app, job_id, 24, "Conversion Pandoc");
    run_external_command_with_progress(
        engine_command(&pandoc)
            .arg(&engine_input)
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

pub(in crate::converters) fn convert_with_pdfium(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
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
) -> Result<()> {
    let engine_input = absolute_engine_input(input_path)?;
    let vips = engine_path(app, "libvips")?;
    emit_progress(app, job_id, 24, "Conversion libvips");
    run_external_command_with_progress(
        engine_command(&vips)
            .arg("copy")
            .arg(&engine_input)
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
