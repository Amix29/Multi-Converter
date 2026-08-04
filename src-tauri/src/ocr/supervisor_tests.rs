use super::*;
use std::path::PathBuf;

#[test]
fn runtime_progress_reports_each_real_preparation_stage() {
    assert_eq!(map_runtime_progress("extracting-runtime", 0), 2);
    assert_eq!(map_runtime_progress("extracting-runtime", 100), 5);
    assert_eq!(map_runtime_progress("verifying-runtime", 100), 8);
    assert_eq!(map_runtime_progress("verifying-models", 100), 10);
}

#[test]
fn cancellation_is_recorded_before_a_worker_pid_exists() {
    let state = OcrState::default();
    let canceled = state.reserve("cancel-before-start").unwrap();
    assert!(state.cancel("cancel-before-start"));
    assert!(canceled.load(Ordering::SeqCst));
    state.clear("cancel-before-start");
    assert!(!state.cancel("cancel-before-start"));
}

#[test]
fn worker_start_honors_a_preexisting_cancellation() {
    let runtime = runtime::ResolvedRuntime {
        executable: PathBuf::from("worker-that-must-not-start"),
        models_dir: PathBuf::from("models-that-must-not-be-read"),
        provider: "cpu".to_string(),
    };
    let canceled = AtomicBool::new(true);
    let result = start_worker(&runtime, &canceled, |_| {
        panic!("a canceled worker must not be spawned")
    });
    let error = match result {
        Ok(_) => panic!("a canceled worker was spawned"),
        Err(error) => error,
    };
    assert!(error.starts_with("OCR_CANCELLED:"));
}

#[test]
fn stderr_capture_keeps_only_the_bounded_tail() {
    let tail = Arc::new(Mutex::new(Vec::new()));
    let bytes = vec![b'x'; STDERR_TAIL_BYTES + 64];
    append_stderr_tail(&tail, &bytes);
    let captured = tail.lock().unwrap();
    assert_eq!(captured.len(), STDERR_TAIL_BYTES);
    assert!(captured.iter().all(|byte| *byte == b'x'));
}
