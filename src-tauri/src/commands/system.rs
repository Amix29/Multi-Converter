use super::CommandResult;
use std::{path::PathBuf, process::Command};

#[tauri::command]
pub(crate) fn reveal_file(file_path: String) -> CommandResult<bool> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Err("Chemin introuvable.".to_string());
    }
    let path = path.canonicalize().unwrap_or(path);
    #[cfg(target_os = "windows")]
    {
        if path.is_dir() {
            Command::new("explorer.exe")
                .arg(&path)
                .spawn()
                .map_err(|error| error.to_string())?;
        } else {
            Command::new("explorer.exe")
                .arg("/select,")
                .arg(&path)
                .spawn()
                .map_err(|error| error.to_string())?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        if path.is_dir() {
            Command::new("open")
                .arg(path)
                .spawn()
                .map_err(|error| error.to_string())?;
        } else {
            Command::new("open")
                .arg("-R")
                .arg(path)
                .spawn()
                .map_err(|error| error.to_string())?;
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let target = if path.is_dir() {
            path
        } else {
            path.parent()
                .ok_or_else(|| "Dossier parent introuvable.".to_string())?
                .to_path_buf()
        };
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub(crate) fn open_external_url(url: String) -> CommandResult<bool> {
    let trimmed = url.trim();
    if !is_allowed_external_url(trimmed) {
        return Err("Lien externe non autorisé.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    Ok(true)
}

fn is_allowed_external_url(url: &str) -> bool {
    url == "https://github.com/Amix29/Multi-Converter/"
        || url == "https://github.com/Amix29/Multi-Converter"
        || url.starts_with("https://github.com/Amix29/Multi-Converter/issues/new?")
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_url_allowlist_rejects_google_translate_pages() {
        assert!(is_allowed_external_url(
            "https://github.com/Amix29/Multi-Converter/issues/new?title=Bug"
        ));
        assert!(!is_allowed_external_url(
            "https://translate.googleapis.com/translate_a/single"
        ));
        assert!(!is_allowed_external_url("https://translate.google.com/"));
        assert!(!is_allowed_external_url("https://www.google.com/"));
    }
}
