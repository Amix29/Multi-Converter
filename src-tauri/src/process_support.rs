use std::fmt;
use std::io::{self, Read};
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "linux")]
use std::{env, ffi::OsStr, fs, path::PathBuf};

const MAX_CAPTURE_BYTES: usize = 128 * 1024;
const OUTPUT_DRAIN_TIMEOUT: Duration = Duration::from_secs(2);
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(unix)]
unsafe extern "C" {
    fn kill(pid: i32, signal: i32) -> i32;
}

#[cfg(unix)]
const SIGKILL: i32 = 9;

#[cfg(target_os = "linux")]
pub(crate) fn configure_linux_portable_engine_env(command: &mut Command, path: &Path) {
    let Some(bin_dir) = path.parent() else {
        return;
    };
    let Some(engine_root) = bin_dir.parent() else {
        return;
    };
    let lib_dir = engine_root.join("lib");
    if !lib_dir.is_dir() {
        return;
    }

    prepend_env_path(command, "LD_LIBRARY_PATH", &lib_dir);
    if let Ok(entries) = fs::read_dir(&lib_dir) {
        let module_dirs = entries
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|entry| {
                entry.is_dir()
                    && entry
                        .file_name()
                        .and_then(OsStr::to_str)
                        .is_some_and(|name| name.starts_with("vips-modules-"))
            })
            .collect::<Vec<_>>();
        if !module_dirs.is_empty() {
            set_env_paths(command, "VIPS_MODULE_PATH", module_dirs);
        }
    }
}

#[cfg(not(target_os = "linux"))]
pub(crate) fn configure_linux_portable_engine_env(_command: &mut Command, _path: &Path) {}

#[cfg(target_os = "linux")]
fn prepend_env_path(command: &mut Command, key: &str, value: &Path) {
    let mut paths = vec![value.to_path_buf()];
    if let Some(existing) = env::var_os(key) {
        paths.extend(env::split_paths(&existing));
    }
    set_env_paths(command, key, paths);
}

#[cfg(target_os = "linux")]
fn set_env_paths(command: &mut Command, key: &str, paths: Vec<PathBuf>) {
    if let Ok(joined) = env::join_paths(paths) {
        command.env(key, joined);
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn configure_child_process(command: &mut Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(unix)]
pub(crate) fn configure_child_process(command: &mut Command) {
    command.process_group(0);
}

#[cfg(not(any(target_os = "windows", unix)))]
pub(crate) fn configure_child_process(_command: &mut Command) {}

pub(crate) fn drain_child_output<T>(mut stream: T) -> std::thread::JoinHandle<Vec<u8>>
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
                    if output.len() > MAX_CAPTURE_BYTES {
                        let excess = output.len() - MAX_CAPTURE_BYTES;
                        output.drain(0..excess);
                    }
                }
            }
        }
        output
    })
}

pub(crate) fn join_child_output(handle: Option<std::thread::JoinHandle<Vec<u8>>>) -> Vec<u8> {
    let Some(handle) = handle else {
        return Vec::new();
    };
    let started = Instant::now();
    while !handle.is_finished() && started.elapsed() < OUTPUT_DRAIN_TIMEOUT {
        std::thread::sleep(Duration::from_millis(20));
    }
    if !handle.is_finished() {
        return Vec::new();
    }
    handle.join().unwrap_or_default()
}

#[derive(Debug)]
pub(crate) struct BoundedCommandOutput {
    pub(crate) status: ExitStatus,
    pub(crate) stdout: Vec<u8>,
    pub(crate) stderr: Vec<u8>,
}

#[derive(Debug)]
pub(crate) enum ProcessRunError {
    Io(io::Error),
    TimedOut,
}

impl fmt::Display for ProcessRunError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => error.fmt(formatter),
            Self::TimedOut => formatter.write_str("process timed out"),
        }
    }
}

impl std::error::Error for ProcessRunError {}

pub(crate) fn run_command_bounded(
    command: &mut Command,
    timeout: Duration,
) -> Result<BoundedCommandOutput, ProcessRunError> {
    configure_child_process(command);
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(ProcessRunError::Io)?;
    let mut stdout_reader = child.stdout.take().map(drain_child_output);
    let mut stderr_reader = child.stderr.take().map(drain_child_output);
    let started = Instant::now();

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= timeout => {
                terminate_child_process(&mut child);
                let _ = join_child_output(stdout_reader.take());
                let _ = join_child_output(stderr_reader.take());
                return Err(ProcessRunError::TimedOut);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(error) => {
                terminate_child_process(&mut child);
                let _ = join_child_output(stdout_reader.take());
                let _ = join_child_output(stderr_reader.take());
                return Err(ProcessRunError::Io(error));
            }
        }
    };

    Ok(BoundedCommandOutput {
        status,
        stdout: join_child_output(stdout_reader),
        stderr: join_child_output(stderr_reader),
    })
}

pub(crate) fn terminate_child_process(child: &mut Child) {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("taskkill");
        configure_child_process(&mut command);
        command
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Ok(mut taskkill) = command.spawn() {
            let started = Instant::now();
            loop {
                match taskkill.try_wait() {
                    Ok(Some(_)) | Err(_) => break,
                    Ok(None) if started.elapsed() >= Duration::from_secs(2) => {
                        let _ = taskkill.kill();
                        let _ = taskkill.wait();
                        break;
                    }
                    Ok(None) => std::thread::sleep(Duration::from_millis(20)),
                }
            }
        }
    }
    #[cfg(unix)]
    unsafe {
        let process_group = -(child.id() as i32);
        let _ = kill(process_group, SIGKILL);
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn process_output_capture_keeps_a_bounded_tail() {
        let input = (0..(MAX_CAPTURE_BYTES + 97))
            .map(|index| (index % 251) as u8)
            .collect::<Vec<_>>();
        let expected = input[input.len() - MAX_CAPTURE_BYTES..].to_vec();

        let output = join_child_output(Some(drain_child_output(Cursor::new(input))));

        assert_eq!(output, expected);
    }

    #[test]
    fn bounded_process_captures_large_output_from_a_special_path() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("données avec espaces.txt");
        let bytes = (0..(MAX_CAPTURE_BYTES + 97))
            .map(|index| b'a' + (index % 23) as u8)
            .collect::<Vec<_>>();
        std::fs::write(&source, &bytes).unwrap();

        #[cfg(target_os = "windows")]
        let mut command = {
            let mut command = Command::new("cmd");
            command.args(["/D", "/S", "/C", "type"]).arg(&source);
            command
        };
        #[cfg(not(target_os = "windows"))]
        let mut command = {
            let mut command = Command::new("cat");
            command.arg(&source);
            command
        };

        let output = run_command_bounded(&mut command, Duration::from_secs(10)).unwrap();

        assert!(output.status.success());
        assert_eq!(output.stdout, bytes[bytes.len() - MAX_CAPTURE_BYTES..]);
        assert!(output.stderr.is_empty());
    }

    #[test]
    fn bounded_process_preserves_failure_status_and_stderr() {
        #[cfg(target_os = "windows")]
        let mut command = {
            let mut command = Command::new("cmd");
            command.args(["/D", "/S", "/C", "echo erreur 1>&2 & exit /b 7"]);
            command
        };
        #[cfg(not(target_os = "windows"))]
        let mut command = {
            let mut command = Command::new("sh");
            command.args(["-c", "echo erreur >&2; exit 7"]);
            command
        };

        let output = run_command_bounded(&mut command, Duration::from_secs(10)).unwrap();

        assert_eq!(output.status.code(), Some(7));
        assert!(String::from_utf8_lossy(&output.stderr).contains("erreur"));
    }

    #[test]
    fn bounded_process_times_out_and_is_stopped() {
        #[cfg(target_os = "windows")]
        let mut command = {
            let mut command = Command::new("cmd");
            command.args(["/D", "/S", "/C", "ping -n 20 127.0.0.1 > nul"]);
            command
        };
        #[cfg(not(target_os = "windows"))]
        let mut command = {
            let mut command = Command::new("sh");
            command.args(["-c", "sleep 10"]);
            command
        };
        let started = Instant::now();

        let error = run_command_bounded(&mut command, Duration::from_millis(100)).unwrap_err();

        assert!(matches!(error, ProcessRunError::TimedOut));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[cfg(unix)]
    #[test]
    fn bounded_timeout_stops_descendants_that_hold_output_pipes() {
        let mut command = Command::new("sh");
        command.args(["-c", "(sleep 30; echo descendant) & wait"]);
        let started = Instant::now();

        let error = run_command_bounded(&mut command, Duration::from_millis(100)).unwrap_err();

        assert!(matches!(error, ProcessRunError::TimedOut));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn bounded_process_reports_launch_errors() {
        let directory = tempfile::tempdir().unwrap();
        let mut command = Command::new(directory.path().join("moteur-inexistant"));

        let error = run_command_bounded(&mut command, Duration::from_secs(1)).unwrap_err();

        assert!(matches!(error, ProcessRunError::Io(_)));
    }
}
