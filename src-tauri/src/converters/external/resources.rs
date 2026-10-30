use crate::converters::{ConvertError, Result};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::Value;
use std::fs;
use std::path::Path;

const MAX_RESOURCE_BYTES: usize = 32 * 1024 * 1024;
const MAX_TOTAL_RESOURCE_BYTES: usize = 64 * 1024 * 1024;

pub(super) fn embed_local_images(ast: &mut Value, source_root: &Path) -> Result<()> {
    let root = source_root.canonicalize()?;
    embed_images(ast, &root, &mut 0)
}

fn embed_images(value: &mut Value, root: &Path, total: &mut usize) -> Result<()> {
    if value.get("t").and_then(Value::as_str) == Some("Image") {
        let target = value
            .get("c")
            .and_then(|value| value.get(2))
            .and_then(|value| value.get(0))
            .and_then(Value::as_str)
            .ok_or_else(|| invalid_resource("Référence d’image invalide."))?
            .to_string();
        let bytes = resource_bytes(&target, root)?;
        *total = total
            .checked_add(bytes.len())
            .filter(|size| *size <= MAX_TOTAL_RESOURCE_BYTES)
            .ok_or_else(|| invalid_resource("Les images du document dépassent 64 Mio."))?;
        let mime = image_mime(&bytes)?;
        value["c"][2][0] = Value::String(format!("data:{mime};base64,{}", STANDARD.encode(bytes)));
    }
    match value {
        Value::Array(items) => {
            for item in items {
                embed_images(item, root, total)?;
            }
        }
        Value::Object(items) => {
            for item in items.values_mut() {
                embed_images(item, root, total)?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub(in crate::converters) fn resource_bytes(target: &str, root: &Path) -> Result<Vec<u8>> {
    if let Some(data) = target.strip_prefix("data:") {
        let (header, encoded) = data
            .split_once(',')
            .ok_or_else(|| invalid_resource("Image embarquée invalide."))?;
        if !header.starts_with("image/")
            || !header.ends_with(";base64")
            || encoded.len() > MAX_RESOURCE_BYTES * 4 / 3 + 4
        {
            return Err(invalid_resource("Type ou taille d’image embarquée refusé."));
        }
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| invalid_resource("Encodage d’image invalide."))?;
        if bytes.len() > MAX_RESOURCE_BYTES {
            return Err(invalid_resource("Image supérieure à 32 Mio."));
        }
        image_mime(&bytes)?;
        return Ok(bytes);
    }
    let base = tauri::Url::from_directory_path(root)
        .map_err(|_| invalid_resource("Dossier de ressources invalide."))?;
    let url = base
        .join(target)
        .map_err(|_| invalid_resource("Référence de ressource invalide."))?;
    if url.scheme() != "file" || url.host_str().is_some() {
        return Err(invalid_resource(
            "Une image distante a été bloquée. Utilisez une copie locale dans le dossier du document.",
        ));
    }
    let resource = url
        .to_file_path()
        .map_err(|_| invalid_resource("Chemin de ressource invalide."))?
        .canonicalize()
        .map_err(|_| invalid_resource("Image locale introuvable."))?;
    if !resource.starts_with(root) {
        return Err(invalid_resource(
            "Une image hors du dossier du document a été bloquée.",
        ));
    }
    read_bounded_image(&resource)
}

fn read_bounded_image(resource: &Path) -> Result<Vec<u8>> {
    use std::io::Read;
    let metadata = fs::metadata(resource)?;
    if !metadata.is_file() || metadata.len() > MAX_RESOURCE_BYTES as u64 {
        return Err(invalid_resource(
            "Image locale supérieure à 32 Mio ou non régulière.",
        ));
    }
    let mut bytes = Vec::new();
    fs::File::open(resource)?
        .take(MAX_RESOURCE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_RESOURCE_BYTES {
        return Err(invalid_resource("Image locale supérieure à 32 Mio."));
    }
    image_mime(&bytes)?;
    Ok(bytes)
}

fn image_mime(bytes: &[u8]) -> Result<&'static str> {
    match image::guess_format(bytes) {
        Ok(image::ImageFormat::Png) => Ok("image/png"),
        Ok(image::ImageFormat::Jpeg) => Ok("image/jpeg"),
        Ok(image::ImageFormat::Gif) => Ok("image/gif"),
        Ok(image::ImageFormat::WebP) => Ok("image/webp"),
        Ok(image::ImageFormat::Bmp) => Ok("image/bmp"),
        Ok(image::ImageFormat::Tiff) => Ok("image/tiff"),
        _ => Err(invalid_resource(
            "L’image doit être un fichier PNG, JPEG, GIF, WebP, BMP ou TIFF.",
        )),
    }
}

fn invalid_resource(message: &str) -> ConvertError {
    ConvertError::Message(format!("Ressource documentaire : {message}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ast(target: &str) -> Value {
        serde_json::json!({"t":"Image","c":[["",[],[]],[],[target,""]]})
    }

    #[test]
    fn local_images_are_embedded_without_granting_writer_filesystem_access() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(
            temp.path().join("image test.png"),
            b"\x89PNG\r\n\x1a\nimage",
        )
        .unwrap();
        let mut value = ast("image%20test.png");
        embed_local_images(&mut value, temp.path()).unwrap();
        assert!(
            value["c"][2][0]
                .as_str()
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
    }

    #[test]
    fn network_and_parent_directory_resources_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join("source")).unwrap();
        fs::write(temp.path().join("private.png"), b"\x89PNG\r\n\x1a\nprivate").unwrap();
        for target in [
            "https://example.invalid/a.png",
            "http://127.0.0.1/a.png",
            "../private.png",
        ] {
            assert!(embed_local_images(&mut ast(target), &temp.path().join("source")).is_err());
        }
    }

    #[test]
    fn a_private_text_file_cannot_be_disguised_as_an_image() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("private.png"), b"confidential text").unwrap();
        assert!(embed_local_images(&mut ast("private.png"), temp.path()).is_err());
    }
}
