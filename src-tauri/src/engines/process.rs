use super::catalog::COMPATIBLE_VERSION;
use super::resolution::resolve_tool;
use crate::process_support::{
    ProcessRunError, configure_linux_portable_engine_env, run_command_bounded,
};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tauri::AppHandle;

pub(super) fn smoke_test_integrated(id: &str) -> Result<(), String> {
    match id {
        "rust-image" | "resvg" | "rust-text" | "pdf-extract" => Ok(()),
        _ => Ok(()),
    }
}

pub(crate) fn smoke_test_external_path(
    app: Option<&AppHandle>,
    id: &str,
    path: &Path,
) -> Result<(), String> {
    let dir = tempfile::tempdir().map_err(|error| error.to_string())?;
    match id {
        "ffmpeg" => {
            let out = dir.path().join("test.wav");
            run_command(
                path,
                &[
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=1000:duration=0.05",
                    "-y",
                    out.to_str().unwrap_or(""),
                ],
            )?;
            require_non_empty(&out)
        }
        "ffprobe" => {
            let ffmpeg = app
                .and_then(|app| resolve_tool(Some(app), "ffmpeg"))
                .or_else(|| resolve_tool(None, "ffmpeg"))
                .ok_or_else(|| "FFmpeg requis pour créer l'échantillon ffprobe.".to_string())?;
            let sample = dir.path().join("probe.wav");
            run_command(
                &ffmpeg,
                &[
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=900:duration=0.05",
                    "-y",
                    sample.to_str().unwrap_or(""),
                ],
            )?;
            run_command(
                path,
                &["-v", "error", "-show_format", sample.to_str().unwrap_or("")],
            )
        }
        "pdfium" => run_command(path, &["--check"]),
        "libreoffice" => Ok(()),
        "pandoc" => run_command(path, &["--version"]),
        "libvips" => run_command(path, &["--version"]),
        _ => Ok(()),
    }
}

fn run_command(path: &Path, args: &[&str]) -> Result<(), String> {
    let mut command = Command::new(path);
    configure_linux_portable_engine_env(&mut command, path);
    run_command_prepared(command, path, args)
}

fn run_command_prepared(mut command: Command, path: &Path, args: &[&str]) -> Result<(), String> {
    command.args(args);
    let output = match run_command_bounded(&mut command, Duration::from_secs(30)) {
        Ok(output) => output,
        Err(ProcessRunError::Io(error)) => return Err(error.to_string()),
        Err(ProcessRunError::TimedOut) => {
            return Err(format!(
                "{} ne répond pas pendant le test santé.",
                path.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("Le moteur")
            ));
        }
    };
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let message = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        Err(message.to_string())
    }
}

fn require_non_empty(path: &Path) -> Result<(), String> {
    fs::metadata(path)
        .map_err(|error| error.to_string())
        .and_then(|metadata| {
            if metadata.len() > 0 {
                Ok(())
            } else {
                Err("Fichier de test vide.".to_string())
            }
        })
}

pub(super) fn detect_tool_version(path: &Path) -> Option<String> {
    for version_arg in ["-version", "--version", "version"] {
        let mut command = Command::new(path);
        command.arg(version_arg);
        let output = run_command_bounded(&mut command, Duration::from_secs(10)).ok()?;
        if !output.status.success() {
            continue;
        }
        let text = if output.stdout.is_empty() {
            String::from_utf8_lossy(&output.stderr)
        } else {
            String::from_utf8_lossy(&output.stdout)
        };
        let first_line = text.lines().next()?.trim();
        if first_line.is_empty() {
            continue;
        }
        if first_line.to_ascii_lowercase().contains("ffmpeg")
            || first_line.to_ascii_lowercase().contains("ffprobe")
        {
            return first_line.split_whitespace().nth(2).map(str::to_string);
        }
        return first_line.split_whitespace().last().map(str::to_string);
    }
    None
}

pub(super) fn expected_version_matches(expected: &str, detected: Option<&str>) -> bool {
    expected == COMPATIBLE_VERSION || detected.is_some_and(|version| version.starts_with(expected))
}
