use super::document::{
    CommandResult, EditorAssetData, EditorAssetRef, EditorAssetStoreResult, EditorDocument,
    MAX_ASSET_BYTES, is_supported_image_mime, referenced_asset_ids, safe_asset_name, validate_id,
};
use super::storage::{
    assets_dir, existing_asset_path, load_document, save_draft_inner, write_bytes_atomically,
};
use image::ImageReader;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

pub(super) fn validate_image_asset(
    bytes: &[u8],
    requested_mime: &str,
) -> CommandResult<(String, u32, u32)> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_ASSET_BYTES {
        return Err("EDITOR_ASSET_LIMIT:Cette image dépasse la taille autorisée.".to_string());
    }
    let format = image::guess_format(bytes)
        .map_err(|_| "EDITOR_ASSET_INVALID:Le contenu de l’image est invalide.".to_string())?;
    let detected_mime = match format {
        image::ImageFormat::Png => "image/png",
        image::ImageFormat::Jpeg => "image/jpeg",
        image::ImageFormat::WebP => "image/webp",
        image::ImageFormat::Gif => "image/gif",
        _ => {
            return Err(
                "EDITOR_ASSET_INVALID:Seules les images PNG, JPEG, WebP et GIF sont acceptées."
                    .to_string(),
            );
        }
    };
    if !requested_mime.trim().is_empty()
        && requested_mime != "application/octet-stream"
        && requested_mime != detected_mime
    {
        return Err(
            "EDITOR_ASSET_INVALID:Le type déclaré ne correspond pas à l’image.".to_string(),
        );
    }
    if !is_supported_image_mime(detected_mime) {
        return Err("EDITOR_ASSET_INVALID:Type d’image non pris en charge.".to_string());
    }
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("EDITOR_ASSET_INVALID:{error}"))?;
    let (width, height) = reader
        .into_dimensions()
        .map_err(|error| format!("EDITOR_ASSET_INVALID:{error}"))?;
    if width == 0
        || height == 0
        || width > 32_768
        || height > 32_768
        || u64::from(width) * u64::from(height) > 120_000_000
    {
        return Err(
            "EDITOR_ASSET_LIMIT:Les dimensions de cette image sont trop grandes.".to_string(),
        );
    }
    Ok((detected_mime.to_string(), width, height))
}

pub(super) fn make_asset(
    name: &str,
    mime_type: &str,
    bytes: Vec<u8>,
) -> CommandResult<(EditorAssetRef, Vec<u8>)> {
    let (mime_type, width, height) = validate_image_asset(&bytes, mime_type)?;
    Ok((
        EditorAssetRef {
            id: uuid::Uuid::new_v4().to_string(),
            name: safe_asset_name(name),
            mime_type,
            size: bytes.len() as u64,
            width: Some(width),
            height: Some(height),
        },
        bytes,
    ))
}

pub(super) fn store_asset(
    document_id: &str,
    name: &str,
    mime_type: &str,
    bytes: Vec<u8>,
) -> CommandResult<EditorAssetStoreResult> {
    let document_id = validate_id(document_id)?;
    let mut document = load_document(&document_id)?;
    let (asset, bytes) = make_asset(name, mime_type, bytes)?;
    let destination = assets_dir(&document_id)?.join(&asset.id);
    write_bytes_atomically(&bytes, &destination)?;
    document.assets.push(asset.clone());
    match save_draft_inner(document) {
        Ok(document) => Ok(EditorAssetStoreResult { asset, document }),
        Err(error) => {
            let _ = fs::remove_file(destination);
            Err(error)
        }
    }
}

pub(super) fn read_asset(document_id: &str, asset_id: &str) -> CommandResult<EditorAssetData> {
    let document_id = validate_id(document_id)?;
    let asset_id = validate_id(asset_id)?;
    let document = load_document(&document_id)?;
    let asset = document
        .assets
        .iter()
        .find(|asset| asset.id == asset_id)
        .ok_or_else(|| "EDITOR_ASSET_MISSING:Ressource introuvable.".to_string())?;
    if asset.size > MAX_ASSET_BYTES {
        return Err("EDITOR_ASSET_LIMIT:Cette ressource est trop volumineuse.".to_string());
    }
    let bytes = fs::read(existing_asset_path(&document_id, &asset_id)?)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 != asset.size {
        return Err("EDITOR_ASSET_INVALID:La ressource locale est incomplète.".to_string());
    }
    Ok(EditorAssetData {
        bytes,
        mime_type: asset.mime_type.clone(),
    })
}

pub(super) fn remove_asset(document_id: &str, asset_id: &str) -> CommandResult<EditorDocument> {
    let document_id = validate_id(document_id)?;
    let asset_id = validate_id(asset_id)?;
    let mut document = load_document(&document_id)?;
    if referenced_asset_ids(&document).contains(&asset_id) {
        return Err(
            "EDITOR_ASSET_IN_USE:Cette image est encore utilisée dans le document.".to_string(),
        );
    }
    document.assets.retain(|asset| asset.id != asset_id);
    let document = save_draft_inner(document)?;
    if let Ok(path) = existing_asset_path(&document_id, &asset_id) {
        let _ = fs::remove_file(path);
    }
    Ok(document)
}

pub(super) fn prune_assets(document_id: &str) -> CommandResult<EditorDocument> {
    let document_id = validate_id(document_id)?;
    let mut document = load_document(&document_id)?;
    let referenced = referenced_asset_ids(&document);
    let removed = document
        .assets
        .iter()
        .filter(|asset| !referenced.contains(&asset.id))
        .map(|asset| asset.id.clone())
        .collect::<Vec<_>>();
    document
        .assets
        .retain(|asset| referenced.contains(&asset.id));
    let document = save_draft_inner(document)?;
    for id in removed {
        if let Ok(path) = existing_asset_path(&document_id, &id) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(document)
}

pub(super) fn read_asset_from_path(path: &Path) -> CommandResult<(String, String, Vec<u8>)> {
    if !path.is_file() {
        return Err("EDITOR_ASSET_MISSING:Image introuvable.".to_string());
    }
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_ASSET_BYTES {
        return Err("EDITOR_ASSET_LIMIT:Cette image dépasse la taille autorisée.".to_string());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image")
        .to_string();
    let mime = match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    }
    .to_string();
    Ok((name, mime, bytes))
}

pub(super) fn extension_for_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "bin",
    }
}

pub(super) fn asset_file_for_export(
    document_id: &str,
    asset: &EditorAssetRef,
) -> CommandResult<PathBuf> {
    existing_asset_path(document_id, &asset.id)
}
