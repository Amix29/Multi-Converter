use super::contracts::Format;

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
            (
                "doc",
                "DOC",
                &["doc"],
                "Ancien document Word, conversion avec LibreOffice embarqué",
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
            ("gif", "GIF", &["gif"], "Image ou animation courte"),
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

pub(super) const INTEGRATED_DOCUMENT_SOURCES: &[&str] = &[
    "pdf", "txt", "md", "html", "csv", "json", "xml", "rtf", "docx", "odt", "epub",
];
pub(super) const INTEGRATED_DOCUMENT_TARGETS: &[&str] = &[
    "txt", "pdf", "docx", "odt", "rtf", "html", "md", "epub", "xml", "csv", "json",
];
pub(super) const PDF_TEXT_TARGETS: &[&str] = &["txt", "md", "html", "csv", "json", "xml"];
#[cfg(target_os = "macos")]
pub(super) const FFMPEG_AUDIO_FORMATS: &[&str] = &[
    "mp3", "m4a", "flac", "wav", "ogg", "wma", "opus", "aiff", "alac", "ac3", "mp2", "au", "caf",
];
#[cfg(not(target_os = "macos"))]
pub(super) const FFMPEG_AUDIO_FORMATS: &[&str] = &[
    "mp3", "m4a", "flac", "wav", "ogg", "wma", "opus", "aiff", "alac", "ac3", "mp2", "amr", "au",
    "caf",
];
pub(super) const FFMPEG_VIDEO_FORMATS: &[&str] = &[
    "mp4", "mkv", "webm", "mov", "avi", "wmv", "3gp", "mts", "mpeg2", "ogv",
];

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
