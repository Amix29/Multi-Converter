use crate::process_support::{
    ProcessRunError, configure_child_process, run_command_bounded, terminate_child_process,
};
use std::io::{Read, Write};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::AppHandle;

const MAX_STDOUT_BYTES: usize = 32 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 128 * 1024;
const PROCESS_TIMEOUT: Duration = Duration::from_secs(180);
const REQUIRED_WRAPPER_VERSION: &str = "pdfium-render-wrapper 0.4.0";

pub(super) fn run_pdfium_request<R: serde::Serialize, T: serde::de::DeserializeOwned>(
    app: &AppHandle,
    mode: &str,
    request: &R,
) -> Result<T, String> {
    let mut bytes = serde_json::to_vec(request)
        .map_err(|error| format!("PDF_EDITOR_REQUEST_INVALID:{error}"))?;
    let result = run_pdfium_json(app, mode, &bytes);
    bytes.fill(0);
    result
}

fn run_pdfium_json<T: serde::de::DeserializeOwned>(
    app: &AppHandle,
    mode: &str,
    request: &[u8],
) -> Result<T, String> {
    let executable = crate::converters::engine_path(app, "pdfium")
        .map_err(|error| format!("PDF_EDITOR_ENGINE:{error}"))?;
    ensure_editor_wrapper(&executable)?;
    let mut command = crate::converters::engine_command(&executable);
    command.arg(mode);
    configure_child_process(&mut command);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("PDF_EDITOR_ENGINE_START:{error}"))?;

    let stdout = child
        .stdout
        .take()
        .map(|stream| drain_bounded(stream, MAX_STDOUT_BYTES));
    let stderr = child
        .stderr
        .take()
        .map(|stream| drain_bounded(stream, MAX_STDERR_BYTES));
    let write_result = child
        .stdin
        .take()
        .ok_or_else(|| "PDF_EDITOR_ENGINE_STDIN:Entrée moteur indisponible.".to_string())
        .and_then(|mut stdin| {
            stdin
                .write_all(request)
                .and_then(|_| stdin.flush())
                .map_err(|error| format!("PDF_EDITOR_ENGINE_STDIN:{error}"))
        });
    if let Err(error) = write_result {
        terminate_child_process(&mut child);
        let _ = join_bounded(stdout);
        let _ = join_bounded(stderr);
        return Err(error);
    }

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= PROCESS_TIMEOUT => {
                terminate_child_process(&mut child);
                let _ = join_bounded(stdout);
                let _ = join_bounded(stderr);
                return Err("PDF_EDITOR_ENGINE_TIMEOUT:PDFium ne répond pas.".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(error) => {
                terminate_child_process(&mut child);
                let _ = join_bounded(stdout);
                let _ = join_bounded(stderr);
                return Err(format!("PDF_EDITOR_ENGINE_WAIT:{error}"));
            }
        }
    };

    let stdout = join_bounded(stdout)?;
    let stderr = join_bounded(stderr)?;
    if !status.success() {
        let detail = String::from_utf8_lossy(&stderr.bytes);
        return Err(if detail.trim().is_empty() {
            "PDF_EDITOR_ENGINE_FAILED:Le moteur PDFium a échoué.".into()
        } else {
            detail.trim().to_string()
        });
    }
    if stdout.overflowed {
        return Err("PDF_EDITOR_RESULT_LIMIT:La fenêtre PDF dépasse 32 Mio.".into());
    }
    serde_json::from_slice(&stdout.bytes)
        .map_err(|error| format!("PDF_EDITOR_RESULT_INVALID:{error}"))
}

fn ensure_editor_wrapper(executable: &std::path::Path) -> Result<(), String> {
    let mut command = crate::converters::engine_command(executable);
    command.arg("--version");
    configure_child_process(&mut command);
    let output = match run_command_bounded(&mut command, Duration::from_secs(10)) {
        Ok(output) => output,
        Err(ProcessRunError::Io(error)) => {
            return Err(format!("PDF_EDITOR_ENGINE_VERSION:{error}"));
        }
        Err(ProcessRunError::TimedOut) => {
            return Err("PDF_EDITOR_ENGINE_VERSION:Le moteur PDFium ne répond pas.".into());
        }
    };
    let reported = String::from_utf8_lossy(if output.stdout.is_empty() {
        &output.stderr
    } else {
        &output.stdout
    });
    validate_wrapper_version(output.status.success(), reported.trim())?;
    Ok(())
}

fn validate_wrapper_version(success: bool, reported: &str) -> Result<(), String> {
    if success && reported == REQUIRED_WRAPPER_VERSION {
        Ok(())
    } else {
        Err(format!(
            "PDF_EDITOR_ENGINE_VERSION:Le wrapper PDFium 0.4.0 est requis (détecté : {}).",
            if reported.is_empty() {
                "version inconnue"
            } else {
                reported.lines().next().unwrap_or("version inconnue")
            }
        ))
    }
}

struct BoundedBytes {
    bytes: Vec<u8>,
    overflowed: bool,
}

fn drain_bounded<T: Read + Send + 'static>(
    mut stream: T,
    limit: usize,
) -> std::thread::JoinHandle<BoundedBytes> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut overflowed = false;
        let mut buffer = [0u8; 8192];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    let remaining = limit.saturating_sub(bytes.len());
                    bytes.extend_from_slice(&buffer[..read.min(remaining)]);
                    overflowed |= read > remaining;
                }
            }
        }
        BoundedBytes { bytes, overflowed }
    })
}

fn join_bounded(
    handle: Option<std::thread::JoinHandle<BoundedBytes>>,
) -> Result<BoundedBytes, String> {
    handle
        .ok_or_else(|| "PDF_EDITOR_ENGINE_OUTPUT:Sortie moteur indisponible.".to_string())?
        .join()
        .map_err(|_| "PDF_EDITOR_ENGINE_OUTPUT:Lecture de sortie interrompue.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn process_capture_drains_but_never_keeps_more_than_the_limit() {
        let value = vec![b'x'; 4097];
        let result = join_bounded(Some(drain_bounded(Cursor::new(value), 4096))).unwrap();
        assert_eq!(result.bytes.len(), 4096);
        assert!(result.overflowed);
    }

    #[test]
    fn pdf_editor_rejects_legacy_wrapper_versions() {
        assert!(validate_wrapper_version(true, REQUIRED_WRAPPER_VERSION).is_ok());
        let error = validate_wrapper_version(true, "pdfium-render-wrapper 0.2.0").unwrap_err();
        assert!(error.contains("0.4.0"));
        assert!(error.contains("0.2.0"));
        assert!(validate_wrapper_version(false, REQUIRED_WRAPPER_VERSION).is_err());
        assert!(validate_wrapper_version(true, "unexpected\npdfium-render-wrapper 0.4.0").is_err());
        assert!(validate_wrapper_version(true, "pdfium-render-wrapper 0.4.0\nunexpected").is_err());
    }
}
