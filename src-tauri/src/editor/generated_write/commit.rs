use super::super::document::{
    EditorCompatibilityWarning, EditorSource, EditorWriteResult, modified_stamp,
};
use super::super::export::associated_title;
use super::super::storage::{commit_staged_file_checked, save_draft_inner};
use super::*;
use std::sync::atomic::AtomicU8;

pub(super) async fn commit_generated_write(
    state: State<'_, GeneratedWriteState>,
    session_id: String,
) -> CommandResult<EditorWriteResult> {
    let (session, phase) = begin_commit(state.inner(), &session_id)?;
    let validation_phase = phase.clone();
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        let mut session = session;
        let result = prepare_session(&mut session, &validation_phase);
        (session, result)
    })
    .await;
    let (mut session, result) = match prepared {
        Ok(value) => value,
        Err(error) => {
            remove_registration(state.inner(), &session_id);
            return Err(format!("EDITOR_GENERATED_VALIDATION_FAILED:{error}"));
        }
    };
    if let Err(error) = result {
        remove_registration(state.inner(), &session_id);
        return Err(error);
    }

    let preflight = (|| {
        ensure_active(&phase)?;
        let document = session.document.as_ref().ok_or_else(|| {
            "EDITOR_GENERATED_SESSION_CLOSED:Document de session manquant.".to_string()
        })?;
        ensure_source_unchanged(document, &session.destination)?;
        validate_overwrite_permissions(document, &session.destination)?;
        publish_staged(&session, &phase).map_err(|error| format!("EDITOR_REPLACE_FAILED:{error}"))
    })();
    remove_registration(state.inner(), &session_id);
    preflight?;
    let _ = fs::remove_file(&session.marker);

    finalize_published_session(&mut session)
}

fn begin_commit(
    state: &GeneratedWriteState,
    session_id: &str,
) -> CommandResult<(GeneratedWriteSession, Arc<AtomicU8>)> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "EDITOR_GENERATED_STATE_FAILED:État d’écriture indisponible.".to_string())?;
    let entry = sessions.get_mut(session_id).ok_or_else(|| {
        "EDITOR_GENERATED_SESSION_MISSING:Session d’écriture introuvable.".to_string()
    })?;
    ensure_active(&entry.phase)?;
    if entry.committing {
        return Err(
            "EDITOR_GENERATED_SESSION_CLOSED:La validation DOCX est déjà en cours.".to_string(),
        );
    }
    entry.committing = true;
    let session = entry.session.take().ok_or_else(|| {
        "EDITOR_GENERATED_SESSION_CLOSED:Session d’écriture déjà fermée.".to_string()
    })?;
    Ok((session, entry.phase.clone()))
}

fn prepare_session(session: &mut GeneratedWriteSession, phase: &AtomicU8) -> CommandResult<()> {
    ensure_active(phase)?;
    if session.written == 0 || session.prefix.get(..2) != Some(&[0x50, 0x4b]) {
        return Err("EDITOR_DOCX_INVALID:Le flux généré n’est pas un DOCX complet.".to_string());
    }
    if let Some(mut file) = session.file.take() {
        file.flush()
            .map_err(|error| format!("EDITOR_GENERATED_FLUSH_FAILED:{error}"))?;
        ensure_active(phase)?;
        file.sync_all()
            .map_err(|error| format!("EDITOR_GENERATED_SYNC_FAILED:{error}"))?;
    }
    ensure_active(phase)?;
    archive::validate_docx_archive(&session.staged, || ensure_active(phase))?;
    ensure_active(phase)
}

fn publish_staged(session: &GeneratedWriteSession, phase: &AtomicU8) -> CommandResult<()> {
    publish_staged_with_hook(session, phase, || {})
}

fn publish_staged_with_hook<F>(
    session: &GeneratedWriteSession,
    phase: &AtomicU8,
    before_linearize: F,
) -> CommandResult<()>
where
    F: FnOnce(),
{
    commit_staged_file_checked(
        &session.staged,
        &session.destination,
        session.expected_destination.as_ref(),
        |_| {
            before_linearize();
            phase
                .compare_exchange(
                    WRITE_ACTIVE,
                    WRITE_PUBLISHING,
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                )
                .map(|_| ())
                .map_err(|_| generated_write_canceled())
        },
    )
}

fn ensure_active(phase: &AtomicU8) -> CommandResult<()> {
    if phase.load(Ordering::SeqCst) == WRITE_ACTIVE {
        Ok(())
    } else {
        Err(generated_write_canceled())
    }
}

fn remove_registration(state: &GeneratedWriteState, session_id: &str) {
    if let Ok(mut sessions) = state.sessions.lock() {
        sessions.remove(session_id);
    }
}

fn finalize_published_session(
    session: &mut GeneratedWriteSession,
) -> CommandResult<EditorWriteResult> {
    let mut document = session.document.take().ok_or_else(|| {
        "EDITOR_GENERATED_SESSION_CLOSED:Document de session manquant.".to_string()
    })?;
    if session.associate_source {
        match fs::metadata(&session.destination) {
            Ok(metadata) => {
                document.title = associated_title(&document, &session.destination);
                document.source = Some(EditorSource {
                    path: session.destination.to_string_lossy().to_string(),
                    format: "docx".to_string(),
                    size: metadata.len(),
                    modified_at: modified_stamp(&metadata),
                });
            }
            Err(error) => append_post_publish_warning(
                &mut document,
                "generatedDocxMetadata",
                format!(
                    "Le DOCX a été écrit, mais ses métadonnées locales n’ont pas pu être actualisées ({error})."
                ),
            ),
        }
    }
    let document = match save_draft_inner(document.clone()) {
        Ok(saved) => saved,
        Err(error) => {
            append_post_publish_warning(
                &mut document,
                "generatedDocxDraft",
                format!(
                    "Le DOCX a été écrit, mais le brouillon local n’a pas pu être actualisé ({error})."
                ),
            );
            document
        }
    };
    Ok(EditorWriteResult {
        path: session.destination.to_string_lossy().to_string(),
        document,
    })
}

fn append_post_publish_warning(document: &mut EditorDocument, code: &str, message: String) {
    if document.warnings.iter().any(|warning| warning.code == code) {
        return;
    }
    document.warnings.push(EditorCompatibilityWarning {
        code: code.to_string(),
        message,
        blocks_overwrite: false,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_at_publication_boundary_restores_destination_and_cleans_staging() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("result.docx");
        let staged = directory.path().join("generated.docx");
        let marker = directory.path().join("marker.json");
        fs::write(&destination, b"original").unwrap();
        fs::write(&staged, b"generated").unwrap();
        fs::write(&marker, b"marker").unwrap();
        let expected_destination = capture_destination_snapshot(&destination).unwrap();
        let phase = AtomicU8::new(WRITE_ACTIVE);
        let session = GeneratedWriteSession {
            id: "test".to_string(),
            destination: destination.clone(),
            staged: staged.clone(),
            marker: marker.clone(),
            file: None,
            document: Some(super::super::super::document::new_document("test")),
            expected_destination,
            associate_source: false,
            written: 9,
            prefix: b"PK".to_vec(),
        };

        let error = publish_staged_with_hook(&session, &phase, || {
            phase.store(WRITE_CANCELED, Ordering::SeqCst);
        })
        .unwrap_err();
        assert!(error.contains("EDITOR_GENERATED_CANCELLED"));
        assert_eq!(fs::read(&destination).unwrap(), b"original");

        drop(session);
        assert!(!staged.exists());
        assert!(!marker.exists());
    }
}
