use super::document::{
    CommandResult, EditorDocument, EditorWriteRequest, EditorWriteResult, MAX_DRAFT_BYTES,
    normalize_output_format, safe_file_stem, validate_document,
};
use super::export::available_destination;
use super::storage::{
    DestinationSnapshot, capture_destination_snapshot, editor_root, ensure_source_unchanged,
};
mod archive;
mod commit;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicU8, Ordering},
};
use tauri::State;

const DOCX_LIMIT: u64 = 128 * 1024 * 1024;
const DOCX_CHUNK_SIZE: usize = 1024 * 1024;
const MAX_ACTIVE_WRITES: usize = 8;
const WRITE_ACTIVE: u8 = 0;
const WRITE_CANCELED: u8 = 1;
const WRITE_PUBLISHING: u8 = 2;

#[derive(Default)]
pub struct GeneratedWriteState {
    sessions: Mutex<HashMap<String, GeneratedWriteEntry>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedWriteStartRequest {
    request: EditorWriteRequest,
    mode: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedWriteSessionInfo {
    session_id: String,
    chunk_size: usize,
}

struct GeneratedWriteSession {
    id: String,
    destination: PathBuf,
    staged: PathBuf,
    marker: PathBuf,
    file: Option<File>,
    document: Option<EditorDocument>,
    expected_destination: Option<DestinationSnapshot>,
    associate_source: bool,
    written: u64,
    prefix: Vec<u8>,
}

struct GeneratedWriteEntry {
    phase: Arc<AtomicU8>,
    committing: bool,
    session: Option<GeneratedWriteSession>,
}

impl Drop for GeneratedWriteSession {
    fn drop(&mut self) {
        self.file.take();
        let _ = fs::remove_file(&self.staged);
        let _ = fs::remove_file(&self.marker);
    }
}

#[tauri::command]
pub async fn editor_begin_generated_write(
    state: State<'_, GeneratedWriteState>,
    payload: GeneratedWriteStartRequest,
) -> CommandResult<Option<GeneratedWriteSessionInfo>> {
    let target = normalize_output_format(&payload.request.target_format)?;
    if target != "docx" {
        return Err(
            "EDITOR_GENERATED_FORMAT_UNSUPPORTED:Seul DOCX utilise l’écriture générée.".to_string(),
        );
    }
    validate_document(&payload.request.document, true)?;
    let encoded =
        serde_json::to_vec(&payload.request.document).map_err(|error| error.to_string())?;
    if encoded.len() > MAX_DRAFT_BYTES {
        return Err(
            "EDITOR_DRAFT_LIMIT:Le document est trop volumineux pour être exporté.".to_string(),
        );
    }
    let (destination, associate_source) = choose_destination(&payload).await?;
    let Some(destination) = destination else {
        return Ok(None);
    };
    validate_destination(&destination)?;
    let expected_destination = capture_destination_snapshot(&destination)?;
    ensure_source_unchanged(&payload.request.document, &destination)?;
    validate_overwrite_permissions(&payload.request.document, &destination)?;

    let id = uuid::Uuid::new_v4().to_string();
    let parent = destination
        .parent()
        .ok_or_else(|| "EDITOR_DESTINATION_INVALID:Dossier de destination invalide.".to_string())?;
    let staged = parent.join(format!("multi-converter-generated-{id}.docx"));
    let file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .read(true)
        .open(&staged)
        .map_err(|error| format!("EDITOR_GENERATED_BEGIN_FAILED:{error}"))?;
    let marker_root = generated_marker_root()?;
    fs::create_dir_all(&marker_root)
        .map_err(|error| format!("EDITOR_GENERATED_MARKER_FAILED:{error}"))?;
    let marker = marker_root.join(format!("{id}.json"));
    fs::write(
        &marker,
        serde_json::to_vec(&staged.to_string_lossy()).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("EDITOR_GENERATED_MARKER_FAILED:{error}"))?;
    let session = GeneratedWriteSession {
        id: id.clone(),
        destination,
        staged,
        marker,
        file: Some(file),
        document: Some(payload.request.document),
        expected_destination,
        associate_source,
        written: 0,
        prefix: Vec::with_capacity(4),
    };
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "EDITOR_GENERATED_STATE_FAILED:État d’écriture indisponible.".to_string())?;
    if sessions.len() >= MAX_ACTIVE_WRITES {
        return Err(
            "EDITOR_GENERATED_BUSY:Trop d’écritures de documents sont déjà ouvertes.".to_string(),
        );
    }
    sessions.insert(
        id.clone(),
        GeneratedWriteEntry {
            phase: Arc::new(AtomicU8::new(WRITE_ACTIVE)),
            committing: false,
            session: Some(session),
        },
    );
    Ok(Some(GeneratedWriteSessionInfo {
        session_id: id,
        chunk_size: DOCX_CHUNK_SIZE,
    }))
}

#[tauri::command]
pub fn editor_append_generated_write(
    state: State<'_, GeneratedWriteState>,
    session_id: String,
    offset: u64,
    bytes: Vec<u8>,
) -> CommandResult<u64> {
    if bytes.is_empty() || bytes.len() > DOCX_CHUNK_SIZE {
        return Err(
            "EDITOR_GENERATED_CHUNK_INVALID:Bloc DOCX vide ou trop volumineux.".to_string(),
        );
    }
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "EDITOR_GENERATED_STATE_FAILED:État d’écriture indisponible.".to_string())?;
    let entry = sessions.get_mut(&session_id).ok_or_else(|| {
        "EDITOR_GENERATED_SESSION_MISSING:Session d’écriture introuvable.".to_string()
    })?;
    if entry.phase.load(Ordering::SeqCst) != WRITE_ACTIVE {
        return Err(generated_write_canceled());
    }
    let session = entry.session.as_mut().ok_or_else(|| {
        "EDITOR_GENERATED_SESSION_CLOSED:Session d’écriture déjà fermée.".to_string()
    })?;
    if session.id != session_id || offset != session.written {
        return Err("EDITOR_GENERATED_OFFSET_INVALID:Ordre des blocs DOCX invalide.".to_string());
    }
    if session.written.saturating_add(bytes.len() as u64) > DOCX_LIMIT {
        return Err(
            "EDITOR_DOCX_SIZE_LIMIT:Le DOCX généré dépasse la limite locale de 128 Mio."
                .to_string(),
        );
    }
    if session.prefix.len() < 4 {
        let take = (4 - session.prefix.len()).min(bytes.len());
        session.prefix.extend_from_slice(&bytes[..take]);
    }
    session
        .file
        .as_mut()
        .ok_or_else(|| {
            "EDITOR_GENERATED_SESSION_CLOSED:Session d’écriture déjà fermée.".to_string()
        })?
        .write_all(&bytes)
        .map_err(|error| format!("EDITOR_GENERATED_WRITE_FAILED:{error}"))?;
    session.written += bytes.len() as u64;
    Ok(session.written)
}

#[tauri::command]
pub async fn editor_commit_generated_write(
    state: State<'_, GeneratedWriteState>,
    session_id: String,
) -> CommandResult<EditorWriteResult> {
    commit::commit_generated_write(state, session_id).await
}

#[tauri::command]
pub fn editor_abort_generated_write(
    state: State<'_, GeneratedWriteState>,
    session_id: String,
) -> CommandResult<bool> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "EDITOR_GENERATED_STATE_FAILED:État d’écriture indisponible.".to_string())?;
    let Some(entry) = sessions.get(&session_id) else {
        return Ok(false);
    };
    let phase = entry.phase.clone();
    let remove_now = !entry.committing;
    let canceled = phase
        .compare_exchange(
            WRITE_ACTIVE,
            WRITE_CANCELED,
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
        .is_ok();
    if canceled && remove_now {
        sessions.remove(&session_id);
    }
    Ok(canceled)
}

pub fn cleanup_stale_generated_writes() -> CommandResult<()> {
    let root = generated_marker_root()?;
    if !root.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(&root)
        .map_err(|error| error.to_string())?
        .take(64)
    {
        let Ok(entry) = entry else { continue };
        let marker = entry.path();
        let Some(id) = marker.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        if uuid::Uuid::parse_str(id).is_err() {
            continue;
        }
        if let Ok(bytes) = fs::read(&marker)
            && bytes.len() <= 32 * 1024
            && let Ok(path) = serde_json::from_slice::<String>(&bytes)
        {
            let staged = PathBuf::from(path);
            let expected = format!("multi-converter-generated-{id}.docx");
            if staged.file_name().and_then(|value| value.to_str()) == Some(&expected)
                && staged
                    .symlink_metadata()
                    .is_ok_and(|metadata| metadata.is_file() && !is_link_or_reparse(&metadata))
            {
                let _ = fs::remove_file(staged);
            }
        }
        let _ = fs::remove_file(marker);
    }
    Ok(())
}

async fn choose_destination(
    payload: &GeneratedWriteStartRequest,
) -> CommandResult<(Option<PathBuf>, bool)> {
    let associate_source = payload.mode != "export";
    if payload.mode == "save" {
        let destination = payload.request.document.source.as_ref()
            .map(|source| PathBuf::from(&source.path))
            .ok_or_else(|| "EDITOR_SAVE_AS_REQUIRED:Ce document n’a pas encore de fichier associé. Utilisez Enregistrer sous.".to_string())?;
        return Ok((Some(destination), true));
    }
    if !matches!(payload.mode.as_str(), "saveAs" | "export") {
        return Err("EDITOR_GENERATED_MODE_INVALID:Mode d’écriture inconnu.".to_string());
    }
    if let Some(path) = payload
        .request
        .destination_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        return Ok((Some(PathBuf::from(path)), associate_source));
    }
    let suggested = format!("{}.docx", safe_file_stem(&payload.request.document.title));
    let folder = tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new()
            .set_title("Enregistrer le document")
            .pick_folder()
    })
    .await
    .map_err(|error| format!("EDITOR_FILE_DIALOG_FAILED:{error}"))?;
    folder
        .map(|folder| available_destination(&folder, &suggested))
        .transpose()
        .map(|value| (value, associate_source))
}

fn validate_destination(destination: &Path) -> CommandResult<()> {
    if destination
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("docx")
    {
        return Err(
            "EDITOR_DESTINATION_INVALID:La destination générée doit utiliser l’extension .docx."
                .to_string(),
        );
    }
    if destination
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err("EDITOR_DESTINATION_INVALID:Chemin de destination ambigu.".to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "EDITOR_DESTINATION_INVALID:Dossier de destination invalide.".to_string())?;
    let metadata = fs::symlink_metadata(parent)
        .map_err(|error| format!("EDITOR_DESTINATION_INVALID:{error}"))?;
    if !metadata.is_dir() || is_link_or_reparse(&metadata) {
        return Err(
            "EDITOR_DESTINATION_INVALID:Le dossier de destination ne peut pas être un lien."
                .to_string(),
        );
    }
    if destination
        .symlink_metadata()
        .is_ok_and(|metadata| !metadata.is_file() || is_link_or_reparse(&metadata))
    {
        return Err("EDITOR_DESTINATION_INVALID:La destination existante est ambiguë.".to_string());
    }
    Ok(())
}

fn validate_overwrite_permissions(
    document: &EditorDocument,
    destination: &Path,
) -> CommandResult<()> {
    if document
        .source
        .as_ref()
        .is_some_and(|source| Path::new(&source.path) == destination)
        && document
            .warnings
            .iter()
            .any(|warning| warning.blocks_overwrite)
    {
        return Err("EDITOR_OVERWRITE_BLOCKED:Ce document contient des éléments qui imposent Enregistrer sous.".to_string());
    }
    Ok(())
}

fn generated_marker_root() -> CommandResult<PathBuf> {
    Ok(editor_root()?.join("generated-writes"))
}

fn generated_write_canceled() -> String {
    "EDITOR_GENERATED_CANCELLED:L’export DOCX a été annulé.".to_string()
}

fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x0400 != 0
    }
    #[cfg(not(windows))]
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_destination_rejects_parent_components_and_wrong_extensions() {
        assert!(validate_destination(Path::new("C:\\Temp\\..\\escape.docx")).is_err());
        assert!(validate_destination(Path::new("C:\\Temp\\document.zip")).is_err());
    }
}
