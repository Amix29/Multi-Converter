use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Format {
    pub id: &'static str,
    pub format: &'static str,
    pub label: &'static str,
    pub extensions: &'static [&'static str],
    pub extension: &'static str,
    pub category: &'static str,
    pub category_id: &'static str,
    pub detail: &'static str,
    pub rank: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetFormat {
    pub format: String,
    pub label: String,
    pub extensions: Vec<String>,
    pub extension: String,
    pub category: String,
    pub category_id: String,
    pub detail: String,
    pub rank: usize,
    pub engine: String,
    pub engine_label: String,
    pub engine_available: bool,
    pub availability: String,
}

struct Category {
    id: &'static str,
    label: &'static str,
    formats: &'static [(
        &'static str,
        &'static str,
        &'static [&'static str],
        &'static str,
    )],
}

const CATEGORIES: &[Category] = &[
    Category {
        id: "documents",
        label: "Texte & Documents",
        formats: &[
            ("pdf", "PDF", &["pdf"], "Diffusion/impression universelle"),
            (
                "docx",
                "DOCX",
                &["docx"],
                "Traitement de texte professionnel",
            ),
            ("txt", "TXT", &["txt", "log"], "Texte brut, tout support"),
            ("html", "HTML", &["html", "htm"], "Pages web"),
            ("csv", "CSV", &["csv"], "Données tabulaires"),
            ("json", "JSON", &["json"], "Données structurées web/API"),
            ("odt", "ODT", &["odt"], "Suite libre OpenDocument"),
            ("rtf", "RTF", &["rtf"], "Échange basique avec formatage"),
            (
                "md",
                "Markdown",
                &["md", "markdown"],
                "Documentation, blogs",
            ),
            ("epub", "ePub", &["epub"], "Livres numériques"),
            ("xml", "XML", &["xml"], "Données structurées"),
        ],
    },
    Category {
        id: "images",
        label: "Image",
        formats: &[
            ("png", "PNG", &["png"], "Web, logos, transparence"),
            ("jpg", "JPEG", &["jpg", "jpeg"], "Photos, web"),
            ("svg", "SVG", &["svg"], "Source vectorielle rasterisable"),
            ("webp", "WebP", &["webp"], "Web moderne"),
            ("tiff", "TIFF", &["tif", "tiff"], "Impression, archivage"),
            ("bmp", "BMP", &["bmp"], "Windows non compressé"),
            ("ico", "ICO", &["ico"], "Icônes"),
        ],
    },
    Category {
        id: "video",
        label: "Vidéo",
        formats: &[
            ("mp4", "MP4", &["mp4", "m4v"], "Web, smartphones, streaming"),
            ("mkv", "MKV", &["mkv"], "Stockage HD/4K"),
            ("webm", "WebM", &["webm"], "HTML5, web"),
            ("mov", "MOV", &["mov"], "Apple, montage vidéo"),
            ("avi", "AVI", &["avi"], "Ancien conteneur Windows"),
            ("wmv", "WMV", &["wmv"], "Windows Media"),
            ("3gp", "3GP/3G2", &["3gp", "3g2"], "Mobiles anciens"),
            ("mts", "MTS/M2TS", &["mts", "m2ts"], "Blu-ray, caméscopes"),
            (
                "mpeg2",
                "MPEG-2",
                &["mpg", "mpeg", "mpeg2"],
                "Diffusion TV, DVD",
            ),
            ("ogv", "OGV", &["ogv"], "Ogg Theora"),
        ],
    },
    Category {
        id: "audio",
        label: "Audio",
        formats: &[
            ("mp3", "MP3", &["mp3"], "Compression universelle"),
            (
                "m4a",
                "AAC (M4A)",
                &["m4a", "aac"],
                "Streaming, Apple, YouTube",
            ),
            ("flac", "FLAC", &["flac"], "Lossless audiophile"),
            ("wav", "WAV", &["wav"], "Studio, Windows"),
            (
                "ogg",
                "OGG Vorbis",
                &["ogg", "oga"],
                "Jeux, streaming libre",
            ),
            ("wma", "WMA", &["wma"], "Ancien Windows Media"),
            ("opus", "Opus", &["opus"], "Streaming/voix moderne"),
            (
                "aiff",
                "AIFF",
                &["aiff", "aif"],
                "Apple, production musicale",
            ),
            ("alac", "ALAC", &["alac"], "Lossless Apple"),
            ("ac3", "AC3", &["ac3"], "Dolby Digital surround"),
            ("mp2", "MP2", &["mp2"], "Diffusion radio"),
            ("amr", "AMR", &["amr"], "Voix mobile ancien"),
            ("au", "AU", &["au", "snd"], "Unix historique"),
            ("caf", "CAF", &["caf"], "Apple Core Audio"),
        ],
    },
];

const INTEGRATED_DOCUMENT_SOURCES: &[&str] = &[
    "pdf", "txt", "md", "html", "csv", "json", "xml", "rtf", "docx", "odt", "epub",
];
const INTEGRATED_DOCUMENT_TARGETS: &[&str] = &[
    "txt", "pdf", "docx", "odt", "rtf", "html", "md", "epub", "xml", "csv", "json",
];
const PDF_TEXT_TARGETS: &[&str] = &["txt", "md", "html", "csv", "json", "xml"];

pub fn formats() -> Vec<Format> {
    CATEGORIES
        .iter()
        .flat_map(|category| {
            category
                .formats
                .iter()
                .enumerate()
                .map(|(index, item)| Format {
                    id: item.0,
                    format: item.0,
                    label: item.1,
                    extensions: item.2,
                    extension: item.2[0],
                    category: category.label,
                    category_id: category.id,
                    detail: item.3,
                    rank: index + 1,
                })
        })
        .collect()
}

pub fn get_format_by_extension(extension: &str) -> Option<Format> {
    let normalized = extension.trim_start_matches('.').to_ascii_lowercase();
    formats()
        .into_iter()
        .find(|format| format.extensions.iter().any(|item| *item == normalized))
}

pub fn get_format_by_id(id: &str) -> Option<Format> {
    formats().into_iter().find(|format| format.id == id)
}

pub fn get_targets_for_extension(extension: &str) -> Vec<TargetFormat> {
    let Some(source) = get_format_by_extension(extension) else {
        return Vec::new();
    };

    let all_formats = formats();
    let mut targets: Vec<_> = all_formats
        .clone()
        .into_iter()
        .filter(|target| {
            if target.id == source.id {
                return false;
            }
            if source.id == "pdf" {
                return PDF_TEXT_TARGETS.contains(&target.id);
            }
            if source.category_id == "video" && target.category_id == "audio" {
                return get_engine(&source, target) != "external";
            }
            target.category_id == source.category_id && get_engine(&source, target) != "external"
        })
        .map(|target| TargetFormat {
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
            engine: get_engine(&source, &target).to_string(),
            engine_label: get_engine(&source, &target).to_string(),
            engine_available: get_engine(&source, &target) != "external",
            availability: "available".to_string(),
        })
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

pub fn get_engine(source: &Format, target: &Format) -> &'static str {
    let ffmpeg_audio = [
        "mp3", "m4a", "flac", "wav", "ogg", "wma", "opus", "aiff", "alac", "ac3", "mp2", "amr",
        "au", "caf",
    ];
    let ffmpeg_video = [
        "mp4", "mkv", "webm", "mov", "avi", "wmv", "3gp", "mts", "mpeg2", "ogv",
    ];

    if source.id == "pdf" && target.category_id == "images" && matches!(target.id, "png" | "jpg") {
        return "pdfium";
    }
    if source.category_id == "audio" && target.category_id == "audio" {
        return if ffmpeg_audio.contains(&source.id) && ffmpeg_audio.contains(&target.id) {
            "ffmpeg"
        } else {
            "external"
        };
    }
    if source.category_id == "video" && target.category_id == "video" {
        return if ffmpeg_video.contains(&source.id) && ffmpeg_video.contains(&target.id) {
            "ffmpeg"
        } else {
            "external"
        };
    }
    if source.category_id == "video" && target.category_id == "audio" {
        return if ffmpeg_video.contains(&source.id) && ffmpeg_audio.contains(&target.id) {
            "ffmpeg"
        } else {
            "external"
        };
    }
    if source.category_id == "images" && target.category_id == "images" {
        let image_sources = ["png", "jpg", "svg", "webp", "tiff", "bmp", "ico"];
        let image_targets = ["png", "jpg", "webp", "tiff", "bmp", "ico"];
        return if image_sources.contains(&source.id) && image_targets.contains(&target.id) {
            "image"
        } else {
            "external"
        };
    }
    if source.category_id == "documents" && target.category_id == "documents" {
        if source.id == "pdf" {
            return if PDF_TEXT_TARGETS.contains(&target.id) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v1_exposes_only_public_categories() {
        let categories = formats()
            .into_iter()
            .map(|format| format.category_id)
            .collect::<std::collections::BTreeSet<_>>();

        assert_eq!(
            categories,
            ["audio", "documents", "images", "video"]
                .into_iter()
                .collect()
        );
        for id in [
            "office",
            "archives",
            "fonts",
            "databases",
            "cad",
            "models3d",
            "subtitles",
        ] {
            assert!(!categories.contains(id));
        }
    }

    #[test]
    fn pdf_text_conversions_are_limited_to_plain_text_targets() {
        let targets = get_targets_for_extension("pdf")
            .into_iter()
            .filter(|target| target.engine == "text")
            .map(|target| target.format)
            .collect::<Vec<_>>();

        assert_eq!(targets.len(), 6);
        assert!(targets.contains(&"txt".to_string()));
        assert!(targets.contains(&"html".to_string()));
        assert!(!targets.contains(&"docx".to_string()));
        assert!(!targets.contains(&"epub".to_string()));
        assert!(!targets.contains(&"tex".to_string()));
        assert!(!targets.contains(&"ps".to_string()));
    }

    #[test]
    fn registry_exposes_quality_targets_as_engine_backed_options() {
        let pdf_targets = get_targets_for_extension("pdf");
        assert!(!pdf_targets.iter().any(|target| target.format == "docx"));
        assert!(pdf_targets.iter().any(|target| target.format == "png"
            && target.engine == "pdfium"
            && target.extension == "zip"));

        let image_targets = get_targets_for_extension("png")
            .into_iter()
            .map(|target| target.format)
            .collect::<Vec<_>>();
        assert!(!image_targets.contains(&"txt".to_string()));
    }

    #[test]
    fn image_registry_does_not_expose_unvalidated_advanced_formats() {
        for id in ["heic", "heif", "avif", "raw", "psd", "jp2"] {
            assert!(
                get_format_by_id(id).is_none(),
                "{id} should stay hidden until the packaged engine proves support"
            );
        }
    }

    #[test]
    fn public_image_formats_all_have_targets() {
        for extension in ["png", "jpg", "svg", "webp", "tiff", "bmp", "ico"] {
            let targets = get_targets_for_extension(extension);
            assert!(
                !targets.is_empty(),
                "{extension} should expose image targets"
            );
        }

        let ico_targets = get_targets_for_extension("ico")
            .into_iter()
            .map(|target| target.format)
            .collect::<Vec<_>>();
        assert!(ico_targets.contains(&"png".to_string()));
        assert!(ico_targets.contains(&"jpg".to_string()));

        let png_targets = get_targets_for_extension("png")
            .into_iter()
            .map(|target| target.format)
            .collect::<Vec<_>>();
        assert!(png_targets.contains(&"bmp".to_string()));
    }

    #[test]
    fn v1_does_not_expose_retired_formats() {
        for id in [
            "doc", "mobi", "ps", "tex", "pages", "wps", "flv", "vob", "avchd", "divx", "xvid",
            "mxf", "dts", "ape",
        ] {
            assert!(
                get_format_by_id(id).is_none(),
                "{id} should be roadmap-only"
            );
        }
    }

    #[test]
    fn base_media_formats_keep_ffmpeg_targets() {
        let mp4_targets = get_targets_for_extension("mp4");
        assert!(
            mp4_targets
                .iter()
                .any(|target| target.format == "webm" && target.engine == "ffmpeg")
        );
        assert!(
            mp4_targets
                .iter()
                .any(|target| target.format == "mp3" && target.engine == "ffmpeg")
        );

        let wav_targets = get_targets_for_extension("wav");
        assert!(
            wav_targets
                .iter()
                .any(|target| target.format == "mp3" && target.engine == "ffmpeg")
        );
    }

    #[test]
    fn raster_images_are_not_offered_as_svg_targets() {
        let targets = get_targets_for_extension("png")
            .into_iter()
            .map(|target| target.format)
            .collect::<Vec<_>>();

        assert!(!targets.contains(&"svg".to_string()));
    }
}
