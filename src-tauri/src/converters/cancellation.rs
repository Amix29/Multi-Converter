use super::*;

static CANCELLED_JOBS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
const MAX_PENDING_CANCELLATIONS: usize = 4096;
const MAX_JOB_ID_BYTES: usize = 128;

fn cancelled_jobs() -> &'static Mutex<HashSet<String>> {
    CANCELLED_JOBS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn cancel_conversion(job_id: &str) -> bool {
    if job_id.trim().is_empty() || job_id.len() > MAX_JOB_ID_BYTES {
        return false;
    }
    cancelled_jobs().lock().is_ok_and(|mut jobs| {
        if jobs.len() >= MAX_PENDING_CANCELLATIONS && !jobs.contains(job_id) {
            return false;
        }
        jobs.insert(job_id.to_string())
    })
}

pub(super) fn clear_cancelled(job_id: &str) {
    if let Ok(mut jobs) = cancelled_jobs().lock() {
        jobs.remove(job_id);
    }
}

pub(super) fn is_cancelled(job_id: &str) -> bool {
    cancelled_jobs()
        .lock()
        .is_ok_and(|jobs| jobs.contains(job_id))
}

pub(super) fn check_cancelled(job_id: &str) -> Result<()> {
    if is_cancelled(job_id) {
        Err(ConvertError::Message("Conversion annulée.".to_string()))
    } else {
        Ok(())
    }
}
