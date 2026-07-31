use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub(super) type CommandResult<T> = std::result::Result<T, String>;

pub(super) const EDITOR_SCHEMA_VERSION: u8 = 1;
pub(super) const MAX_DRAFT_BYTES: usize = 32 * 1024 * 1024;
pub(super) const MAX_IMPORT_BYTES: u64 = 128 * 1024 * 1024;
pub(super) const MAX_ASSET_BYTES: u64 = 24 * 1024 * 1024;
pub(super) const RECENT_DOCUMENT_LIMIT: usize = 10;
pub(super) const SUPPORTED_INPUTS: &[&str] =
    &["docx", "odt", "rtf", "txt", "md", "markdown", "html", "htm"];
pub(super) const SUPPORTED_OUTPUTS: &[&str] = &["docx", "odt", "rtf", "txt", "md", "html", "pdf"];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSource {
    pub(super) path: String,
    pub(super) format: String,
    pub(super) size: u64,
    pub(super) modified_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorMargins {
    pub(super) top: f32,
    pub(super) right: f32,
    pub(super) bottom: f32,
    pub(super) left: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorPageSettings {
    pub(super) format: String,
    pub(super) orientation: String,
    pub(super) margins_mm: EditorMargins,
    pub(super) numbering: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EditorAssetRef {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) mime_type: String,
    pub(super) size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) height: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorCompatibilityWarning {
    pub(super) code: String,
    pub(super) message: String,
    pub(super) blocks_overwrite: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorDocument {
    pub(super) schema_version: u8,
    pub(super) id: String,
    pub(super) title: String,
    pub(super) source: Option<EditorSource>,
    pub(super) content: Value,
    pub(super) header: Option<Value>,
    pub(super) footer: Option<Value>,
    pub(super) page: EditorPageSettings,
    pub(super) assets: Vec<EditorAssetRef>,
    pub(super) warnings: Vec<EditorCompatibilityWarning>,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorDocumentSummary {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) format: String,
    pub(super) source_path: Option<String>,
    pub(super) updated_at: String,
    pub(super) recoverable: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorTransientContent {
    pub(super) kind: String,
    pub(super) value: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorImportResult {
    pub(super) document: EditorDocument,
    pub(super) transient_content: Option<EditorTransientContent>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorWriteRequest {
    pub(super) document: EditorDocument,
    pub(super) target_format: String,
    pub(super) destination_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorWriteResult {
    pub(super) path: String,
    pub(super) document: EditorDocument,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorAssetData {
    pub(super) bytes: Vec<u8>,
    pub(super) mime_type: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorAssetStoreResult {
    pub(super) asset: EditorAssetRef,
    pub(super) document: EditorDocument,
}

pub(super) fn new_document(title: &str) -> EditorDocument {
    let now = now_stamp();
    EditorDocument {
        schema_version: EDITOR_SCHEMA_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        title: title.to_string(),
        source: None,
        content: empty_tiptap_document(),
        header: None,
        footer: None,
        page: EditorPageSettings {
            format: "a4".to_string(),
            orientation: "portrait".to_string(),
            margins_mm: EditorMargins {
                top: 25.0,
                right: 20.0,
                bottom: 25.0,
                left: 20.0,
            },
            numbering: "bottom-center".to_string(),
        },
        assets: Vec::new(),
        warnings: Vec::new(),
        created_at: now.clone(),
        updated_at: now,
    }
}

pub(super) fn empty_tiptap_document() -> Value {
    json!({ "type": "doc", "content": [{ "type": "paragraph" }] })
}

pub(super) fn plain_text_to_document(text: &str) -> Value {
    let paragraphs = text
        .split("\n\n")
        .map(|paragraph| {
            let mut content = Vec::new();
            for (index, line) in paragraph.lines().enumerate() {
                if index > 0 {
                    content.push(json!({ "type": "hardBreak" }));
                }
                if !line.is_empty() {
                    content.push(json!({ "type": "text", "text": line }));
                }
            }
            if content.is_empty() {
                json!({ "type": "paragraph" })
            } else {
                json!({ "type": "paragraph", "content": content })
            }
        })
        .collect::<Vec<_>>();
    json!({
        "type": "doc",
        "content": if paragraphs.is_empty() { vec![json!({ "type": "paragraph" })] } else { paragraphs }
    })
}

pub(super) fn validate_document(
    document: &EditorDocument,
    strict_assets: bool,
) -> CommandResult<()> {
    if document.schema_version != EDITOR_SCHEMA_VERSION {
        return Err(
            "EDITOR_SCHEMA_UNSUPPORTED:Version de brouillon non prise en charge.".to_string(),
        );
    }
    validate_id(&document.id)?;
    if document.title.trim().is_empty() || document.title.len() > 240 {
        return Err("EDITOR_DOCUMENT_INVALID:Nom de document invalide.".to_string());
    }
    if !matches!(document.page.orientation.as_str(), "portrait" | "landscape") {
        return Err("EDITOR_DOCUMENT_INVALID:Orientation de page invalide.".to_string());
    }
    if !matches!(
        document.page.format.as_str(),
        "a3" | "a4" | "a5" | "letter" | "legal"
    ) {
        return Err("EDITOR_DOCUMENT_INVALID:Format de page invalide.".to_string());
    }
    if !matches!(
        document.page.numbering.as_str(),
        "none" | "bottom-center" | "bottom-right"
    ) {
        return Err("EDITOR_DOCUMENT_INVALID:Numérotation de page invalide.".to_string());
    }
    for margin in [
        document.page.margins_mm.top,
        document.page.margins_mm.right,
        document.page.margins_mm.bottom,
        document.page.margins_mm.left,
    ] {
        if !margin.is_finite() || !(0.0..=100.0).contains(&margin) {
            return Err("EDITOR_DOCUMENT_INVALID:Marge de page invalide.".to_string());
        }
    }

    let known_assets = document
        .assets
        .iter()
        .map(|asset| asset.id.as_str())
        .collect::<HashSet<_>>();
    for asset in &document.assets {
        validate_id(&asset.id)?;
        if asset.size > MAX_ASSET_BYTES {
            return Err("EDITOR_ASSET_LIMIT:Une image dépasse la taille autorisée.".to_string());
        }
        if !is_supported_image_mime(&asset.mime_type) {
            return Err("EDITOR_ASSET_INVALID:Type d’image non pris en charge.".to_string());
        }
    }
    if strict_assets {
        for value in [
            &document.content,
            document.header.as_ref().unwrap_or(&Value::Null),
            document.footer.as_ref().unwrap_or(&Value::Null),
        ] {
            validate_asset_nodes(value, &known_assets)?;
        }
    }
    Ok(())
}

fn validate_asset_nodes(value: &Value, known_assets: &HashSet<&str>) -> CommandResult<()> {
    if let Some(object) = value.as_object() {
        if matches!(
            object.get("type").and_then(Value::as_str),
            Some("image" | "documentImage")
        ) {
            let attrs = object
                .get("attrs")
                .and_then(Value::as_object)
                .ok_or_else(|| "EDITOR_ASSET_INVALID:Attributs d’image manquants.".to_string())?;
            let asset_id = attrs
                .get("assetId")
                .and_then(Value::as_str)
                .ok_or_else(|| "EDITOR_ASSET_INVALID:Identifiant d’image manquant.".to_string())?;
            validate_id(asset_id)?;
            let expected = format!("mc-asset://{asset_id}");
            if attrs.get("src").and_then(Value::as_str) != Some(expected.as_str()) {
                return Err(
                    "EDITOR_ASSET_INVALID:Les images du brouillon doivent utiliser mc-asset://."
                        .to_string(),
                );
            }
            if !known_assets.contains(asset_id) {
                return Err(
                    "EDITOR_ASSET_MISSING:Une image référencée est introuvable.".to_string()
                );
            }
        }
        for child in object.values() {
            validate_asset_nodes(child, known_assets)?;
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            validate_asset_nodes(child, known_assets)?;
        }
    }
    Ok(())
}

pub(super) fn referenced_asset_ids(document: &EditorDocument) -> HashSet<String> {
    let mut ids = HashSet::new();
    for value in [
        &document.content,
        document.header.as_ref().unwrap_or(&Value::Null),
        document.footer.as_ref().unwrap_or(&Value::Null),
    ] {
        collect_asset_ids(value, &mut ids);
    }
    ids
}

fn collect_asset_ids(value: &Value, ids: &mut HashSet<String>) {
    if let Some(object) = value.as_object() {
        if matches!(
            object.get("type").and_then(Value::as_str),
            Some("image" | "documentImage")
        ) && let Some(id) = object
            .get("attrs")
            .and_then(Value::as_object)
            .and_then(|attrs| attrs.get("assetId"))
            .and_then(Value::as_str)
        {
            ids.insert(id.to_string());
        }
        for child in object.values() {
            collect_asset_ids(child, ids);
        }
    } else if let Some(array) = value.as_array() {
        for child in array {
            collect_asset_ids(child, ids);
        }
    }
}

pub(super) fn validate_id(id: &str) -> CommandResult<String> {
    uuid::Uuid::parse_str(id)
        .map(|value| value.to_string())
        .map_err(|_| "EDITOR_ID_INVALID:Identifiant de document invalide.".to_string())
}

pub(super) fn normalize_output_format(format: &str) -> CommandResult<String> {
    let format = format.trim().trim_start_matches('.').to_ascii_lowercase();
    if SUPPORTED_OUTPUTS.contains(&format.as_str()) {
        Ok(format)
    } else {
        Err(format!(
            "EDITOR_FORMAT_UNSUPPORTED:Le format {format} n'est pas exportable depuis l'éditeur."
        ))
    }
}

pub(super) fn normalized_input_format(extension: &str) -> &str {
    match extension {
        "markdown" => "md",
        "htm" => "html",
        other => other,
    }
}

pub(super) fn safe_file_stem(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, '-' | '_' | ' ') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let cleaned = cleaned.trim().trim_matches('.');
    if cleaned.is_empty() {
        "document".to_string()
    } else {
        cleaned.to_string()
    }
}

pub(super) fn safe_asset_name(value: &str) -> String {
    let name = Path::new(value)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    safe_file_stem(name)
}

pub(super) fn now_stamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

pub(super) fn modified_stamp(metadata: &fs::Metadata) -> String {
    metadata
        .modified()
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

pub(super) fn is_supported_image_mime(mime_type: &str) -> bool {
    matches!(
        mime_type,
        "image/png" | "image/jpeg" | "image/webp" | "image/gif"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_import_creates_tiptap_json_with_accents() {
        let document = plain_text_to_document("Été à Paris\n\nDeuxième partie");
        let encoded = document.to_string();
        assert!(encoded.contains("Été à Paris"));
        assert!(encoded.contains("Deuxième partie"));
        assert_eq!(document["content"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn persisted_images_must_use_mc_asset_urls() {
        let mut document = new_document("Images");
        let id = uuid::Uuid::new_v4().to_string();
        document.assets.push(EditorAssetRef {
            id: id.clone(),
            name: "image.png".to_string(),
            mime_type: "image/png".to_string(),
            size: 4,
            width: Some(1),
            height: Some(1),
        });
        document.content = json!({
            "type": "doc",
            "content": [{ "type": "image", "attrs": { "assetId": id, "src": "data:image/png;base64,AA==" } }]
        });
        assert!(validate_document(&document, true).is_err());
    }
}
