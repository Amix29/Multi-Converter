use super::CommandResult;
use crate::{
    engines::{self, DependencyBootstrap, ToolStatus},
    runtime_log,
};
use std::path::Path;
use tauri::AppHandle;

#[tauri::command]
pub(crate) fn engine_statuses(app: AppHandle) -> Vec<ToolStatus> {
    engines::tool_statuses(Some(&app))
}

#[tauri::command]
pub(crate) fn bootstrap_dependencies(app: AppHandle) -> CommandResult<DependencyBootstrap> {
    let result = engines::bootstrap_dependencies(&app);
    match &result {
        Ok(info) => {
            runtime_log::write(
                "engines",
                &format!(
                    "bootstrap ok={} mode={} env={}",
                    info.ok,
                    info.mode,
                    runtime_log::path(Path::new(&info.env_dir))
                ),
            );
            for check in &info.checks {
                let path = check
                    .path
                    .as_deref()
                    .map(|value| runtime_log::path(Path::new(value)))
                    .unwrap_or_default();
                runtime_log::write(
                    "engines",
                    &format!(
                        "{} status={} available={} path={}",
                        check.id, check.status, check.available, path
                    ),
                );
            }
        }
        Err(error) => runtime_log::write("engines", &format!("bootstrap failed: {error}")),
    }
    result
}
