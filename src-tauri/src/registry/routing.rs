use super::catalog::{
    FFMPEG_AUDIO_FORMATS, FFMPEG_VIDEO_FORMATS, INTEGRATED_DOCUMENT_SOURCES,
    INTEGRATED_DOCUMENT_TARGETS, PDF_TEXT_TARGETS,
};
use super::contracts::Format;

pub fn get_engine(source: &Format, target: &Format) -> &'static str {
    if source.id == "gif" && target.category_id == "video" {
        return if FFMPEG_VIDEO_FORMATS.contains(&target.id) {
            "ffmpeg"
        } else {
            "external"
        };
    }
    if source.id == "pdf" && target.category_id == "images" && matches!(target.id, "png" | "jpg") {
        return "pdfium";
    }
    if source.category_id == "audio" && target.category_id == "audio" {
        return if FFMPEG_AUDIO_FORMATS.contains(&source.id)
            && FFMPEG_AUDIO_FORMATS.contains(&target.id)
        {
            "ffmpeg"
        } else {
            "external"
        };
    }
    if source.category_id == "video" && target.category_id == "video" {
        return if FFMPEG_VIDEO_FORMATS.contains(&source.id)
            && FFMPEG_VIDEO_FORMATS.contains(&target.id)
        {
            "ffmpeg"
        } else {
            "external"
        };
    }
    if source.category_id == "video" && target.category_id == "audio" {
        return if FFMPEG_VIDEO_FORMATS.contains(&source.id)
            && FFMPEG_AUDIO_FORMATS.contains(&target.id)
        {
            "ffmpeg"
        } else {
            "external"
        };
    }
    if source.category_id == "images" && target.category_id == "images" {
        let image_sources = ["png", "jpg", "gif", "svg", "webp", "tiff", "bmp", "ico"];
        let image_targets = ["png", "jpg", "gif", "webp", "tiff", "bmp", "ico"];
        return if image_sources.contains(&source.id) && image_targets.contains(&target.id) {
            "image"
        } else {
            "external"
        };
    }
    if source.category_id == "documents" && target.category_id == "documents" {
        if target.id == "doc" || source.id == "doc" {
            return "external";
        }
        if source.id == "pdf" {
            return if matches!(target.id, "docx" | "odt" | "rtf")
                || PDF_TEXT_TARGETS.contains(&target.id)
            {
                "text"
            } else {
                "external"
            };
        }
        return if INTEGRATED_DOCUMENT_SOURCES.contains(&source.id)
            && INTEGRATED_DOCUMENT_TARGETS.contains(&target.id)
        {
            "text"
        } else {
            "external"
        };
    }
    "external"
}
