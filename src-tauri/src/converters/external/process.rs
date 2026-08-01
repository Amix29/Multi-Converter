use super::*;

pub(crate) fn engine_path(app: &AppHandle, id: &str) -> Result<PathBuf> {
    engines::resolve_tool(Some(app), id).ok_or_else(|| {
        ConvertError::Message(format!(
            "Moteur {} introuvable. Réinstallez Multi-Converter ou restaurez les moteurs embarqués.",
            engines::tool_label(id)
        ))
    })
}

pub(crate) fn engine_command(path: &Path) -> Command {
    let mut command = Command::new(path);
    configure_linux_portable_engine_env(&mut command, path);
    command
}

pub(crate) struct ExternalCommandProgress<'a> {
    pub(crate) app: &'a AppHandle,
    pub(crate) job_id: &'a str,
    pub(crate) phase: &'a str,
    pub(crate) start: u8,
    pub(crate) max: u8,
}

pub(crate) fn run_external_command_with_progress(
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
    configure_child_process(command);
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
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(error) => {
                terminate_child_process(&mut child);
                let _ = join_child_output(stdout_reader.take());
                let _ = join_child_output(stderr_reader.take());
                return Err(error.into());
            }
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
