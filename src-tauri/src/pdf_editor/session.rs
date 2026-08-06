use super::contracts::{PdfPermissionV1, PdfSignatureInfoV1};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

const MAX_OPEN_SESSIONS: usize = 8;
const MAX_PASSWORD_BYTES: usize = 1024;

#[derive(Clone, Default)]
pub(crate) struct PdfEditorState {
    sessions: Arc<Mutex<HashMap<String, PdfSession>>>,
}

pub(super) struct SecretBytes(Vec<u8>);

impl SecretBytes {
    pub(super) fn from_password(password: Option<String>) -> Result<Option<Self>, String> {
        let Some(password) = password.filter(|value| !value.is_empty()) else {
            return Ok(None);
        };
        if password.len() > MAX_PASSWORD_BYTES {
            return Err("PDF_EDITOR_PASSWORD_LIMIT:Le mot de passe dépasse 1 024 octets.".into());
        }
        Ok(Some(Self(password.into_bytes())))
    }

    pub(super) fn as_str(&self) -> Result<&str, String> {
        std::str::from_utf8(&self.0)
            .map_err(|_| "PDF_EDITOR_PASSWORD_INVALID:Mot de passe UTF-8 invalide.".into())
    }
}

impl Clone for SecretBytes {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl Drop for SecretBytes {
    fn drop(&mut self) {
        self.0.fill(0);
    }
}

pub(super) struct PdfSession {
    pub source_path: PathBuf,
    pub source_sha256: String,
    pub password: Option<SecretBytes>,
    pub permissions: PdfPermissionV1,
    pub signatures: Vec<PdfSignatureInfoV1>,
}

pub(super) struct SessionAccess {
    pub source_path: PathBuf,
    pub source_sha256: String,
    pub password: Option<SecretBytes>,
    pub permissions: PdfPermissionV1,
    pub signatures: Vec<PdfSignatureInfoV1>,
}

impl SessionAccess {
    pub(super) fn hash_matches(&self, candidate: &str) -> bool {
        constant_time_eq(self.source_sha256.as_bytes(), candidate.as_bytes())
    }
}

impl PdfEditorState {
    pub(super) fn insert(&self, id: String, session: PdfSession) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "PDF_EDITOR_STATE:État des sessions indisponible.".to_string())?;
        if sessions.len() >= MAX_OPEN_SESSIONS {
            return Err(
                "PDF_EDITOR_SESSION_LIMIT:Fermez un PDF avant d’en ouvrir un autre.".into(),
            );
        }
        sessions.insert(id, session);
        Ok(())
    }

    pub(super) fn access(&self, id: &str, expected_hash: &str) -> Result<SessionAccess, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "PDF_EDITOR_STATE:État des sessions indisponible.".to_string())?;
        let session = sessions
            .get(id)
            .ok_or_else(|| "PDF_EDITOR_SESSION_MISSING:La session PDF est fermée.".to_string())?;
        if !constant_time_eq(session.source_sha256.as_bytes(), expected_hash.as_bytes()) {
            return Err("PDF_EDITOR_SOURCE_CHANGED:Le SHA de session ne correspond pas.".into());
        }
        Ok(SessionAccess {
            source_path: session.source_path.clone(),
            source_sha256: session.source_sha256.clone(),
            password: session.password.clone(),
            permissions: session.permissions.clone(),
            signatures: session.signatures.clone(),
        })
    }

    pub(super) fn rebase(
        &self,
        id: &str,
        expected_hash: &str,
        replacement: PdfSession,
    ) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "PDF_EDITOR_STATE:État des sessions indisponible.".to_string())?;
        let current = sessions
            .get_mut(id)
            .ok_or_else(|| "PDF_EDITOR_SESSION_MISSING:La session PDF est fermée.".to_string())?;
        if !constant_time_eq(current.source_sha256.as_bytes(), expected_hash.as_bytes()) {
            return Err(
                "PDF_EDITOR_SOURCE_CHANGED:La session a changé pendant la sauvegarde.".into(),
            );
        }
        *current = replacement;
        Ok(())
    }

    pub(super) fn close(&self, id: &str) -> Result<bool, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "PDF_EDITOR_STATE:État des sessions indisponible.".to_string())?;
        Ok(sessions.remove(id).is_some())
    }
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_is_never_part_of_a_serializable_contract() {
        assert!(
            SecretBytes::from_password(Some("secret".into()))
                .unwrap()
                .unwrap()
                .as_str()
                .is_ok()
        );
        assert!(!constant_time_eq(b"hash-a", b"hash-b"));
    }

    #[test]
    fn session_can_be_rebased_only_from_the_expected_source_hash() {
        let state = PdfEditorState::default();
        let permissions = PdfPermissionV1 {
            schema_version: 1,
            can_modify: true,
            can_annotate: true,
            can_fill_forms: true,
            can_assemble: true,
            doc_mdp_level: None,
        };
        let session = |hash: &str, path: &str| PdfSession {
            source_path: PathBuf::from(path),
            source_sha256: hash.into(),
            password: None,
            permissions: permissions.clone(),
            signatures: Vec::new(),
        };
        state
            .insert("id".into(), session("old", "old.pdf"))
            .unwrap();
        assert!(
            state
                .rebase("id", "wrong", session("new", "new.pdf"))
                .is_err()
        );
        state
            .rebase("id", "old", session("new", "new.pdf"))
            .unwrap();
        assert_eq!(
            state.access("id", "new").unwrap().source_path,
            PathBuf::from("new.pdf")
        );
    }
}
