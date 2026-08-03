use super::contracts::{OcrDocumentResultV1, OcrProgressV1};
use super::{normalize, runtime, validation};
use serde::Deserialize;
use serde_json::json;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
const PAGE_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Clone)]
struct ActiveJob {
    id: String,
    pid: u32,
    canceled: Arc<AtomicBool>,
}

struct WorkerProcess {
    child: Child,
    stdin: ChildStdin,
    messages: Receiver<WorkerMessage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerMessage {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    job_id: String,
    message: Option<String>,
}

#[derive(Clone, Default)]
pub struct OcrState {
    active: Arc<Mutex<Option<ActiveJob>>>,
    worker: Arc<Mutex<Option<WorkerProcess>>>,
}

impl OcrState {
    pub(super) fn recognize_image(
        &self,
        app: &AppHandle,
        source: &str,
        job_id: &str,
    ) -> Result<OcrDocumentResultV1, String> {
        let canceled = self.reserve(job_id)?;
        let result = self.run_image(app, source, job_id, canceled);
        self.clear(job_id);
        result
    }

    pub(crate) fn recognize_pdf(
        &self,
        app: &AppHandle,
        source: &std::path::Path,
        job_id: &str,
    ) -> Result<OcrDocumentResultV1, String> {
        let canceled = self.reserve(job_id)?;
        let result = super::pdf::recognize_pdf(self, app, source, job_id, canceled);
        self.clear(job_id);
        result
    }

    pub fn cancel(&self, job_id: &str) -> bool {
        let active = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        let Some(active) = active.filter(|active| active.id == job_id) else {
            return false;
        };
        active.canceled.store(true, Ordering::SeqCst);
        if active.pid != 0 {
            kill_process_tree(active.pid);
        }
        true
    }

    fn reserve(&self, job_id: &str) -> Result<Arc<AtomicBool>, String> {
        if job_id.trim().is_empty() || job_id.len() > 128 {
            return Err("OCR_JOB_ID:Identifiant de travail OCR invalide.".to_string());
        }
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if active.is_some() {
            return Err("OCR_BUSY:Un seul travail OCR peut être exécuté à la fois.".to_string());
        }
        let canceled = Arc::new(AtomicBool::new(false));
        *active = Some(ActiveJob {
            id: job_id.to_string(),
            pid: 0,
            canceled: canceled.clone(),
        });
        Ok(canceled)
    }

    fn set_pid(&self, job_id: &str, pid: u32) {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if let Some(active) = active.as_mut().filter(|active| active.id == job_id) {
            active.pid = pid;
        }
    }

    fn clear(&self, job_id: &str) {
        let mut active = self
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if active.as_ref().is_some_and(|active| active.id == job_id) {
            *active = None;
        }
    }

    fn run_image(
        &self,
        app: &AppHandle,
        source: &str,
        job_id: &str,
        canceled: Arc<AtomicBool>,
    ) -> Result<OcrDocumentResultV1, String> {
        emit(app, OcrProgressV1::image(job_id, 2, "starting"));
        let selected = runtime::selected_runtime(app)?;
        emit(app, OcrProgressV1::image(job_id, 10, "preparing"));
        let prepared = validation::prepare_image(source)?;
        let temp = tempfile::Builder::new()
            .prefix("multi-converter-ocr-job-")
            .tempdir()
            .map_err(|error| error.to_string())?;
        let output = temp.path().join("result.json");
        emit(app, OcrProgressV1::image(job_id, 25, "recognizing"));
        self.execute_worker(&selected, &prepared.path, &output, job_id, canceled)?;
        emit(app, OcrProgressV1::image(job_id, 92, "normalizing"));
        let bytes = fs::read(&output).map_err(|error| format!("OCR_RESULT_MISSING:{error}"))?;
        let mut result: OcrDocumentResultV1 = serde_json::from_slice(&bytes)
            .map_err(|error| format!("OCR_RESULT_INVALID:{error}"))?;
        if result.job_id != job_id {
            return Err(
                "OCR_RESULT_JOB:Le résultat OCR ne correspond pas au travail demandé.".to_string(),
            );
        }
        if let Some(page) = result.pages.first_mut() {
            page.width = prepared.width;
            page.height = prepared.height;
        }
        normalize::normalize_result(&mut result)?;
        emit(app, OcrProgressV1::image(job_id, 100, "completed"));
        Ok(result)
    }

    pub(super) fn execute_worker(
        &self,
        runtime: &runtime::ResolvedRuntime,
        input: &std::path::Path,
        output: &std::path::Path,
        job_id: &str,
        canceled: Arc<AtomicBool>,
    ) -> Result<(), String> {
        let mut slot = self
            .worker
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let restart = slot
            .as_mut()
            .is_none_or(|worker| worker.child.try_wait().ok().flatten().is_some());
        if restart {
            *slot = Some(start_worker(runtime)?);
        }
        let worker = slot.as_mut().expect("worker initialized");
        self.set_pid(job_id, worker.child.id());
        let request = json!({
            "schemaVersion": 1,
            "jobId": job_id,
            "input": input,
            "output": output,
        });
        writeln!(worker.stdin, "{request}")
            .map_err(|error| format!("OCR_RUNTIME_WRITE:{error}"))?;
        worker
            .stdin
            .flush()
            .map_err(|error| format!("OCR_RUNTIME_WRITE:{error}"))?;

        let started = Instant::now();
        loop {
            if canceled.load(Ordering::SeqCst) {
                stop_worker(slot.take());
                return Err("OCR_CANCELLED:L’OCR a été annulé.".to_string());
            }
            if started.elapsed() > PAGE_TIMEOUT {
                stop_worker(slot.take());
                return Err("OCR_TIMEOUT:Le traitement a dépassé 180 secondes.".to_string());
            }
            match worker.messages.recv_timeout(Duration::from_millis(50)) {
                Ok(message) if message.kind == "completed" && message.job_id == job_id => {
                    return Ok(());
                }
                Ok(message) if message.kind == "failed" && message.job_id == job_id => {
                    let detail = message
                        .message
                        .unwrap_or_else(|| "échec non détaillé".to_string());
                    stop_worker(slot.take());
                    return Err(format!("OCR_RUNTIME_FAILED:{}", bounded_detail(&detail)));
                }
                Ok(_) => continue,
                Err(RecvTimeoutError::Timeout) => {
                    if worker
                        .child
                        .try_wait()
                        .map_err(|error| error.to_string())?
                        .is_some()
                    {
                        stop_worker(slot.take());
                        return Err(
                            "OCR_RUNTIME_CRASH:Le moteur OCR local s’est arrêté.".to_string()
                        );
                    }
                }
                Err(RecvTimeoutError::Disconnected) => {
                    stop_worker(slot.take());
                    return Err("OCR_RUNTIME_CRASH:Le moteur OCR local ne répond plus.".to_string());
                }
            }
        }
    }
}

fn start_worker(runtime: &runtime::ResolvedRuntime) -> Result<WorkerProcess, String> {
    let mut command = Command::new(&runtime.executable);
    command
        .arg("--serve")
        .arg("--models")
        .arg(&runtime.models_dir)
        .arg("--provider")
        .arg(&runtime.provider)
        .env("HF_HUB_OFFLINE", "1")
        .env("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "true")
        .env("NO_PROXY", "*")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    configure_runtime_library_path(&mut command, runtime)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("OCR_RUNTIME_START:{error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "OCR_RUNTIME_START:Entrée du moteur indisponible.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "OCR_RUNTIME_START:Sortie du moteur indisponible.".to_string())?;
    let (sender, messages) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(message) = serde_json::from_str::<WorkerMessage>(&line)
                && sender.send(message).is_err()
            {
                break;
            }
        }
    });
    let ready_started = Instant::now();
    loop {
        if ready_started.elapsed() > STARTUP_TIMEOUT {
            kill_process_tree(child.id());
            let _ = child.kill();
            return Err(
                "OCR_RUNTIME_START_TIMEOUT:Le moteur OCR n’a pas démarré en 30 secondes."
                    .to_string(),
            );
        }
        match messages.recv_timeout(Duration::from_millis(50)) {
            Ok(message) if message.kind == "ready" => break,
            Ok(_) | Err(RecvTimeoutError::Timeout) => {
                if child
                    .try_wait()
                    .map_err(|error| error.to_string())?
                    .is_some()
                {
                    return Err(
                        "OCR_RUNTIME_START:Le moteur OCR s’est arrêté au démarrage.".to_string()
                    );
                }
            }
            Err(RecvTimeoutError::Disconnected) => {
                return Err("OCR_RUNTIME_START:Le moteur OCR ne répond pas.".to_string());
            }
        }
    }
    Ok(WorkerProcess {
        child,
        stdin,
        messages,
    })
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn configure_runtime_library_path(
    command: &mut Command,
    runtime: &runtime::ResolvedRuntime,
) -> Result<(), String> {
    let library_dir = runtime
        .executable
        .parent()
        .ok_or_else(|| "OCR_RUNTIME_INVALID:Répertoire du moteur introuvable.".to_string())?
        .join("_internal")
        .join("paddle")
        .join("libs");
    if !library_dir.is_dir() {
        return Err("OCR_RUNTIME_INVALID:Bibliothèques Paddle absentes.".to_string());
    }
    #[cfg(target_os = "linux")]
    command.env("LD_LIBRARY_PATH", library_dir);
    #[cfg(target_os = "macos")]
    command.env("DYLD_LIBRARY_PATH", library_dir);
    Ok(())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn configure_runtime_library_path(
    _command: &mut Command,
    _runtime: &runtime::ResolvedRuntime,
) -> Result<(), String> {
    Ok(())
}

fn stop_worker(worker: Option<WorkerProcess>) {
    if let Some(mut worker) = worker {
        kill_process_tree(worker.child.id());
        let _ = worker.child.kill();
        let _ = worker.child.wait();
    }
}

pub(super) fn emit(app: &AppHandle, progress: OcrProgressV1) {
    let _ = app.emit("ocr-progress", progress);
}

fn bounded_detail(value: &str) -> String {
    value
        .chars()
        .take(800)
        .collect::<String>()
        .replace(['\r', '\n'], " ")
}

fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .status();
    }
    #[cfg(not(windows))]
    let _ = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status();
}
