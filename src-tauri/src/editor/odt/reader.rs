use super::ParsedOdt;
use super::package::{normalize_package_path, read_entry, validate_archive};
use super::styles::{collect_styles, default_page_settings, find_descendant};
use super::tiptap::blocks_to_document;
use super::types::{AssetContext, StyleCatalog};
use super::xml::{ensure_manifest_is_safe, manifest_media_types, parse_xml};
use super::{MAX_TOTAL_ASSET_BYTES, MAX_XML_BYTES, NS_OFFICE};
use crate::editor::document::{CommandResult, MAX_ASSET_BYTES};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub(in crate::editor) fn parse_odt(path: &Path) -> CommandResult<ParsedOdt> {
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("ODT_ARCHIVE_INVALID:{error}"))?;
    validate_archive(&mut archive)?;

    let mimetype = read_entry(&mut archive, "mimetype", 256)?;
    if mimetype != b"application/vnd.oasis.opendocument.text" {
        return Err("ODT_ARCHIVE_INVALID:Le type MIME du document ODT est invalide.".to_string());
    }
    let manifest_bytes = read_entry(&mut archive, "META-INF/manifest.xml", MAX_XML_BYTES)?;
    let styles_bytes = read_entry(&mut archive, "styles.xml", MAX_XML_BYTES)?;
    let content_bytes = read_entry(&mut archive, "content.xml", MAX_XML_BYTES)?;
    let manifest = parse_xml(&manifest_bytes)?;
    ensure_manifest_is_safe(&manifest)?;

    let media_types = manifest_media_types(&manifest);
    let mut package_assets = HashMap::new();
    let mut total_asset_bytes = 0u64;
    for (name, mime_type) in media_types {
        if !mime_type.starts_with("image/") {
            continue;
        }
        let normalized = normalize_package_path(&name)?;
        let bytes = read_entry(&mut archive, &normalized, MAX_ASSET_BYTES)?;
        total_asset_bytes = total_asset_bytes
            .checked_add(bytes.len() as u64)
            .ok_or_else(|| "ODT_ARCHIVE_LIMIT:Taille d’assets invalide.".to_string())?;
        if total_asset_bytes > MAX_TOTAL_ASSET_BYTES {
            return Err(
                "ODT_ARCHIVE_LIMIT:Les images du document sont trop volumineuses.".to_string(),
            );
        }
        package_assets.insert(normalized, (mime_type, bytes));
    }

    let styles_root = parse_xml(&styles_bytes)?;
    let content_root = parse_xml(&content_bytes)?;
    let mut catalog = StyleCatalog::default();
    collect_styles(&styles_root, &mut catalog)?;
    collect_styles(&content_root, &mut catalog)?;

    let mut assets = AssetContext {
        package_assets,
        imported: HashMap::new(),
        assets: Vec::new(),
        warnings: Vec::new(),
    };
    let body = find_descendant(&content_root, NS_OFFICE, "text")
        .ok_or_else(|| "ODT_UNSUPPORTED_CONTENT:Corps de document ODT introuvable.".to_string())?;
    let content = blocks_to_document(body, &catalog, &mut assets)?;
    let header = catalog
        .header
        .as_ref()
        .map(|node| blocks_to_document(node, &catalog, &mut assets))
        .transpose()?;
    let footer = catalog
        .footer
        .as_ref()
        .map(|node| blocks_to_document(node, &catalog, &mut assets))
        .transpose()?;
    let mut page = catalog
        .master_layout
        .as_ref()
        .and_then(|name| catalog.page_layouts.get(name))
        .cloned()
        .or_else(|| catalog.page_layouts.values().next().cloned())
        .unwrap_or_else(default_page_settings);
    page.numbering = detect_page_numbering(footer.as_ref());

    Ok(ParsedOdt {
        content,
        header,
        footer,
        page,
        assets: assets.assets,
        warnings: assets.warnings,
    })
}

fn detect_page_numbering(footer: Option<&Value>) -> String {
    fn text_contains_page(value: &Value) -> bool {
        value
            .get("text")
            .and_then(Value::as_str)
            .is_some_and(|text| text.contains("{page}"))
            || value
                .get("content")
                .and_then(Value::as_array)
                .is_some_and(|children| children.iter().any(text_contains_page))
    }

    fn paragraph_alignment(value: &Value) -> Option<&str> {
        if value.get("type").and_then(Value::as_str) == Some("paragraph")
            && text_contains_page(value)
        {
            return value
                .pointer("/attrs/textAlign")
                .and_then(Value::as_str)
                .or(Some("center"));
        }
        value
            .get("content")
            .and_then(Value::as_array)
            .and_then(|children| children.iter().find_map(paragraph_alignment))
    }

    match footer.and_then(paragraph_alignment) {
        Some("right" | "end") => "bottom-right".to_string(),
        Some(_) => "bottom-center".to_string(),
        None => "none".to_string(),
    }
}
