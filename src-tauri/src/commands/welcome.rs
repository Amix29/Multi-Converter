use super::CommandResult;
use std::{env, fs, io::Write, path::PathBuf};

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WelcomeState {
    show: bool,
}

#[tauri::command]
pub(crate) fn welcome_state() -> CommandResult<WelcomeState> {
    Ok(WelcomeState {
        show: should_show_welcome_for_install(),
    })
}

#[tauri::command]
pub(crate) fn mark_welcome_seen() -> CommandResult<bool> {
    let marker = welcome_marker_path()?;
    if let Some(parent) = marker.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let install_stamp = current_install_stamp();
    let mut file = fs::File::create(marker).map_err(|error| error.to_string())?;
    writeln!(file, "{install_stamp}").map_err(|error| error.to_string())?;
    Ok(true)
}
fn should_show_welcome_for_install() -> bool {
    #[cfg(debug_assertions)]
    {
        true
    }
    #[cfg(not(debug_assertions))]
    {
        let install_stamp = current_install_stamp();
        let Ok(marker) = welcome_marker_path() else {
            return true;
        };
        let seen_stamp = fs::read_to_string(marker)
            .ok()
            .and_then(|value| value.trim().parse::<u64>().ok())
            .unwrap_or(0);
        seen_stamp < install_stamp
    }
}

fn welcome_marker_path() -> CommandResult<PathBuf> {
    dirs::data_local_dir()
        .map(|path| path.join("Multi-Converter").join("welcome-install.marker"))
        .ok_or_else(|| "Dossier local de l'application introuvable.".to_string())
}

fn current_install_stamp() -> u64 {
    env::current_exe()
        .ok()
        .and_then(|path| fs::metadata(path).ok())
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| {
            modified
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .ok()
        })
        .map(|duration| duration.as_secs())
        .unwrap_or(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn welcome_state_keeps_camel_case_ipc_shape() {
        assert_eq!(
            serde_json::to_value(WelcomeState { show: true }).unwrap(),
            serde_json::json!({ "show": true })
        );
    }
}
