mod catalog;
mod contracts;
mod routing;
mod targets;

#[allow(unused_imports)]
pub use catalog::{formats, get_format_by_extension, get_format_by_id};
pub use contracts::{Format, TargetFormat};
pub use routing::get_engine;
pub use targets::get_targets_for_extension;

#[cfg(test)]
mod tests;
