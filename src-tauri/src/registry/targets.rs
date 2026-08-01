use super::catalog::{PDF_TEXT_TARGETS, formats, get_format_by_extension};
use super::contracts::{Format, TargetFormat};
use super::routing::get_engine;

pub fn get_targets_for_extension(extension: &str) -> Vec<TargetFormat> {
    let Some(source) = get_format_by_extension(extension) else {
        return Vec::new();
    };

    let all_formats = formats();
    let mut targets: Vec<_> = all_formats
        .clone()
        .into_iter()
        .filter(|target| {
            if target.id == source.id || target.id == "doc" {
                return false;
            }
            if source.id == "pdf" {
                return PDF_TEXT_TARGETS.contains(&target.id)
                    || matches!(target.id, "docx" | "odt" | "rtf");
            }
            if source.id == "doc" {
                return matches!(
                    target.id,
                    "docx" | "odt" | "rtf" | "pdf" | "html" | "txt" | "epub"
                );
            }
            if source.id == "gif" {
                return (target.category_id == "images" || target.category_id == "video")
                    && get_engine(&source, target) != "external";
            }
            if source.category_id == "video" && target.category_id == "audio" {
                return get_engine(&source, target) != "external";
            }
            target.category_id == source.category_id && get_engine(&source, target) != "external"
        })
        .map(|target| make_target(&target, get_engine(&source, &target)))
        .collect();
    if source.id == "pdf" {
        for image_id in ["png", "jpg"] {
            if let Some(target) = all_formats.iter().find(|format| format.id == image_id) {
                targets.push(make_pdf_page_archive_target(target, "pdfium"));
            }
        }
    }
    targets.sort_by_key(|target| target.rank);
    targets
}

fn make_target(target: &Format, engine: &str) -> TargetFormat {
    TargetFormat {
        format: target.id.to_string(),
        label: target.label.to_string(),
        extensions: target
            .extensions
            .iter()
            .map(|item| item.to_string())
            .collect(),
        extension: target.extension.to_string(),
        category: target.category.to_string(),
        category_id: target.category_id.to_string(),
        detail: target.detail.to_string(),
        rank: target.rank,
        engine: engine.to_string(),
        engine_label: engine.to_string(),
        engine_available: engine != "external",
        availability: "available".to_string(),
    }
}

fn make_pdf_page_archive_target(target: &Format, engine: &str) -> TargetFormat {
    let mut item = make_target(target, engine);
    item.extension = "zip".to_string();
    item.detail = format!("{} (toutes les pages dans un ZIP)", target.detail);
    item
}
