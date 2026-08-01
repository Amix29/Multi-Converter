mod contracts;
mod manifest;
mod network;
mod paths;

// Keep the domain facade stable even when some contract types are only named by tests today.
#[allow(unused_imports)]
pub use contracts::{ArchiveType, EngineManifest, ManifestEngine};
#[allow(unused_imports)]
pub use manifest::{current_platform_id, load_manifest, manifest_for_platform};
pub use network::https_url_available;
pub use paths::{cleanup_stale_installing_dirs, installed_binary, installed_size};

#[cfg(test)]
mod tests;
