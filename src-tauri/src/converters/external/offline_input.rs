use super::*;

// HTML importers may fetch images even when Office link updates are disabled.
// Convert a resource-checked Pandoc AST to a self-contained ODT first.
pub(super) fn prepare(
    app: &AppHandle,
    job_id: &str,
    input: &Path,
    staging: &Path,
) -> Result<PathBuf> {
    let extension = input.extension().and_then(OsStr::to_str).unwrap_or("");
    office_resources::validate(input, extension)?;
    if !extension.eq_ignore_ascii_case("html") && !extension.eq_ignore_ascii_case("htm") {
        return Ok(input.to_path_buf());
    }
    let pandoc = engine_path(app, "pandoc")?;
    let ast = prepare_pandoc_input(app, job_id, &pandoc, input, staging)?;
    let output = staging.join("local-document.odt");
    run_external_command_with_progress(
        engine_command(&pandoc)
            .args(["--sandbox", "--fail-if-warnings"])
            .arg(&ast)
            .arg("-o")
            .arg(&output),
        "Pandoc",
        Duration::from_secs(180),
        ExternalCommandProgress {
            app,
            job_id,
            phase: "Préparation des ressources locales",
            start: 12,
            max: 22,
        },
    )?;
    Ok(output)
}
