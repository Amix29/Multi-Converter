//! Conservative admission reservations, not a measurement or an OS memory limit.
use super::*;
use std::sync::{Arc, Condvar};

const MIB: u64 = 1024 * 1024;
const TOTAL_BYTES: u64 = 2048 * MIB;
// Leave room for the retained OCR worker even when it is idle.
const MAX_RESERVATION_BYTES: u64 = TOTAL_BYTES - 768 * MIB;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ResourceClass {
    Image,
    Document,
    Media,
    Ocr,
}

struct Reservation {
    class: ResourceClass,
    bytes: u64,
}

#[derive(Default)]
struct Usage {
    entries: Vec<Reservation>,
    bytes: u64,
}

#[derive(Default)]
struct Pool {
    usage: Mutex<Usage>,
    changed: Condvar,
}

static POOL: OnceLock<Arc<Pool>> = OnceLock::new();

pub(crate) struct ResourceLease {
    pool: Arc<Pool>,
    class: ResourceClass,
    bytes: u64,
}

impl Drop for ResourceLease {
    fn drop(&mut self) {
        let mut usage = self
            .pool
            .usage
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if let Some(index) = usage
            .entries
            .iter()
            .position(|entry| entry.class == self.class && entry.bytes == self.bytes)
        {
            usage.entries.swap_remove(index);
            usage.bytes -= self.bytes;
        }
        self.pool.changed.notify_all();
    }
}

pub(crate) fn reserve(
    class: ResourceClass,
    bytes: u64,
    cancelled: impl Fn() -> bool,
) -> Result<ResourceLease> {
    reserve_from(
        POOL.get_or_init(|| Arc::new(Pool::default())).clone(),
        class,
        bytes,
        cancelled,
    )
}

fn reserve_from(
    pool: Arc<Pool>,
    class: ResourceClass,
    bytes: u64,
    cancelled: impl Fn() -> bool,
) -> Result<ResourceLease> {
    if bytes > MAX_RESERVATION_BYTES {
        return Err(ConvertError::Message(
            "Ce traitement dépasse le budget mémoire du lot. Choisissez une image moins grande."
                .to_string(),
        ));
    }
    let mut usage = pool
        .usage
        .lock()
        .map_err(|_| ConvertError::Message("Ordonnanceur indisponible.".to_string()))?;
    loop {
        if cancelled() {
            return Err(ConvertError::Message("Conversion annulée.".to_string()));
        }
        let limit = match class {
            ResourceClass::Ocr | ResourceClass::Document => 1,
            _ => 2,
        };
        let count = usage
            .entries
            .iter()
            .filter(|entry| entry.class == class)
            .count();
        if count < limit && usage.bytes + bytes <= TOTAL_BYTES {
            usage.entries.push(Reservation { class, bytes });
            usage.bytes += bytes;
            drop(usage);
            return Ok(ResourceLease { pool, class, bytes });
        }
        usage = pool
            .changed
            .wait_timeout(usage, Duration::from_millis(100))
            .map_err(|_| ConvertError::Message("Ordonnanceur indisponible.".to_string()))?
            .0;
    }
}

pub(super) fn for_conversion(
    input: &Path,
    engine: &str,
    category: &str,
    job_id: &str,
) -> Result<ResourceLease> {
    let (class, bytes) = if category == "images" && engine != "pdfium" {
        let bytes = if engine == "libvips" {
            512 * MIB
        } else {
            image_reservation(input)?
        };
        (ResourceClass::Image, bytes)
    } else if engine == "ffmpeg" {
        (ResourceClass::Media, 256 * MIB)
    } else {
        (ResourceClass::Document, 512 * MIB)
    };
    reserve(class, bytes, || is_cancelled(job_id))
}

fn image_reservation(input: &Path) -> Result<u64> {
    let dimensions = image::ImageReader::open(input)?
        .with_guessed_format()?
        .into_dimensions();
    match dimensions {
        // Includes decoding, orientation, pixel conversion and encoder buffers.
        Ok((width, height)) => Ok(u64::from(width) * u64::from(height) * 32 + 16 * MIB),
        // SVG is separately bounded to two live RGBA buffers. Its parser also
        // consumes input bytes; unknown integrated inputs still fail at decode.
        Err(_) => Ok(512 * MIB),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn cancellation_unblocks_waiters_and_drop_returns_capacity() {
        let pool = Arc::new(Pool::default());
        let first = reserve_from(pool.clone(), ResourceClass::Ocr, 768 * MIB, || false).unwrap();
        let cancelled = Arc::new(AtomicBool::new(false));
        let flag = cancelled.clone();
        let waiting_pool = pool.clone();
        let (entered, waiting) = mpsc::sync_channel(1);
        let (finished, completion) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            let result = reserve_from(waiting_pool, ResourceClass::Ocr, 768 * MIB, || {
                let _ = entered.try_send(());
                flag.load(Ordering::SeqCst)
            })
            .is_err();
            finished.send(()).unwrap();
            result
        });
        waiting.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(matches!(
            completion.recv_timeout(Duration::from_millis(30)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));
        cancelled.store(true, Ordering::SeqCst);
        assert!(worker.join().unwrap());
        drop(first);
        let next = reserve_from(pool.clone(), ResourceClass::Ocr, 768 * MIB, || false).unwrap();
        assert_eq!(pool.usage.lock().unwrap().bytes, 768 * MIB);
        drop(next);
        assert_eq!(pool.usage.lock().unwrap().bytes, 0);
    }

    #[test]
    fn retained_ocr_worker_never_permanently_blocks_a_maximum_image() {
        let pool = Arc::new(Pool::default());
        let _ocr = reserve_from(pool.clone(), ResourceClass::Ocr, 768 * MIB, || false).unwrap();
        let _image = reserve_from(
            pool.clone(),
            ResourceClass::Image,
            MAX_RESERVATION_BYTES,
            || false,
        )
        .unwrap();
        assert_eq!(pool.usage.lock().unwrap().bytes, TOTAL_BYTES);
    }

    #[test]
    fn oversized_images_are_rejected_before_decoder_allocation() {
        let pool = Arc::new(Pool::default());
        assert!(reserve_from(pool, ResourceClass::Image, TOTAL_BYTES + 1, || false).is_err());
    }
}
