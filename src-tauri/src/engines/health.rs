use super::catalog::{APP_VERSION, COMPATIBLE_VERSION, TOOLS};
use super::contracts::{DependencyBootstrap, DependencyCheck, EngineState, ToolDef, ToolStatus};
use super::process::{
    detect_tool_version, expected_version_matches, smoke_test_external_path, smoke_test_integrated,
};
use super::resolution::{bundled_engines_root, resolve_tool};
use crate::engine_archive;
use crate::engine_distribution;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

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

pub fn bootstrap_dependencies(app: &AppHandle) -> Result<DependencyBootstrap, String> {
    let env_dir = super::tool_env_root()?;
    fs::create_dir_all(&env_dir).map_err(|error| error.to_string())?;
    let _ = engine_distribution::cleanup_stale_installing_dirs();
    let internet = super::internet_available();
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

pub fn is_available(app: Option<&AppHandle>, id: &str) -> bool {
    let Some(tool) = TOOLS.iter().find(|tool| tool.id == id) else {
        return false;
    };
    evaluate_tool(app, tool, false).available
}

pub(super) fn evaluate_tool(
    app: Option<&AppHandle>,
    tool: &ToolDef,
    run_smoke: bool,
) -> DependencyCheck {
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
    if !run_smoke
        && let Some(app) = app
        && let Ok(manifest) = engine_distribution::load_manifest()
        && let Some(engine) = engine_distribution::manifest_for_platform(&manifest, tool.id)
        && engine_archive::available(app, &engine)
        && !engine_archive::is_extracted(&engine)
    {
        return check(
            Some(app),
            tool,
            Some(engine.version),
            None,
            "ready",
            "Moteur compressé embarqué, extrait localement au premier usage.",
            None,
        );
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
