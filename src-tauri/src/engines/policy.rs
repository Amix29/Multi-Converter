use super::catalog::{TOOLS, tool_label};
use super::contracts::EngineSelection;
use super::health::{evaluate_tool, is_available};
use crate::registry::{Format, TargetFormat};
use tauri::AppHandle;

pub fn decorate_target(
    app: Option<&AppHandle>,
    source: &Format,
    mut target: TargetFormat,
) -> TargetFormat {
    let selection = select_engine(
        app,
        source,
        &target.format,
        &target.category_id,
        &target.engine,
    );
    target.engine = selection.id;
    target.engine_label = selection.label;
    target.engine_available = selection.available;
    target.availability = if selection.available {
        "available".to_string()
    } else {
        "unavailable".to_string()
    };
    target
}

pub fn select_engine(
    app: Option<&AppHandle>,
    source: &Format,
    target_id: &str,
    target_category_id: &str,
    builtin_engine: &str,
) -> EngineSelection {
    if builtin_engine == "ffmpeg" {
        let ready = is_available(app, "ffmpeg") && is_available(app, "ffprobe");
        return EngineSelection {
            id: "ffmpeg".to_string(),
            label: "FFmpeg".to_string(),
            available: ready,
            plan: vec!["FFmpeg".to_string(), "ffprobe".to_string()],
            #[cfg(test)]
            required_engine_ids: vec!["ffmpeg".to_string(), "ffprobe".to_string()],
            reason: if ready {
                fidelity_reason(source, target_id, target_category_id)
            } else {
                "FFmpeg et ffprobe doivent être présents, à la bonne version et réussir leurs tests réels pour activer l'audio, la vidéo et l'extraction audio depuis vidéo.".to_string()
            },
        };
    }
    let candidates = engine_candidates(source, target_id, target_category_id, builtin_engine);
    let labels = candidates
        .iter()
        .map(|id| tool_label(id).to_string())
        .collect::<Vec<_>>();
    for candidate in &candidates {
        if is_candidate_available(app, candidate) {
            return EngineSelection {
                id: (*candidate).to_string(),
                label: tool_label(candidate).to_string(),
                available: true,
                plan: labels,
                #[cfg(test)]
                required_engine_ids: vec![(*candidate).to_string()],
                reason: fidelity_reason(source, target_id, target_category_id),
            };
        }
    }
    let fallback = candidates.first().copied().unwrap_or("non-integrated");
    EngineSelection {
        id: fallback.to_string(),
        label: labels
            .first()
            .cloned()
            .unwrap_or_else(|| "Conversion non intégrée".to_string()),
        available: false,
        plan: labels,
        #[cfg(test)]
        required_engine_ids: candidates.iter().map(|id| (*id).to_string()).collect(),
        reason: unavailable_reason(app, &candidates, source, target_id, target_category_id),
    }
}

pub(super) fn engine_candidates(
    source: &Format,
    target_id: &str,
    target_category_id: &str,
    builtin_engine: &str,
) -> Vec<&'static str> {
    if builtin_engine == "ffmpeg" {
        return vec!["ffmpeg", "ffprobe"];
    }
    if builtin_engine == "pdfium" {
        return vec!["pdfium"];
    }
    if source.category_id == "images" && target_category_id == "images" {
        if target_id == "svg" {
            return vec!["non-integrated"];
        }
        if source.id == "svg" {
            return vec!["resvg", "rust-image"];
        }
        if matches!(source.id, "png" | "jpg" | "webp" | "tiff")
            && matches!(target_id, "png" | "jpg" | "webp" | "tiff")
        {
            return vec!["libvips", "rust-image"];
        }
        return vec!["rust-image"];
    }
    if source.category_id == "documents" && target_category_id == "documents" {
        if source.id == "doc" {
            return vec!["libreoffice"];
        }
        if source.id == "pdf" {
            return vec!["pdf-extract", "rust-text"];
        }
        if office_like(source.id) && is_layoutless_document_target(target_id) {
            return vec!["rust-text"];
        }
        if prefers_pandoc(source.id, target_id) {
            return vec!["pandoc", "rust-text"];
        }
        if prefers_libreoffice(source.id, target_id) {
            return vec!["libreoffice", "rust-text"];
        }
        if target_id == "pdf" {
            return vec!["rust-text"];
        }
        return vec!["rust-text"];
    }
    match source.category_id {
        _ if builtin_engine == "image" => vec!["rust-image"],
        _ if builtin_engine == "text" => vec!["rust-text"],
        _ => vec!["non-integrated"],
    }
}

fn is_candidate_available(app: Option<&AppHandle>, id: &str) -> bool {
    let Some(tool) = TOOLS.iter().find(|tool| tool.id == id) else {
        return false;
    };
    evaluate_tool(app, tool, false).available
}

fn unavailable_reason(
    app: Option<&AppHandle>,
    candidates: &[&'static str],
    source: &Format,
    target_id: &str,
    target_category_id: &str,
) -> String {
    if candidates.contains(&"non-integrated") {
        return fidelity_reason(source, target_id, target_category_id);
    }
    for id in candidates {
        if let Some(tool) = TOOLS.iter().find(|tool| tool.id == *id) {
            let check = evaluate_tool(app, tool, false);
            if !check.available {
                return check
                    .blocked_reason
                    .unwrap_or_else(|| "Moteur indisponible.".to_string());
            }
        }
    }
    fidelity_reason(source, target_id, target_category_id)
}

fn fidelity_reason(source: &Format, target_id: &str, target_category_id: &str) -> String {
    if source.category_id == "images" && target_category_id == "images" && target_id == "svg" {
        return "Conversion volontairement désactivée : une image raster ne doit pas être annoncée comme vrai SVG vectoriel sans moteur de vectorisation.".to_string();
    }
    if source.id == "pdf" && is_rich_document_target(target_id) {
        return "Conversion volontairement désactivée : PDF vers document Office fidèle n'est pas garanti par le workflow actuel.".to_string();
    }
    if office_like(source.id) || office_like(target_id) {
        return "Conversion basique disponible seulement avec le moteur texte intégré ; mise en page non garantie sans LibreOffice.".to_string();
    }
    "Aucun moteur fiable n'est prêt pour cette conversion locale.".to_string()
}

fn is_rich_document_target(target_id: &str) -> bool {
    matches!(target_id, "docx" | "odt" | "rtf")
}

fn is_layoutless_document_target(target_id: &str) -> bool {
    matches!(target_id, "txt" | "md" | "csv" | "json" | "xml")
}

fn office_like(format_id: &str) -> bool {
    matches!(format_id, "doc" | "docx" | "odt" | "rtf")
}

fn prefers_libreoffice(source_id: &str, target_id: &str) -> bool {
    office_like(source_id)
        || office_like(target_id)
        || (target_id == "pdf" && !matches!(source_id, "txt" | "csv" | "json" | "xml" | "md"))
}

fn prefers_pandoc(source_id: &str, target_id: &str) -> bool {
    matches!(source_id, "md" | "html" | "epub" | "docx")
        && matches!(target_id, "md" | "html" | "epub" | "docx")
}
