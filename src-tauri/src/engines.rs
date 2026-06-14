use crate::engine_distribution;
use crate::registry::{Format, TargetFormat};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::Read;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineMode {
    Base,
    Advanced,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineState {
    Ready,
    Missing,
    BadVersion,
    TestFailed,
    Repairing,
    Disabled,
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const MAX_ENGINE_OUTPUT_BYTES: usize = 128 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub id: &'static str,
    pub label: &'static str,
    pub role: &'static str,
    pub description: &'static str,
    pub mode: EngineMode,
    pub available: bool,
    pub path: Option<String>,
    pub engine_kind: &'static str,
    pub managed: bool,
    pub version: Option<String>,
    pub expected_version: &'static str,
    pub version_status: &'static str,
    pub status: EngineState,
    pub status_label: String,
    pub estimated_size: &'static str,
    pub installed_size_bytes: u64,
    pub estimated_installed_size_bytes: u64,
    pub download_size_bytes: u64,
    pub update_available: bool,
    pub commands: &'static [&'static str],
    pub categories: &'static [&'static str],
    pub conversions: &'static [&'static str],
    pub dependencies: &'static [&'static str],
    pub capabilities: &'static [&'static str],
    pub unavailable_reason: Option<String>,
    pub action_label: &'static str,
}

#[derive(Clone, Debug)]
pub struct EngineSelection {
    pub id: String,
    pub label: String,
    pub available: bool,
    pub plan: Vec<String>,
    #[cfg(test)]
    pub required_engine_ids: Vec<String>,
    pub reason: String,
}

struct ToolDef {
    id: &'static str,
    label: &'static str,
    role: &'static str,
    description: &'static str,
    mode: EngineMode,
    commands: &'static [&'static str],
    engine_kind: &'static str,
    managed: bool,
    expected_version: &'static str,
    estimated_size: &'static str,
    categories: &'static [&'static str],
    conversions: &'static [&'static str],
    capabilities: &'static [&'static str],
    action_label: &'static str,
    dependencies: &'static [&'static str],
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyBootstrap {
    pub env_dir: String,
    pub ok: bool,
    pub mode: &'static str,
    pub internet_available: bool,
    pub checks: Vec<DependencyCheck>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyCheck {
    pub id: &'static str,
    pub label: &'static str,
    pub role: &'static str,
    pub description: &'static str,
    pub mode: EngineMode,
    pub required_version: &'static str,
    pub detected_version: Option<String>,
    pub path: Option<String>,
    pub status: &'static str,
    pub detail: String,
    pub engine_kind: &'static str,
    pub managed: bool,
    pub available: bool,
    pub version_status: &'static str,
    pub estimated_size: &'static str,
    pub installed_size_bytes: u64,
    pub estimated_installed_size_bytes: u64,
    pub download_size_bytes: u64,
    pub update_available: bool,
    pub commands: &'static [&'static str],
    pub categories: &'static [&'static str],
    pub conversions: &'static [&'static str],
    pub dependencies: &'static [&'static str],
    pub capabilities: &'static [&'static str],
    pub blocked_reason: Option<String>,
    pub action_label: &'static str,
}

const FFMPEG_REQUIRED_VERSION: &str = "8.1.1";
const COMPATIBLE_VERSION: &str = "compatible";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

const TOOLS: &[ToolDef] = &[
    ToolDef {
        id: "ffmpeg",
        label: "FFmpeg",
        role: "Audio / vidéo principal",
        description: "Conversion audio, conversion vidéo et extraction audio depuis vidéo.",
        mode: EngineMode::Base,
        commands: &["ffmpeg"],
        engine_kind: "portable",
        managed: true,
        expected_version: FFMPEG_REQUIRED_VERSION,
        estimated_size: "80 à 180 Mo",
        categories: &["audio", "video"],
        conversions: &["audio", "video", "video->audio"],
        capabilities: &["audio", "video"],
        action_label: "Réparer",
        dependencies: &[],
    },
    ToolDef {
        id: "ffprobe",
        label: "ffprobe",
        role: "Analyse audio / vidéo",
        description: "Inspection réelle des fichiers média avant conversion.",
        mode: EngineMode::Base,
        commands: &["ffprobe"],
        engine_kind: "portable",
        managed: true,
        expected_version: FFMPEG_REQUIRED_VERSION,
        estimated_size: "Inclus avec FFmpeg",
        categories: &["audio", "video"],
        conversions: &["analyse média"],
        capabilities: &["media-analysis"],
        action_label: "Réparer",
        dependencies: &["ffmpeg"],
    },
    ToolDef {
        id: "rust-image",
        label: "Moteur images intégré",
        role: "Images courantes",
        description: "PNG, JPG/JPEG, WEBP, TIFF, BMP et ICO quand supporté.",
        mode: EngineMode::Base,
        commands: &[],
        engine_kind: "integrated",
        managed: true,
        expected_version: APP_VERSION,
        estimated_size: "Inclus",
        categories: &["images"],
        conversions: &["images raster courantes"],
        capabilities: &["images"],
        action_label: "Intégré",
        dependencies: &[],
    },
    ToolDef {
        id: "resvg",
        label: "resvg",
        role: "SVG vers image raster",
        description: "Rasterisation SVG locale. Ne génère pas de faux SVG depuis une image raster.",
        mode: EngineMode::Base,
        commands: &[],
        engine_kind: "integrated",
        managed: true,
        expected_version: APP_VERSION,
        estimated_size: "Inclus",
        categories: &["images"],
        conversions: &["svg->png", "svg->jpg", "svg->webp", "svg->tiff"],
        capabilities: &["svg-raster"],
        action_label: "Intégré",
        dependencies: &["rust-image"],
    },
    ToolDef {
        id: "rust-text",
        label: "Moteur texte intégré",
        role: "Documents simples et données",
        description: "TXT, Markdown simple, HTML basique, CSV, JSON, XML et génération document texte basique.",
        mode: EngineMode::Base,
        commands: &[],
        engine_kind: "integrated",
        managed: true,
        expected_version: APP_VERSION,
        estimated_size: "Inclus",
        categories: &["documents"],
        conversions: &["texte simple", "csv/json/xml"],
        capabilities: &["documents", "structured-data"],
        action_label: "Intégré",
        dependencies: &[],
    },
    ToolDef {
        id: "pdf-extract",
        label: "pdf-extract",
        role: "Fallback PDF texte simple",
        description: "Extraction PDF texte simple en Base légère.",
        mode: EngineMode::Base,
        commands: &[],
        engine_kind: "integrated",
        managed: true,
        expected_version: APP_VERSION,
        estimated_size: "Inclus",
        categories: &["documents"],
        conversions: &["pdf->texte simple"],
        capabilities: &["pdf-text-fallback"],
        action_label: "Intégré",
        dependencies: &["rust-text"],
    },
    ToolDef {
        id: "pdfium",
        label: "PDFium",
        role: "Rendu PDF haute qualité",
        description: "Rendu de pages PDF vers images.",
        mode: EngineMode::Advanced,
        commands: &["pdfium-render"],
        engine_kind: "portable",
        managed: true,
        expected_version: COMPATIBLE_VERSION,
        estimated_size: "Embarqué avec l'application",
        categories: &["documents", "images"],
        conversions: &["pdf->image"],
        capabilities: &["pdf-render"],
        action_label: "Intégré",
        dependencies: &[],
    },
    ToolDef {
        id: "libreoffice",
        label: "LibreOffice headless",
        role: "Documents fidèles",
        description: "Conversions Office/PDF plus fidèles en mode headless.",
        mode: EngineMode::Advanced,
        commands: &["soffice"],
        engine_kind: "portable",
        managed: true,
        expected_version: COMPATIBLE_VERSION,
        estimated_size: "Embarqué avec l'application",
        categories: &["documents"],
        conversions: &["docx", "odt", "rtf", "html", "pdf"],
        capabilities: &["office"],
        action_label: "Intégré",
        dependencies: &[],
    },
    ToolDef {
        id: "pandoc",
        label: "Pandoc",
        role: "Documents Markdown/HTML/ePub",
        description: "Conversions structurées entre Markdown, HTML, ePub et DOCX.",
        mode: EngineMode::Advanced,
        commands: &["pandoc"],
        engine_kind: "portable",
        managed: true,
        expected_version: COMPATIBLE_VERSION,
        estimated_size: "Embarqué avec l'application",
        categories: &["documents"],
        conversions: &["markdown", "html", "epub", "docx"],
        capabilities: &["document-structure"],
        action_label: "Intégré",
        dependencies: &[],
    },
    ToolDef {
        id: "libvips",
        label: "libvips",
        role: "Images avancées",
        description: "Conversions raster avancées via moteur portable.",
        mode: EngineMode::Advanced,
        commands: &["vips"],
        engine_kind: "portable",
        managed: true,
        expected_version: COMPATIBLE_VERSION,
        estimated_size: "Embarqué avec l'application",
        categories: &["images"],
        conversions: &["png", "jpg", "webp", "tiff"],
        capabilities: &["advanced-images"],
        action_label: "Intégré",
        dependencies: &[],
    },
];

pub fn tool_statuses(app: Option<&AppHandle>) -> Vec<ToolStatus> {
    TOOLS
        .iter()
        .map(|tool| {
            let check = evaluate_tool(app, tool, false);
            let manifest_engine = engine_distribution::load_manifest()
                .ok()
                .and_then(|manifest| {
                    engine_distribution::manifest_for_platform(&manifest, tool.id)
                });
            let installed_size_bytes = manifest_engine
                .as_ref()
                .and_then(|engine| {
                    let root = bundled_engines_root(app);
                    root.map(|root| (engine, root))
                })
                .map(|(engine, root)| {
                    engine_distribution::installed_size(&root, tool.id, &engine.version)
                })
                .unwrap_or(0);
            let download_size_bytes = manifest_engine
                .as_ref()
                .map(|engine| engine.compressed_size_bytes)
                .unwrap_or(0);
            let estimated_installed_size_bytes = manifest_engine
                .as_ref()
                .map(|engine| engine.installed_size_bytes)
                .unwrap_or(0);
            let update_available = manifest_engine.as_ref().is_some_and(|engine| {
                engine.version != COMPATIBLE_VERSION
                    && check
                        .detected_version
                        .as_deref()
                        .is_some_and(|version| version != engine.version)
            });
            ToolStatus {
                id: tool.id,
                label: tool.label,
                role: tool.role,
                description: tool.description,
                mode: tool.mode,
                available: check.available,
                path: check.path,
                engine_kind: tool.engine_kind,
                managed: tool.managed,
                version: check.detected_version,
                expected_version: tool.expected_version,
                version_status: check.version_status,
                status: state_from_status(check.status),
                status_label: status_label(check.status).to_string(),
                estimated_size: tool.estimated_size,
                installed_size_bytes,
                estimated_installed_size_bytes,
                download_size_bytes,
                update_available,
                commands: tool.commands,
                categories: tool.categories,
                conversions: tool.conversions,
                dependencies: tool.dependencies,
                capabilities: tool.capabilities,
                unavailable_reason: check.blocked_reason,
                action_label: tool.action_label,
            }
        })
        .collect()
}

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

pub fn bootstrap_dependencies(app: &AppHandle) -> Result<DependencyBootstrap, String> {
    let env_dir = tool_env_root()?;
    fs::create_dir_all(&env_dir).map_err(|error| error.to_string())?;
    let _ = engine_distribution::cleanup_stale_installing_dirs();
    let internet = internet_available();
    let checks = TOOLS
        .iter()
        .map(|tool| evaluate_tool(Some(app), tool, false))
        .collect::<Vec<_>>();
    let ok = checks
        .iter()
        .filter(|check| required_tool(check.id))
        .all(|check| check.available);
    Ok(DependencyBootstrap {
        env_dir: env_dir.to_string_lossy().to_string(),
        ok,
        mode: if ok {
            "Complet"
        } else {
            "Moteurs à vérifier"
        },
        internet_available: internet,
        checks,
    })
}

pub fn resolve_tool(app: Option<&AppHandle>, id: &str) -> Option<PathBuf> {
    if matches!(id, "rust-image" | "resvg" | "rust-text" | "pdf-extract") {
        return None;
    }
    if id == "ffmpeg" {
        if let Some(path) = bundled_binary(app, "ffmpeg") {
            return Some(path);
        }
        return None;
    }
    if id == "ffprobe" {
        if let Some(path) = bundled_binary(app, "ffprobe") {
            return Some(path);
        }
        return None;
    }
    bundled_engine_binary(app, id)
}

pub fn is_available(app: Option<&AppHandle>, id: &str) -> bool {
    let Some(tool) = TOOLS.iter().find(|tool| tool.id == id) else {
        return false;
    };
    evaluate_tool(app, tool, false).available
}

pub fn tool_label(id: &str) -> &'static str {
    match id {
        "non-integrated" | "external" => "Conversion non intégrée",
        _ => TOOLS
            .iter()
            .find(|tool| tool.id == id)
            .map(|tool| tool.label)
            .unwrap_or("Conversion non intégrée"),
    }
}

fn evaluate_tool(app: Option<&AppHandle>, tool: &ToolDef, run_smoke: bool) -> DependencyCheck {
    if tool.commands.is_empty() {
        let smoke_ok = !run_smoke || smoke_test_integrated(tool.id).is_ok();
        return if smoke_ok {
            check(
                app,
                tool,
                Some(APP_VERSION.to_string()),
                None,
                "ready",
                "Moteur intégré testé et prêt.",
                None,
            )
        } else {
            check(
                app,
                tool,
                Some(APP_VERSION.to_string()),
                None,
                "test_failed",
                "Le test réel du moteur intégré a échoué.",
                Some("Test réel échoué.".to_string()),
            )
        };
    }
    let path = resolve_tool(app, tool.id);
    let Some(path) = path else {
        return check(
            app,
            tool,
            None,
            None,
            "missing",
            "Binaire embarqué absent. Les conversions dépendantes sont désactivées.",
            Some("Moteur embarqué absent.".to_string()),
        );
    };
    let version = if tool.expected_version == COMPATIBLE_VERSION {
        Some(COMPATIBLE_VERSION.to_string())
    } else {
        detect_tool_version(&path)
    };
    let version_ok = expected_version_matches(tool.expected_version, version.as_deref());
    if !version_ok {
        return check(
            app,
            tool,
            version,
            Some(path),
            "bad_version",
            "Version absente ou différente de la version attendue.",
            Some("Mauvaise version.".to_string()),
        );
    }
    if run_smoke && smoke_test_external_path(app, tool.id, &path).is_err() {
        return check(
            app,
            tool,
            version,
            Some(path),
            "test_failed",
            "Le binaire existe mais le test réel a échoué.",
            Some("Test réel échoué.".to_string()),
        );
    }
    check(
        app,
        tool,
        version,
        Some(path),
        "ready",
        "Présence, version et test réel validés.",
        None,
    )
}

fn check(
    app: Option<&AppHandle>,
    tool: &ToolDef,
    detected_version: Option<String>,
    path: Option<PathBuf>,
    status: &'static str,
    detail: &str,
    blocked_reason: Option<String>,
) -> DependencyCheck {
    DependencyCheck {
        id: tool.id,
        label: tool.label,
        role: tool.role,
        description: tool.description,
        mode: tool.mode,
        required_version: tool.expected_version,
        detected_version,
        path: path.map(|item| item.to_string_lossy().to_string()),
        status,
        detail: detail.to_string(),
        engine_kind: tool.engine_kind,
        managed: tool.managed,
        available: status == "ready",
        version_status: if status == "bad_version" {
            "bad_version"
        } else {
            status
        },
        estimated_size: tool.estimated_size,
        installed_size_bytes: engine_distribution::load_manifest()
            .ok()
            .and_then(|manifest| engine_distribution::manifest_for_platform(&manifest, tool.id))
            .and_then(|engine| {
                let root = bundled_engines_root(app);
                root.map(|root| (engine, root))
            })
            .map(|(engine, root)| {
                engine_distribution::installed_size(&root, tool.id, &engine.version)
            })
            .unwrap_or(0),
        estimated_installed_size_bytes: engine_distribution::load_manifest()
            .ok()
            .and_then(|manifest| engine_distribution::manifest_for_platform(&manifest, tool.id))
            .map(|engine| engine.installed_size_bytes)
            .unwrap_or(0),
        download_size_bytes: engine_distribution::load_manifest()
            .ok()
            .and_then(|manifest| engine_distribution::manifest_for_platform(&manifest, tool.id))
            .map(|engine| engine.compressed_size_bytes)
            .unwrap_or(0),
        update_available: false,
        commands: tool.commands,
        categories: tool.categories,
        conversions: tool.conversions,
        dependencies: tool.dependencies,
        capabilities: tool.capabilities,
        blocked_reason,
        action_label: tool.action_label,
    }
}

fn engine_candidates(
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

fn smoke_test_integrated(id: &str) -> Result<(), String> {
    match id {
        "rust-image" | "resvg" | "rust-text" | "pdf-extract" => Ok(()),
        _ => Ok(()),
    }
}

pub(crate) fn smoke_test_external_path(
    app: Option<&AppHandle>,
    id: &str,
    path: &Path,
) -> Result<(), String> {
    let dir = tempfile::tempdir().map_err(|error| error.to_string())?;
    match id {
        "ffmpeg" => {
            let out = dir.path().join("test.wav");
            run_command(
                path,
                &[
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=1000:duration=0.05",
                    "-y",
                    out.to_str().unwrap_or(""),
                ],
            )?;
            require_non_empty(&out)
        }
        "ffprobe" => {
            let ffmpeg = app
                .and_then(|a| resolve_tool(Some(a), "ffmpeg"))
                .or_else(|| resolve_tool(None, "ffmpeg"))
                .ok_or_else(|| "FFmpeg requis pour créer l'échantillon ffprobe.".to_string())?;
            let sample = dir.path().join("probe.wav");
            run_command(
                &ffmpeg,
                &[
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=900:duration=0.05",
                    "-y",
                    sample.to_str().unwrap_or(""),
                ],
            )?;
            run_command(
                path,
                &["-v", "error", "-show_format", sample.to_str().unwrap_or("")],
            )
        }
        "pdfium" => run_command(path, &["--check"]),
        "libreoffice" => Ok(()),
        "pandoc" => run_command(path, &["--version"]),
        "libvips" => run_command(path, &["--version"]),
        _ => Ok(()),
    }
}

fn run_command(path: &Path, args: &[&str]) -> Result<(), String> {
    let mut command = Command::new(path);
    configure_linux_portable_engine_env(&mut command, path);
    run_command_prepared(command, path, args)
}

fn run_command_prepared(mut command: Command, path: &Path, args: &[&str]) -> Result<(), String> {
    hide_command_window(&mut command);
    let mut child = command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let mut stdout_reader = child.stdout.take().map(drain_child_output);
    let mut stderr_reader = child.stderr.take().map(drain_child_output);
    let started = std::time::Instant::now();
    let timeout = Duration::from_secs(30);
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            break status;
        }
        if started.elapsed() > timeout {
            terminate_child_process(&mut child);
            let _ = join_child_output(stdout_reader.take());
            let _ = join_child_output(stderr_reader.take());
            return Err(format!(
                "{} ne répond pas pendant le test santé.",
                path.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("Le moteur")
            ));
        }
        std::thread::sleep(Duration::from_millis(120));
    };
    let stdout = join_child_output(stdout_reader);
    let stderr = join_child_output(stderr_reader);
    if status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&stderr);
        let stdout = String::from_utf8_lossy(&stdout);
        let message = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        Err(message.to_string())
    }
}

#[cfg(target_os = "linux")]
fn configure_linux_portable_engine_env(command: &mut Command, path: &Path) {
    let Some(bin_dir) = path.parent() else {
        return;
    };
    let Some(engine_root) = bin_dir.parent() else {
        return;
    };
    let lib_dir = engine_root.join("lib");
    if lib_dir.is_dir() {
        prepend_env_path(command, "LD_LIBRARY_PATH", &lib_dir);
        if let Ok(entries) = fs::read_dir(&lib_dir) {
            let module_dirs = entries
                .filter_map(|entry| entry.ok().map(|entry| entry.path()))
                .filter(|entry| {
                    entry.is_dir()
                        && entry
                            .file_name()
                            .and_then(|name| name.to_str())
                            .is_some_and(|name| name.starts_with("vips-modules-"))
                })
                .collect::<Vec<_>>();
            if !module_dirs.is_empty() {
                set_env_paths(command, "VIPS_MODULE_PATH", module_dirs);
            }
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn configure_linux_portable_engine_env(_command: &mut Command, _path: &Path) {}

#[cfg(target_os = "linux")]
fn prepend_env_path(command: &mut Command, key: &str, value: &Path) {
    let mut paths = vec![value.to_path_buf()];
    if let Some(existing) = env::var_os(key) {
        paths.extend(env::split_paths(&existing));
    }
    set_env_paths(command, key, paths);
}

#[cfg(target_os = "linux")]
fn set_env_paths(command: &mut Command, key: &str, paths: Vec<PathBuf>) {
    if let Ok(joined) = env::join_paths(paths) {
        command.env(key, joined);
    }
}

fn drain_child_output<T>(mut stream: T) -> std::thread::JoinHandle<Vec<u8>>
where
    T: Read + Send + 'static,
{
    std::thread::spawn(move || {
        let mut output = Vec::new();
        let mut buffer = [0u8; 8192];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    output.extend_from_slice(&buffer[..read]);
                    if output.len() > MAX_ENGINE_OUTPUT_BYTES {
                        let excess = output.len() - MAX_ENGINE_OUTPUT_BYTES;
                        output.drain(0..excess);
                    }
                }
            }
        }
        output
    })
}

fn join_child_output(handle: Option<std::thread::JoinHandle<Vec<u8>>>) -> Vec<u8> {
    handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
}

fn terminate_child_process(child: &mut std::process::Child) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn require_non_empty(path: &Path) -> Result<(), String> {
    fs::metadata(path)
        .map_err(|error| error.to_string())
        .and_then(|metadata| {
            if metadata.len() > 0 {
                Ok(())
            } else {
                Err("Fichier de test vide.".to_string())
            }
        })
}

fn detect_tool_version(path: &Path) -> Option<String> {
    for version_arg in ["-version", "--version", "version"] {
        let mut command = Command::new(path);
        hide_command_window(&mut command);
        let output = command.arg(version_arg).output().ok()?;
        if !output.status.success() {
            continue;
        }
        let text = if output.stdout.is_empty() {
            String::from_utf8_lossy(&output.stderr)
        } else {
            String::from_utf8_lossy(&output.stdout)
        };
        let first_line = text.lines().next()?.trim();
        if first_line.is_empty() {
            continue;
        }
        if first_line.to_ascii_lowercase().contains("ffmpeg")
            || first_line.to_ascii_lowercase().contains("ffprobe")
        {
            return first_line.split_whitespace().nth(2).map(str::to_string);
        }
        return first_line.split_whitespace().last().map(str::to_string);
    }
    None
}

#[cfg(target_os = "windows")]
fn hide_command_window(command: &mut Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_command_window(_command: &mut Command) {}

fn expected_version_matches(expected: &str, detected: Option<&str>) -> bool {
    expected == COMPATIBLE_VERSION || detected.is_some_and(|version| version.starts_with(expected))
}

pub(crate) fn tool_env_root() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|path| path.join("Multi-Converter").join("tool-env"))
        .ok_or_else(|| "Dossier local de l'application introuvable.".to_string())
}

pub(crate) fn internet_available() -> bool {
    engine_distribution::https_url_available("https://github.com/")
        || engine_distribution::https_url_available("https://www.microsoft.com/")
}

fn bundled_engine_binary(app: Option<&AppHandle>, id: &str) -> Option<PathBuf> {
    let manifest = engine_distribution::load_manifest().ok()?;
    let engine = engine_distribution::manifest_for_platform(&manifest, id)?;
    let root = bundled_engines_root(app)?;
    engine_distribution::installed_binary(&root, id, &engine.version, &engine.binary_paths)
}

fn bundled_engines_root(app: Option<&AppHandle>) -> Option<PathBuf> {
    if let Some(app) = app
        && let Ok(resource_dir) = app.path().resource_dir()
    {
        let candidate = resource_dir.join("engines");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bundled-engines");
    candidate.exists().then_some(candidate)
}

fn bundled_binary(app: Option<&AppHandle>, stem: &str) -> Option<PathBuf> {
    let binary_name = binary_name(stem);
    let universal_binary_name = universal_binary_name(stem);
    let sidecar_name = if cfg!(target_os = "windows") {
        format!("{stem}.exe")
    } else {
        stem.to_string()
    };
    if let Ok(current_exe) = env::current_exe()
        && let Some(exe_dir) = current_exe.parent()
    {
        for candidate in [
            exe_dir.join(&sidecar_name),
            exe_dir.join(&universal_binary_name),
            exe_dir.join(&binary_name),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    if let Some(app) = app
        && let Ok(resource_dir) = app.path().resource_dir()
    {
        for candidate in [
            resource_dir.join(&sidecar_name),
            resource_dir.join(&universal_binary_name),
            resource_dir.join(&binary_name),
            resource_dir.join("binaries").join(&universal_binary_name),
            resource_dir.join("binaries").join(&binary_name),
        ] {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    let manifest_binaries_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    [
        manifest_binaries_dir.join(&universal_binary_name),
        manifest_binaries_dir.join(binary_name),
    ]
    .into_iter()
    .find(|candidate| candidate.exists())
}

fn binary_name(stem: &str) -> String {
    binary_name_for(stem, env::consts::OS, env::consts::ARCH)
}

fn binary_name_for(stem: &str, os: &str, arch: &str) -> String {
    if os == "windows" {
        format!("{stem}-x86_64-pc-windows-msvc.exe")
    } else if os == "macos" {
        if matches!(arch, "aarch64" | "arm64") {
            format!("{stem}-aarch64-apple-darwin")
        } else {
            format!("{stem}-x86_64-apple-darwin")
        }
    } else if matches!(arch, "aarch64" | "arm64") {
        format!("{stem}-aarch64-unknown-linux-gnu")
    } else {
        format!("{stem}-x86_64-unknown-linux-gnu")
    }
}

fn universal_binary_name(stem: &str) -> String {
    universal_binary_name_for(stem, env::consts::OS, env::consts::ARCH)
}

fn universal_binary_name_for(stem: &str, os: &str, arch: &str) -> String {
    if os == "macos" {
        format!("{stem}-universal-apple-darwin")
    } else {
        binary_name_for(stem, os, arch)
    }
}

fn required_tool(id: &str) -> bool {
    matches!(
        id,
        "ffmpeg"
            | "ffprobe"
            | "rust-image"
            | "resvg"
            | "rust-text"
            | "pdf-extract"
            | "pdfium"
            | "libreoffice"
            | "pandoc"
            | "libvips"
    )
}

fn state_from_status(status: &str) -> EngineState {
    match status {
        "ready" => EngineState::Ready,
        "bad_version" => EngineState::BadVersion,
        "test_failed" => EngineState::TestFailed,
        "disabled" => EngineState::Disabled,
        "repairing" => EngineState::Repairing,
        _ => EngineState::Missing,
    }
}

fn status_label(status: &str) -> &'static str {
    match status {
        "ready" => "prêt",
        "bad_version" => "mauvaise version",
        "test_failed" => "test échoué",
        "disabled" => "désactivé",
        "repairing" => "réparation en cours",
        _ => "absent",
    }
}

fn is_rich_document_target(target_id: &str) -> bool {
    matches!(target_id, "docx" | "odt" | "rtf")
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::get_format_by_id;

    #[test]
    fn base_catalog_keeps_lightweight_engines_only() {
        let ids = TOOLS
            .iter()
            .filter(|tool| tool.mode == EngineMode::Base)
            .map(|tool| tool.id)
            .collect::<Vec<_>>();
        assert_eq!(
            ids,
            vec![
                "ffmpeg",
                "ffprobe",
                "rust-image",
                "resvg",
                "rust-text",
                "pdf-extract"
            ]
        );
        for id in [
            "imagemagick",
            "mupdf",
            "poppler",
            "pdfium",
            "libarchive",
            "blender",
            "freecad",
            "assimp",
            "fontforge",
        ] {
            assert!(!ids.contains(&id));
        }
    }

    #[test]
    fn pdf_to_text_prefers_pdfium_then_pdf_extract_fallback() {
        let pdf = get_format_by_id("pdf").unwrap();
        let txt = get_format_by_id("txt").unwrap();
        let plan = select_engine(None, &pdf, txt.id, txt.category_id, "text");
        assert_eq!(plan.plan, vec!["pdf-extract", "Moteur texte intégré"]);
        assert_eq!(plan.id, "pdf-extract");
        assert!(plan.available);
    }

    #[test]
    fn ffmpeg_gyan_version_suffix_matches_expected_version() {
        assert!(expected_version_matches(
            "8.1.1",
            Some("8.1.1-essentials_build-www.gyan.dev")
        ));
    }

    #[test]
    fn markdown_to_pdf_uses_integrated_text_pipeline() {
        let md = get_format_by_id("md").unwrap();
        let pdf = get_format_by_id("pdf").unwrap();
        let plan = select_engine(None, &md, pdf.id, pdf.category_id, "text");

        assert_eq!(plan.id, "rust-text");
        assert!(plan.available);
        assert!(!plan.plan.contains(&"Pandoc".to_string()));
        assert!(!plan.plan.contains(&"LibreOffice".to_string()));
    }

    #[test]
    fn pdf_to_rich_document_uses_integrated_text_pipeline() {
        let pdf = get_format_by_id("pdf").unwrap();
        let docx = get_format_by_id("docx").unwrap();
        let plan = select_engine(None, &pdf, docx.id, docx.category_id, "text");

        assert_eq!(plan.id, "pdf-extract");
        assert_eq!(plan.required_engine_ids, vec!["pdf-extract"]);
        assert!(plan.available);
    }

    #[test]
    fn legacy_doc_source_uses_bundled_libreoffice() {
        let doc = get_format_by_id("doc").unwrap();
        let docx = get_format_by_id("docx").unwrap();
        let plan = select_engine(None, &doc, docx.id, docx.category_id, "external");

        assert_eq!(plan.id, "libreoffice");
        assert_eq!(plan.required_engine_ids, vec!["libreoffice"]);
        assert_eq!(plan.plan, vec!["LibreOffice headless"]);
    }

    #[test]
    fn advanced_catalog_is_reported_as_bundled_engines() {
        let ids = TOOLS
            .iter()
            .filter(|tool| tool.mode == EngineMode::Advanced)
            .map(|tool| tool.id)
            .collect::<Vec<_>>();
        assert_eq!(ids, vec!["pdfium", "libreoffice", "pandoc", "libvips"]);
    }

    #[test]
    fn raster_to_svg_stays_disabled() {
        let png = get_format_by_id("png").unwrap();
        let svg = get_format_by_id("svg").unwrap();
        let plan = select_engine(None, &png, svg.id, svg.category_id, "image");
        assert_eq!(plan.id, "non-integrated");
        assert!(!plan.available);
        assert!(plan.reason.contains("vrai SVG vectoriel"));
    }

    #[test]
    fn advanced_image_engine_keeps_ico_on_rust_image() {
        let png = get_format_by_id("png").unwrap();
        let ico = get_format_by_id("ico").unwrap();
        let candidates = engine_candidates(&png, ico.id, ico.category_id, "image");

        assert_eq!(candidates, vec!["rust-image"]);
    }

    #[test]
    fn ffmpeg_media_conversions_have_no_non_ffmpeg_fallback() {
        let mp3 = get_format_by_id("mp3").unwrap();
        let wav = get_format_by_id("wav").unwrap();
        let plan = select_engine(None, &mp3, wav.id, wav.category_id, "ffmpeg");

        assert_eq!(plan.id, "ffmpeg");
        assert_eq!(plan.required_engine_ids, vec!["ffmpeg", "ffprobe"]);
        assert_eq!(plan.plan, vec!["FFmpeg", "ffprobe"]);
    }

    #[test]
    fn sidecar_names_are_stable_for_release_platforms() {
        assert_eq!(
            binary_name_for("ffmpeg", "windows", "x86_64"),
            "ffmpeg-x86_64-pc-windows-msvc.exe"
        );
        assert_eq!(
            binary_name_for("ffmpeg", "macos", "aarch64"),
            "ffmpeg-aarch64-apple-darwin"
        );
        assert_eq!(
            binary_name_for("ffmpeg", "macos", "x86_64"),
            "ffmpeg-x86_64-apple-darwin"
        );
        assert_eq!(
            universal_binary_name_for("ffmpeg", "macos", "aarch64"),
            "ffmpeg-universal-apple-darwin"
        );
        assert_eq!(
            universal_binary_name_for("ffmpeg", "macos", "x86_64"),
            "ffmpeg-universal-apple-darwin"
        );
        assert_eq!(
            universal_binary_name_for("ffprobe", "linux", "x86_64"),
            "ffprobe-x86_64-unknown-linux-gnu"
        );
    }
}
