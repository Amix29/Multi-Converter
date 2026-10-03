use super::*;

#[derive(Default)]
struct CancellationRegistry {
    active: HashSet<String>,
    cancelled: HashSet<String>,
}

static CANCELLATIONS: OnceLock<Mutex<CancellationRegistry>> = OnceLock::new();
const MAX_ACTIVE_CONVERSIONS: usize = 4096;
const MAX_JOB_ID_BYTES: usize = 128;

fn registry() -> &'static Mutex<CancellationRegistry> {
    CANCELLATIONS.get_or_init(|| Mutex::new(CancellationRegistry::default()))
}

pub(crate) struct ActiveConversion {
    job_id: String,
}

impl ActiveConversion {
    pub(super) fn matches(&self, job_id: &str) -> bool {
        self.job_id == job_id
    }
}

impl Drop for ActiveConversion {
    fn drop(&mut self) {
        finish_conversion(&self.job_id);
    }
}

pub(crate) fn begin_conversion(job_id: &str) -> Result<ActiveConversion> {
    if !valid_job_id(job_id) {
        return Err(ConvertError::Message(
            "Identifiant de conversion invalide.".to_string(),
        ));
    }
    let mut registry = registry()
        .lock()
        .map_err(|_| ConvertError::Message("Registre d’annulation indisponible.".to_string()))?;
    if registry.active.len() >= MAX_ACTIVE_CONVERSIONS {
        return Err(ConvertError::Message(
            "Trop de conversions sont déjà actives.".to_string(),
        ));
    }
    if !registry.active.insert(job_id.to_string()) {
        return Err(ConvertError::Message(
            "Une conversion utilise déjà cet identifiant.".to_string(),
        ));
    }
    registry.cancelled.remove(job_id);
    Ok(ActiveConversion {
        job_id: job_id.to_string(),
    })
}

pub fn cancel_conversion(job_id: &str) -> bool {
    if !valid_job_id(job_id) {
        return false;
    }
    registry().lock().is_ok_and(|mut registry| {
        if !registry.active.contains(job_id) {
            return false;
        }
        registry.cancelled.insert(job_id.to_string())
    })
}

fn finish_conversion(job_id: &str) {
    if let Ok(mut registry) = registry().lock() {
        registry.cancelled.remove(job_id);
        registry.active.remove(job_id);
    }
}

pub(super) fn is_cancelled(job_id: &str) -> bool {
    registry()
        .lock()
        .is_ok_and(|registry| registry.cancelled.contains(job_id))
}

pub(super) fn check_cancelled(job_id: &str) -> Result<()> {
    if is_cancelled(job_id) {
        Err(ConvertError::Message("Conversion annulée.".to_string()))
    } else {
        Ok(())
    }
}

fn valid_job_id(job_id: &str) -> bool {
    !job_id.trim().is_empty() && job_id.len() <= MAX_JOB_ID_BYTES
}
