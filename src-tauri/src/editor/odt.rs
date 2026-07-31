use super::assets::{asset_file_for_export, extension_for_mime, make_asset};
use super::document::{
    CommandResult, EditorAssetRef, EditorCompatibilityWarning, EditorDocument, EditorMargins,
    EditorPageSettings, MAX_ASSET_BYTES, is_supported_image_mime,
};
use base64::Engine;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;

const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_UNCOMPRESSED_BYTES: u64 = 512 * 1024 * 1024;
const MAX_XML_BYTES: u64 = 64 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES: u64 = 256 * 1024 * 1024;
const MAX_XML_DEPTH: usize = 128;
const MAX_XML_NODES: usize = 250_000;
const MAX_STYLES: usize = 50_000;
const MAX_COMPRESSION_RATIO: u64 = 100;

const NS_OFFICE: &str = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const NS_TEXT: &str = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const NS_STYLE: &str = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";
const NS_TABLE: &str = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
const NS_DRAW: &str = "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0";
const NS_XLINK: &str = "http://www.w3.org/1999/xlink";
const NS_FO: &str = "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0";
const NS_SVG: &str = "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0";
const NS_MANIFEST: &str = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";

#[derive(Clone, Debug)]
enum XmlChild {
    Node(XmlNode),
    Text(String),
}

#[derive(Clone, Debug)]
struct XmlNode {
    namespace: String,
    name: String,
    attrs: HashMap<(String, String), String>,
    children: Vec<XmlChild>,
}

impl XmlNode {
    fn is(&self, namespace: &str, name: &str) -> bool {
        self.namespace == namespace && self.name == name
    }

    fn attr(&self, namespace: &str, name: &str) -> Option<&str> {
        self.attrs
            .get(&(namespace.to_string(), name.to_string()))
            .map(String::as_str)
    }

    fn child_nodes(&self) -> impl Iterator<Item = &XmlNode> {
        self.children.iter().filter_map(|child| match child {
            XmlChild::Node(node) => Some(node),
            XmlChild::Text(_) => None,
        })
    }

    fn descendants<'a>(&'a self, output: &mut Vec<&'a XmlNode>) {
        for node in self.child_nodes() {
            output.push(node);
            node.descendants(output);
        }
    }
}

#[derive(Clone, Debug, Default)]
struct StyleInfo {
    parent: Option<String>,
    family: String,
    text: HashMap<String, String>,
    paragraph: HashMap<String, String>,
}

#[derive(Default)]
struct StyleCatalog {
    styles: HashMap<String, StyleInfo>,
    ordered_lists: HashSet<String>,
    page_layouts: HashMap<String, EditorPageSettings>,
    master_layout: Option<String>,
    header: Option<XmlNode>,
    footer: Option<XmlNode>,
}

pub(super) struct ParsedOdt {
    pub(super) content: Value,
    pub(super) header: Option<Value>,
    pub(super) footer: Option<Value>,
    pub(super) page: EditorPageSettings,
    pub(super) assets: Vec<(EditorAssetRef, Vec<u8>)>,
    pub(super) warnings: Vec<EditorCompatibilityWarning>,
}

struct AssetContext {
    package_assets: HashMap<String, (String, Vec<u8>)>,
    imported: HashMap<String, EditorAssetRef>,
    assets: Vec<(EditorAssetRef, Vec<u8>)>,
    warnings: Vec<EditorCompatibilityWarning>,
}

#[derive(Default)]
struct WriterStyleCatalog {
    names: HashMap<String, String>,
    declarations: String,
}

pub(super) fn parse_odt(path: &Path) -> CommandResult<ParsedOdt> {
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

fn validate_archive(archive: &mut zip::ZipArchive<fs::File>) -> CommandResult<()> {
    if archive.is_empty() || archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("ODT_ARCHIVE_LIMIT:Nombre d’entrées ODT invalide.".to_string());
    }
    let first = archive
        .by_index(0)
        .map_err(|error| format!("ODT_ARCHIVE_INVALID:{error}"))?;
    if first.name() != "mimetype" || first.compression() != zip::CompressionMethod::Stored {
        return Err(
            "ODT_ARCHIVE_INVALID:L’entrée mimetype doit être la première et non compressée."
                .to_string(),
        );
    }
    drop(first);

    let mut total = 0u64;
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("ODT_ARCHIVE_INVALID:{error}"))?;
        let enclosed = entry.enclosed_name().ok_or_else(|| {
            "ODT_PATH_TRAVERSAL:Un chemin dangereux a été détecté dans l’archive.".to_string()
        })?;
        let normalized = enclosed
            .to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_string();
        if normalized.starts_with('/')
            || normalized.is_empty()
            || normalized
                .split('/')
                .any(|part| part == ".." || part.is_empty())
        {
            return Err("ODT_PATH_TRAVERSAL:Chemin d’archive invalide.".to_string());
        }
        if !names.insert(normalized.to_ascii_lowercase()) {
            return Err("ODT_ARCHIVE_INVALID:Entrées ODT ambiguës ou dupliquées.".to_string());
        }
        total = total
            .checked_add(entry.size())
            .ok_or_else(|| "ODT_ARCHIVE_LIMIT:Taille ODT invalide.".to_string())?;
        if total > MAX_UNCOMPRESSED_BYTES {
            return Err(
                "ODT_ARCHIVE_LIMIT:Le contenu décompressé est trop volumineux.".to_string(),
            );
        }
        if entry.size() > 1024 * 1024
            && entry.compressed_size() > 0
            && entry.size() / entry.compressed_size() > MAX_COMPRESSION_RATIO
        {
            return Err("ODT_ARCHIVE_LIMIT:Ratio de compression ODT dangereux.".to_string());
        }
    }
    Ok(())
}

fn read_entry(
    archive: &mut zip::ZipArchive<fs::File>,
    name: &str,
    limit: u64,
) -> CommandResult<Vec<u8>> {
    let entry = archive
        .by_name(name)
        .map_err(|_| format!("ODT_ARCHIVE_INVALID:Entrée {name} introuvable."))?;
    if entry.size() > limit {
        return Err(format!(
            "ODT_ARCHIVE_LIMIT:L’entrée {name} est trop volumineuse."
        ));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > limit {
        return Err(format!(
            "ODT_ARCHIVE_LIMIT:L’entrée {name} est trop volumineuse."
        ));
    }
    Ok(bytes)
}

fn normalize_package_path(value: &str) -> CommandResult<String> {
    let value = value.trim_start_matches("./").replace('\\', "/");
    if value.is_empty()
        || value.starts_with('/')
        || value.contains(':')
        || value.split('/').any(|part| part.is_empty() || part == "..")
    {
        return Err("ODT_PATH_TRAVERSAL:Chemin de ressource ODT invalide.".to_string());
    }
    Ok(value)
}

fn parse_xml(bytes: &[u8]) -> CommandResult<XmlNode> {
    if bytes.len() as u64 > MAX_XML_BYTES {
        return Err("ODT_XML_LIMIT:Partie XML trop volumineuse.".to_string());
    }
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().enable_all_checks(true);
    let mut buffer = Vec::new();
    let mut stack = Vec::<XmlNode>::new();
    let mut namespace_stack = vec![HashMap::<String, String>::new()];
    let mut root = None;
    let mut node_count = 0usize;

    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| format!("ODT_XML_INVALID:{error}"))?
        {
            Event::Start(event) => {
                node_count += 1;
                if node_count > MAX_XML_NODES || stack.len() >= MAX_XML_DEPTH {
                    return Err("ODT_XML_LIMIT:Structure XML trop complexe.".to_string());
                }
                let (node, namespaces) =
                    xml_node_from_start(&reader, &event, namespace_stack.last())?;
                stack.push(node);
                namespace_stack.push(namespaces);
            }
            Event::Empty(event) => {
                node_count += 1;
                if node_count > MAX_XML_NODES || stack.len() >= MAX_XML_DEPTH {
                    return Err("ODT_XML_LIMIT:Structure XML trop complexe.".to_string());
                }
                let (node, _) = xml_node_from_start(&reader, &event, namespace_stack.last())?;
                append_xml_node(node, &mut stack, &mut root)?;
            }
            Event::End(_) => {
                namespace_stack.pop();
                let node = stack
                    .pop()
                    .ok_or_else(|| "ODT_XML_INVALID:Balise fermante inattendue.".to_string())?;
                append_xml_node(node, &mut stack, &mut root)?;
            }
            Event::Text(text) => {
                if let Some(parent) = stack.last_mut() {
                    let decoded = text
                        .decode()
                        .map_err(|error| format!("ODT_XML_INVALID:{error}"))?;
                    let unescaped = quick_xml::escape::unescape(&decoded)
                        .map_err(|error| format!("ODT_XML_INVALID:{error}"))?;
                    if !unescaped.is_empty() {
                        parent.children.push(XmlChild::Text(unescaped.into_owned()));
                    }
                }
            }
            Event::CData(text) => {
                if let Some(parent) = stack.last_mut() {
                    let decoded = text
                        .decode()
                        .map_err(|error| format!("ODT_XML_INVALID:{error}"))?;
                    parent.children.push(XmlChild::Text(decoded.into_owned()));
                }
            }
            Event::DocType(_) => {
                return Err("ODT_XML_FORBIDDEN:Les DTD sont interdites.".to_string());
            }
            Event::GeneralRef(reference) => {
                let name = reference
                    .decode()
                    .map_err(|error| format!("ODT_XML_INVALID:{error}"))?;
                let decoded = decode_general_reference(&name).ok_or_else(|| {
                    format!("ODT_XML_FORBIDDEN:Entité XML personnalisée interdite ({name}).")
                })?;
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(XmlChild::Text(decoded));
                }
            }
            Event::Eof => break,
            Event::Decl(_) | Event::PI(_) | Event::Comment(_) => {}
        }
        buffer.clear();
    }
    if !stack.is_empty() {
        return Err("ODT_XML_INVALID:Document XML incomplet.".to_string());
    }
    root.ok_or_else(|| "ODT_XML_INVALID:Document XML vide.".to_string())
}

fn decode_general_reference(name: &str) -> Option<String> {
    let character = match name {
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "apos" => '\'',
        "quot" => '"',
        value if value.starts_with("#x") => {
            char::from_u32(u32::from_str_radix(&value[2..], 16).ok()?)?
        }
        value if value.starts_with('#') => char::from_u32(value[1..].parse().ok()?)?,
        _ => return None,
    };
    if character == '\0' || character.is_control() && !matches!(character, '\n' | '\r' | '\t') {
        return None;
    }
    Some(character.to_string())
}

fn xml_node_from_start(
    reader: &Reader<&[u8]>,
    event: &BytesStart<'_>,
    inherited: Option<&HashMap<String, String>>,
) -> CommandResult<(XmlNode, HashMap<String, String>)> {
    let mut namespaces = inherited.cloned().unwrap_or_default();
    let mut raw_attributes = Vec::new();
    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("ODT_XML_INVALID:{error}"))?;
        let name = std::str::from_utf8(attribute.key.as_ref())
            .map_err(|_| "ODT_XML_INVALID:Nom d’attribut XML invalide.".to_string())?
            .to_string();
        let value = attribute
            .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
            .map_err(|error| format!("ODT_XML_INVALID:{error}"))?
            .into_owned();
        if name == "xmlns" {
            namespaces.insert(String::new(), value.clone());
        } else if let Some(prefix) = name.strip_prefix("xmlns:") {
            namespaces.insert(prefix.to_string(), value.clone());
        }
        raw_attributes.push((name, value));
    }
    let event_name = event.name();
    let qualified_name = std::str::from_utf8(event_name.as_ref())
        .map_err(|_| "ODT_XML_INVALID:Nom d’élément XML invalide.".to_string())?;
    let (prefix, local) = split_qualified_name(qualified_name);
    let namespace = namespaces.get(prefix).cloned().unwrap_or_default();
    let mut attrs = HashMap::new();
    for (name, value) in raw_attributes {
        if name == "xmlns" || name.starts_with("xmlns:") {
            continue;
        }
        let (prefix, local) = split_qualified_name(&name);
        let namespace = if prefix.is_empty() {
            String::new()
        } else {
            namespaces
                .get(prefix)
                .cloned()
                .ok_or_else(|| "ODT_XML_INVALID:Préfixe XML d’attribut inconnu.".to_string())?
        };
        attrs.insert((namespace, local.to_string()), value);
    }
    Ok((
        XmlNode {
            namespace,
            name: local.to_string(),
            attrs,
            children: Vec::new(),
        },
        namespaces,
    ))
}

fn split_qualified_name(value: &str) -> (&str, &str) {
    value.split_once(':').unwrap_or(("", value))
}

fn append_xml_node(
    node: XmlNode,
    stack: &mut [XmlNode],
    root: &mut Option<XmlNode>,
) -> CommandResult<()> {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(XmlChild::Node(node));
    } else if root.replace(node).is_some() {
        return Err("ODT_XML_INVALID:Plusieurs racines XML détectées.".to_string());
    }
    Ok(())
}

fn ensure_manifest_is_safe(root: &XmlNode) -> CommandResult<()> {
    let mut nodes = vec![root];
    root.descendants(&mut nodes);
    for node in nodes {
        if node.is(NS_MANIFEST, "encryption-data")
            || node.is(NS_MANIFEST, "algorithm")
            || node.is(NS_MANIFEST, "key-derivation")
        {
            return Err(
                "ODT_ENCRYPTED:Les documents ODT chiffrés ne sont pas pris en charge.".to_string(),
            );
        }
    }
    Ok(())
}

fn manifest_media_types(root: &XmlNode) -> HashMap<String, String> {
    let mut nodes = vec![root];
    root.descendants(&mut nodes);
    nodes
        .into_iter()
        .filter(|node| node.is(NS_MANIFEST, "file-entry"))
        .filter_map(|node| {
            Some((
                node.attr(NS_MANIFEST, "full-path")?.to_string(),
                node.attr(NS_MANIFEST, "media-type")?.to_string(),
            ))
        })
        .collect()
}

fn collect_styles(root: &XmlNode, catalog: &mut StyleCatalog) -> CommandResult<()> {
    let mut nodes = vec![root];
    root.descendants(&mut nodes);
    for node in nodes {
        if node.is(NS_STYLE, "style") {
            let Some(name) = node.attr(NS_STYLE, "name") else {
                continue;
            };
            if catalog.styles.len() >= MAX_STYLES {
                return Err("ODT_XML_LIMIT:Le document contient trop de styles.".to_string());
            }
            let mut style = StyleInfo {
                parent: node.attr(NS_STYLE, "parent-style-name").map(str::to_string),
                family: node
                    .attr(NS_STYLE, "family")
                    .unwrap_or_default()
                    .to_string(),
                ..StyleInfo::default()
            };
            for child in node.child_nodes() {
                if child.is(NS_STYLE, "text-properties") {
                    collect_property_attributes(child, &mut style.text);
                } else if child.is(NS_STYLE, "paragraph-properties") {
                    collect_property_attributes(child, &mut style.paragraph);
                }
            }
            catalog.styles.insert(name.to_string(), style);
        } else if node.is(NS_TEXT, "list-style") {
            if let Some(name) = node.attr(NS_STYLE, "name")
                && node
                    .child_nodes()
                    .any(|child| child.is(NS_TEXT, "list-level-style-number"))
            {
                catalog.ordered_lists.insert(name.to_string());
            }
        } else if node.is(NS_STYLE, "page-layout") {
            if let Some(name) = node.attr(NS_STYLE, "name")
                && let Some(properties) = node
                    .child_nodes()
                    .find(|child| child.is(NS_STYLE, "page-layout-properties"))
            {
                catalog
                    .page_layouts
                    .insert(name.to_string(), page_settings_from_properties(properties));
            }
        } else if node.is(NS_STYLE, "master-page") && catalog.master_layout.is_none() {
            catalog.master_layout = node.attr(NS_STYLE, "page-layout-name").map(str::to_string);
            catalog.header = node
                .child_nodes()
                .find(|child| child.is(NS_STYLE, "header"))
                .cloned();
            catalog.footer = node
                .child_nodes()
                .find(|child| child.is(NS_STYLE, "footer"))
                .cloned();
        }
    }
    Ok(())
}

fn collect_property_attributes(node: &XmlNode, target: &mut HashMap<String, String>) {
    for ((namespace, name), value) in &node.attrs {
        if namespace == NS_FO || namespace == NS_STYLE {
            target.insert(name.clone(), value.clone());
        }
    }
}

fn page_settings_from_properties(properties: &XmlNode) -> EditorPageSettings {
    let width_mm = parse_length_mm(properties.attr(NS_FO, "page-width")).unwrap_or(210.0);
    let height_mm = parse_length_mm(properties.attr(NS_FO, "page-height")).unwrap_or(297.0);
    let orientation = properties
        .attr(NS_STYLE, "print-orientation")
        .unwrap_or(if width_mm > height_mm {
            "landscape"
        } else {
            "portrait"
        })
        .to_string();
    let format = page_format(width_mm, height_mm);
    EditorPageSettings {
        format,
        orientation,
        margins_mm: EditorMargins {
            top: parse_length_mm(properties.attr(NS_FO, "margin-top")).unwrap_or(25.0),
            right: parse_length_mm(properties.attr(NS_FO, "margin-right")).unwrap_or(20.0),
            bottom: parse_length_mm(properties.attr(NS_FO, "margin-bottom")).unwrap_or(25.0),
            left: parse_length_mm(properties.attr(NS_FO, "margin-left")).unwrap_or(20.0),
        },
        numbering: "bottom-center".to_string(),
    }
}

fn default_page_settings() -> EditorPageSettings {
    EditorPageSettings {
        format: "a4".to_string(),
        orientation: "portrait".to_string(),
        margins_mm: EditorMargins {
            top: 25.0,
            right: 20.0,
            bottom: 25.0,
            left: 20.0,
        },
        numbering: "bottom-center".to_string(),
    }
}

fn parse_length_mm(value: Option<&str>) -> Option<f32> {
    let value = value?.trim();
    for (suffix, factor) in [("mm", 1.0), ("cm", 10.0), ("in", 25.4), ("pt", 25.4 / 72.0)] {
        if let Some(number) = value.strip_suffix(suffix) {
            return number
                .trim()
                .parse::<f32>()
                .ok()
                .map(|number| number * factor);
        }
    }
    None
}

fn page_format(width: f32, height: f32) -> String {
    let (short, long) = if width <= height {
        (width, height)
    } else {
        (height, width)
    };
    let candidates = [
        ("a3", 297.0, 420.0),
        ("a4", 210.0, 297.0),
        ("a5", 148.0, 210.0),
        ("letter", 215.9, 279.4),
        ("legal", 215.9, 355.6),
    ];
    candidates
        .into_iter()
        .min_by(|(_, aw, ah), (_, bw, bh)| {
            ((short - aw).abs() + (long - ah).abs())
                .total_cmp(&((short - bw).abs() + (long - bh).abs()))
        })
        .map(|(name, _, _)| name.to_string())
        .unwrap_or_else(|| "a4".to_string())
}

fn find_descendant<'a>(root: &'a XmlNode, namespace: &str, name: &str) -> Option<&'a XmlNode> {
    if root.is(namespace, name) {
        return Some(root);
    }
    root.child_nodes()
        .find_map(|child| find_descendant(child, namespace, name))
}

fn blocks_to_document(
    container: &XmlNode,
    catalog: &StyleCatalog,
    assets: &mut AssetContext,
) -> CommandResult<Value> {
    let mut content = Vec::new();
    for child in container.child_nodes() {
        if (child.is(NS_TEXT, "p") || child.is(NS_TEXT, "h"))
            && resolved_style(child.attr(NS_TEXT, "style-name"), catalog)?
                .paragraph
                .get("break-before")
                .is_some_and(|value| value == "page")
        {
            content.push(json!({ "type": "pageBreak" }));
        }
        if let Some(block) = block_to_tiptap(child, catalog, assets)? {
            content.push(block);
        }
    }
    if content.is_empty() {
        content.push(json!({ "type": "paragraph" }));
    }
    Ok(json!({ "type": "doc", "content": content }))
}

fn block_to_tiptap(
    node: &XmlNode,
    catalog: &StyleCatalog,
    assets: &mut AssetContext,
) -> CommandResult<Option<Value>> {
    if node.is(NS_TEXT, "p") || node.is(NS_TEXT, "h") {
        let frames = node
            .child_nodes()
            .filter(|child| child.is(NS_DRAW, "frame"))
            .collect::<Vec<_>>();
        let has_meaningful_non_frame = node.children.iter().any(|child| match child {
            XmlChild::Text(text) => !text.trim().is_empty(),
            XmlChild::Node(child) => {
                !child.is(NS_DRAW, "frame")
                    && !matches!(
                        child.name.as_str(),
                        "bookmark" | "bookmark-start" | "bookmark-end"
                    )
            }
        });
        if frames.len() == 1 && !has_meaningful_non_frame {
            return frame_to_image(frames[0], assets).map(Some);
        }
        let style = resolved_style(node.attr(NS_TEXT, "style-name"), catalog)?;
        let mut attrs = Map::new();
        if let Some(align) = style.paragraph.get("text-align") {
            attrs.insert("textAlign".to_string(), json!(normalize_alignment(align)));
        }
        if let Some(line_height) = style.paragraph.get("line-height") {
            attrs.insert("lineHeight".to_string(), json!(line_height));
        }
        if let Some(margin_left) = style.paragraph.get("margin-left") {
            attrs.insert("marginLeft".to_string(), json!(margin_left));
        }
        if let Some(text_indent) = style.paragraph.get("text-indent") {
            attrs.insert("textIndent".to_string(), json!(text_indent));
        }
        let mut value = Map::new();
        if node.is(NS_TEXT, "h") {
            let level = node
                .attr(NS_TEXT, "outline-level")
                .and_then(|value| value.parse::<u8>().ok())
                .unwrap_or(1)
                .clamp(1, 6);
            value.insert("type".to_string(), json!("heading"));
            attrs.insert("level".to_string(), json!(level));
        } else {
            value.insert("type".to_string(), json!("paragraph"));
        }
        if !attrs.is_empty() {
            value.insert("attrs".to_string(), Value::Object(attrs));
        }
        let inline = inline_content(node, catalog, assets, &[])?;
        if !inline.is_empty() {
            value.insert("content".to_string(), Value::Array(inline));
        }
        return Ok(Some(Value::Object(value)));
    }
    if node.is(NS_TEXT, "list") {
        let style_name = node.attr(NS_TEXT, "style-name").unwrap_or_default();
        let ordered = catalog.ordered_lists.contains(style_name);
        let mut items = Vec::new();
        for item in node
            .child_nodes()
            .filter(|child| child.is(NS_TEXT, "list-item"))
        {
            let mut blocks = Vec::new();
            for child in item.child_nodes() {
                if let Some(block) = block_to_tiptap(child, catalog, assets)? {
                    blocks.push(block);
                }
            }
            if blocks.is_empty() {
                blocks.push(json!({ "type": "paragraph" }));
            }
            items.push(json!({ "type": "listItem", "content": blocks }));
        }
        return Ok(Some(json!({
            "type": if ordered { "orderedList" } else { "bulletList" },
            "content": items
        })));
    }
    if node.is(NS_TABLE, "table") {
        let mut rows = Vec::new();
        let mut source_rows = Vec::new();
        collect_table_rows(node, false, &mut source_rows);
        for (row, header_row) in source_rows {
            let mut cells = Vec::new();
            for cell in row.child_nodes().filter(|child| {
                child.is(NS_TABLE, "table-cell") || child.is(NS_TABLE, "covered-table-cell")
            }) {
                if cell.is(NS_TABLE, "covered-table-cell") {
                    continue;
                }
                let mut blocks = Vec::new();
                for child in cell.child_nodes() {
                    if let Some(block) = block_to_tiptap(child, catalog, assets)? {
                        blocks.push(block);
                    }
                }
                if blocks.is_empty() {
                    blocks.push(json!({ "type": "paragraph" }));
                }
                let colspan = cell
                    .attr(NS_TABLE, "number-columns-spanned")
                    .and_then(|value| value.parse::<u32>().ok())
                    .unwrap_or(1);
                let rowspan = cell
                    .attr(NS_TABLE, "number-rows-spanned")
                    .and_then(|value| value.parse::<u32>().ok())
                    .unwrap_or(1);
                let parsed_cell = json!({
                    "type": if header_row { "tableHeader" } else { "tableCell" },
                    "attrs": { "colspan": colspan, "rowspan": rowspan },
                    "content": blocks
                });
                let repeated = cell
                    .attr(NS_TABLE, "number-columns-repeated")
                    .and_then(|value| value.parse::<usize>().ok())
                    .unwrap_or(1)
                    .min(1_000);
                cells.extend(std::iter::repeat_n(parsed_cell, repeated));
            }
            let parsed_row = json!({ "type": "tableRow", "content": cells });
            let repeated = row
                .attr(NS_TABLE, "number-rows-repeated")
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(1)
                .min(1_000);
            rows.extend(std::iter::repeat_n(parsed_row, repeated));
        }
        return Ok(Some(json!({ "type": "table", "content": rows })));
    }
    if node.is(NS_DRAW, "frame") {
        return frame_to_image(node, assets).map(Some);
    }
    if node.namespace == NS_DRAW && matches!(node.name.as_str(), "object" | "object-ole" | "plugin")
    {
        assets.warnings.push(unsupported_warning());
        return Ok(Some(json!({
            "type": "unsupportedObject",
            "attrs": { "label": "Objet incorporé non éditable" }
        })));
    }
    if node.is(NS_TEXT, "section") || node.is(NS_OFFICE, "text") {
        let mut blocks = Vec::new();
        for child in node.child_nodes() {
            if let Some(block) = block_to_tiptap(child, catalog, assets)? {
                blocks.push(block);
            }
        }
        return Ok(Some(json!({ "type": "blockquote", "content": blocks })));
    }
    Ok(None)
}

fn collect_table_rows<'a>(
    node: &'a XmlNode,
    inherited_header: bool,
    output: &mut Vec<(&'a XmlNode, bool)>,
) {
    for child in node.child_nodes() {
        if child.is(NS_TABLE, "table-row") {
            output.push((child, inherited_header));
        } else if child.is(NS_TABLE, "table-header-rows") {
            collect_table_rows(child, true, output);
        } else if child.is(NS_TABLE, "table-rows") || child.is(NS_TABLE, "table-row-group") {
            collect_table_rows(child, inherited_header, output);
        }
    }
}

fn inline_content(
    node: &XmlNode,
    catalog: &StyleCatalog,
    assets: &mut AssetContext,
    inherited_marks: &[Value],
) -> CommandResult<Vec<Value>> {
    let mut output = Vec::new();
    for child in &node.children {
        match child {
            XmlChild::Text(text) => push_text(&mut output, text, inherited_marks),
            XmlChild::Node(child) if child.is(NS_TEXT, "span") => {
                let style = resolved_style(child.attr(NS_TEXT, "style-name"), catalog)?;
                let mut marks = inherited_marks.to_vec();
                marks.extend(marks_from_style(&style));
                output.extend(inline_content(child, catalog, assets, &marks)?);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "a") => {
                let mut marks = inherited_marks.to_vec();
                if let Some(href) = child.attr(NS_XLINK, "href")
                    && (href.starts_with('#')
                        || href.starts_with("http://")
                        || href.starts_with("https://")
                        || href.starts_with("mailto:"))
                {
                    marks.push(json!({ "type": "link", "attrs": { "href": href } }));
                }
                output.extend(inline_content(child, catalog, assets, &marks)?);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "line-break") => {
                output.push(json!({ "type": "hardBreak" }));
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "tab") => {
                push_text(&mut output, "\t", inherited_marks);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "s") => {
                let count = child
                    .attr(NS_TEXT, "c")
                    .and_then(|value| value.parse::<usize>().ok())
                    .unwrap_or(1)
                    .min(1_000);
                push_text(&mut output, &" ".repeat(count), inherited_marks);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "page-number") => {
                push_text(&mut output, "{page}", inherited_marks);
            }
            XmlChild::Node(child) if child.is(NS_TEXT, "page-count") => {
                push_text(&mut output, "{total}", inherited_marks);
            }
            XmlChild::Node(child) if child.is(NS_DRAW, "frame") => {
                let image = frame_to_image(child, assets)?;
                let label = image
                    .pointer("/attrs/alt")
                    .and_then(Value::as_str)
                    .unwrap_or("Image");
                assets.warnings.push(EditorCompatibilityWarning {
                    code: "mixedInlineImage".to_string(),
                    message: "Une image mélangée à du texte a été conservée comme repère explicite. Enregistrer sous est obligatoire pour protéger l’original.".to_string(),
                    blocks_overwrite: true,
                });
                push_text(&mut output, &format!("[{label}]"), inherited_marks);
            }
            XmlChild::Node(child)
                if child.namespace == NS_DRAW
                    && matches!(child.name.as_str(), "object" | "object-ole" | "plugin") =>
            {
                assets.warnings.push(unsupported_warning());
                output.push(json!({
                    "type": "unsupportedObject",
                    "attrs": { "label": "Objet incorporé non éditable" }
                }));
            }
            XmlChild::Node(child) => {
                output.extend(inline_content(child, catalog, assets, inherited_marks)?);
            }
        }
    }
    Ok(output)
}

fn push_text(output: &mut Vec<Value>, text: &str, marks: &[Value]) {
    if text.is_empty() {
        return;
    }
    let mut node = Map::new();
    node.insert("type".to_string(), json!("text"));
    node.insert("text".to_string(), json!(text));
    if !marks.is_empty() {
        node.insert("marks".to_string(), Value::Array(marks.to_vec()));
    }
    output.push(Value::Object(node));
}

fn resolved_style(name: Option<&str>, catalog: &StyleCatalog) -> CommandResult<StyleInfo> {
    let Some(name) = name else {
        return Ok(StyleInfo::default());
    };
    let mut visited = HashSet::new();
    resolve_style_recursive(name, catalog, &mut visited, 0)
}

fn resolve_style_recursive(
    name: &str,
    catalog: &StyleCatalog,
    visited: &mut HashSet<String>,
    depth: usize,
) -> CommandResult<StyleInfo> {
    if depth >= MAX_XML_DEPTH || !visited.insert(name.to_string()) {
        return Err("ODT_STYLE_CYCLE:Cycle détecté dans les styles ODT.".to_string());
    }
    let Some(style) = catalog.styles.get(name) else {
        visited.remove(name);
        return Ok(StyleInfo::default());
    };
    let mut resolved = if let Some(parent) = style.parent.as_deref() {
        resolve_style_recursive(parent, catalog, visited, depth + 1)?
    } else {
        StyleInfo::default()
    };
    resolved.family = style.family.clone();
    resolved.text.extend(style.text.clone());
    resolved.paragraph.extend(style.paragraph.clone());
    visited.remove(name);
    Ok(resolved)
}

fn marks_from_style(style: &StyleInfo) -> Vec<Value> {
    let mut marks = Vec::new();
    if style.text.get("font-weight").is_some_and(|value| {
        value == "bold" || value.parse::<u16>().is_ok_and(|weight| weight >= 600)
    }) {
        marks.push(json!({ "type": "bold" }));
    }
    if style
        .text
        .get("font-style")
        .is_some_and(|value| value == "italic")
    {
        marks.push(json!({ "type": "italic" }));
    }
    if style
        .text
        .get("text-underline-style")
        .is_some_and(|value| value != "none")
    {
        marks.push(json!({ "type": "underline" }));
    }
    if style
        .text
        .get("text-line-through-style")
        .is_some_and(|value| value != "none")
    {
        marks.push(json!({ "type": "strike" }));
    }
    let mut attrs = Map::new();
    if let Some(value) = style.text.get("color") {
        attrs.insert("color".to_string(), json!(value));
    }
    if let Some(value) = style.text.get("font-size") {
        attrs.insert("fontSize".to_string(), json!(value));
    }
    if let Some(value) = style.text.get("font-name") {
        attrs.insert("fontFamily".to_string(), json!(value));
    }
    if !attrs.is_empty() {
        marks.push(json!({ "type": "textStyle", "attrs": attrs }));
    }
    if let Some(value) = style.text.get("background-color")
        && value != "transparent"
    {
        marks.push(json!({ "type": "highlight", "attrs": { "color": value } }));
    }
    marks
}

fn normalize_alignment(value: &str) -> &str {
    match value {
        "start" => "left",
        "end" => "right",
        other => other,
    }
}

fn frame_to_image(node: &XmlNode, assets: &mut AssetContext) -> CommandResult<Value> {
    if node.child_nodes().any(|child| {
        child.namespace == NS_DRAW
            && matches!(child.name.as_str(), "object" | "object-ole" | "plugin")
    }) {
        assets.warnings.push(unsupported_warning());
        return Ok(json!({
            "type": "unsupportedObject",
            "attrs": { "label": "Objet incorporé non éditable" }
        }));
    }
    let image = node
        .child_nodes()
        .find(|child| child.is(NS_DRAW, "image"))
        .ok_or_else(|| "ODT_ASSET_INVALID:Image ODT sans contenu.".to_string())?;
    let href = image
        .attr(NS_XLINK, "href")
        .ok_or_else(|| "ODT_ASSET_INVALID:Chemin d’image ODT manquant.".to_string())?;
    let path = normalize_package_path(href)?;
    let asset = if let Some(asset) = assets.imported.get(&path) {
        asset.clone()
    } else {
        let (mime_type, bytes) =
            assets.package_assets.get(&path).cloned().ok_or_else(|| {
                "ODT_ASSET_INVALID:Image ODT référencée mais absente.".to_string()
            })?;
        if !is_supported_image_mime(&mime_type) {
            assets.warnings.push(EditorCompatibilityWarning {
                code: "unsupportedImageFormat".to_string(),
                message: format!("Une image {mime_type} ne peut pas être éditée directement. Elle a été remplacée par un bloc explicite."),
                blocks_overwrite: true,
            });
            return Ok(json!({
                "type": "unsupportedObject",
                "attrs": { "label": format!("Image {mime_type} non éditable") }
            }));
        }
        let name = Path::new(&path)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("image");
        let (asset, bytes) = make_asset(name, &mime_type, bytes)?;
        assets.imported.insert(path, asset.clone());
        assets.assets.push((asset.clone(), bytes));
        asset
    };
    let width = node
        .attr(NS_SVG, "width")
        .map(str::to_string)
        .unwrap_or_else(|| "auto".to_string());
    Ok(json!({
        "type": "image",
        "attrs": {
            "assetId": asset.id,
            "src": format!("mc-asset://{}", asset.id),
            "alt": node.attr(NS_DRAW, "name").unwrap_or(&asset.name),
            "title": node.attr(NS_DRAW, "name").unwrap_or(&asset.name),
            "width": width,
            "align": "center"
        }
    }))
}

fn unsupported_warning() -> EditorCompatibilityWarning {
    EditorCompatibilityWarning {
        code: "unsupportedEmbeddedObject".to_string(),
        message: "Ce document contient un objet incorporé que l’éditeur ne peut pas réexporter fidèlement. Enregistrer sous est obligatoire pour protéger l’original.".to_string(),
        blocks_overwrite: true,
    }
}

// Writer implementation is kept in this module so reader and writer share the exact
// page, style, asset and placeholder rules.
pub(super) fn write_odt(document: &EditorDocument, output: &Path) -> CommandResult<()> {
    write_odt_with_assets(document, output, |asset| {
        let source = asset_file_for_export(&document.id, asset)?;
        fs::read(source).map_err(|error| error.to_string())
    })
}

fn write_odt_with_assets(
    document: &EditorDocument,
    output: &Path,
    mut read_asset: impl FnMut(&EditorAssetRef) -> CommandResult<Vec<u8>>,
) -> CommandResult<()> {
    let content_xml = build_content_xml(document)?;
    let styles_xml = build_styles_xml(document)?;
    let manifest_xml = build_manifest_xml(document);
    let meta_xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><office:document-meta xmlns:office=\"{NS_OFFICE}\" office:version=\"1.3\"><office:meta/></office:document-meta>"
    );
    let file = fs::File::create(output).map_err(|error| error.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("mimetype", stored)
        .map_err(|error| error.to_string())?;
    zip.write_all(b"application/vnd.oasis.opendocument.text")
        .map_err(|error| error.to_string())?;
    for (name, contents) in [
        ("content.xml", content_xml.as_bytes()),
        ("styles.xml", styles_xml.as_bytes()),
        ("meta.xml", meta_xml.as_bytes()),
        ("META-INF/manifest.xml", manifest_xml.as_bytes()),
    ] {
        zip.start_file(name, deflated)
            .map_err(|error| error.to_string())?;
        zip.write_all(contents).map_err(|error| error.to_string())?;
    }
    for asset in &document.assets {
        let bytes = read_asset(asset)?;
        if bytes.len() as u64 != asset.size {
            return Err("EDITOR_ASSET_INVALID:Une image locale est incomplète.".to_string());
        }
        let path = odt_asset_path(asset);
        zip.start_file(path, deflated)
            .map_err(|error| error.to_string())?;
        zip.write_all(&bytes).map_err(|error| error.to_string())?;
    }
    zip.finish().map_err(|error| error.to_string())?;
    Ok(())
}

fn build_content_xml(document: &EditorDocument) -> CommandResult<String> {
    let writer_styles = writer_style_catalog(document);
    let body = render_odt_blocks(&document.content, document, &writer_styles)?;
    Ok(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><office:document-content xmlns:office=\"{NS_OFFICE}\" xmlns:text=\"{NS_TEXT}\" xmlns:style=\"{NS_STYLE}\" xmlns:table=\"{NS_TABLE}\" xmlns:draw=\"{NS_DRAW}\" xmlns:xlink=\"{NS_XLINK}\" xmlns:fo=\"{NS_FO}\" xmlns:svg=\"{NS_SVG}\" office:version=\"1.3\"><office:automatic-styles>{}</office:automatic-styles><office:body><office:text>{body}</office:text></office:body></office:document-content>",
        automatic_styles(&writer_styles)
    ))
}

fn build_styles_xml(document: &EditorDocument) -> CommandResult<String> {
    let writer_styles = writer_style_catalog(document);
    let (width, height) = page_dimensions_mm(&document.page);
    let header = document
        .header
        .as_ref()
        .map(|value| render_odt_blocks(value, document, &writer_styles))
        .transpose()?
        .unwrap_or_default();
    let mut footer = document
        .footer
        .as_ref()
        .map(|value| render_odt_blocks(value, document, &writer_styles))
        .transpose()?
        .unwrap_or_default();
    if document.page.numbering != "none" && !contains_page_placeholder(document.footer.as_ref()) {
        let align_style = if document.page.numbering == "bottom-right" {
            "Right"
        } else {
            "Center"
        };
        footer.push_str(&format!("<text:p text:style-name=\"{align_style}\"><text:page-number text:select-page=\"current\">1</text:page-number></text:p>"));
    }
    Ok(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><office:document-styles xmlns:office=\"{NS_OFFICE}\" xmlns:text=\"{NS_TEXT}\" xmlns:style=\"{NS_STYLE}\" xmlns:fo=\"{NS_FO}\" xmlns:svg=\"{NS_SVG}\" xmlns:draw=\"{NS_DRAW}\" xmlns:xlink=\"{NS_XLINK}\" xmlns:table=\"{NS_TABLE}\" office:version=\"1.3\"><office:styles>{}</office:styles><office:automatic-styles><style:page-layout style:name=\"PageLayout\"><style:page-layout-properties fo:page-width=\"{width}mm\" fo:page-height=\"{height}mm\" style:print-orientation=\"{}\" fo:margin-top=\"{}mm\" fo:margin-right=\"{}mm\" fo:margin-bottom=\"{}mm\" fo:margin-left=\"{}mm\"/><style:header-style><style:header-footer-properties fo:min-height=\"5mm\" fo:margin-left=\"0mm\" fo:margin-right=\"0mm\" fo:margin-bottom=\"4mm\" style:dynamic-spacing=\"true\"/></style:header-style><style:footer-style><style:header-footer-properties fo:min-height=\"5mm\" fo:margin-left=\"0mm\" fo:margin-right=\"0mm\" fo:margin-top=\"4mm\" style:dynamic-spacing=\"true\"/></style:footer-style></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name=\"Standard\" style:page-layout-name=\"PageLayout\"><style:header>{header}</style:header><style:footer>{footer}</style:footer></style:master-page></office:master-styles></office:document-styles>",
        named_styles(&writer_styles),
        document.page.orientation,
        document.page.margins_mm.top,
        document.page.margins_mm.right,
        document.page.margins_mm.bottom,
        document.page.margins_mm.left,
    ))
}

fn automatic_styles(styles: &WriterStyleCatalog) -> String {
    format!(
        "<style:style style:name=\"PageBreak\" style:family=\"paragraph\" style:parent-style-name=\"Standard\"><style:paragraph-properties fo:break-before=\"page\"/></style:style><style:style style:name=\"Center\" style:family=\"paragraph\"><style:paragraph-properties fo:text-align=\"center\"/></style:style><style:style style:name=\"Right\" style:family=\"paragraph\"><style:paragraph-properties fo:text-align=\"right\"/></style:style><text:list-style style:name=\"BulletList\"><text:list-level-style-bullet text:level=\"1\" text:bullet-char=\"•\"/></text:list-style><text:list-style style:name=\"NumberList\"><text:list-level-style-number text:level=\"1\" style:num-format=\"1\"/></text:list-style>{}",
        styles.declarations
    )
}

fn named_styles(styles: &WriterStyleCatalog) -> String {
    format!(
        "<style:default-style style:family=\"paragraph\"><style:text-properties style:font-name=\"Arial\" fo:font-size=\"11pt\"/></style:default-style><style:style style:name=\"Standard\" style:family=\"paragraph\" style:class=\"text\"/><style:style style:name=\"Center\" style:family=\"paragraph\" style:parent-style-name=\"Standard\"><style:paragraph-properties fo:text-align=\"center\"/></style:style><style:style style:name=\"Right\" style:family=\"paragraph\" style:parent-style-name=\"Standard\"><style:paragraph-properties fo:text-align=\"right\"/></style:style>{}",
        styles.declarations
    )
}

fn writer_style_catalog(document: &EditorDocument) -> WriterStyleCatalog {
    let mut keys = HashMap::<String, Vec<Value>>::new();
    fn visit(value: &Value, keys: &mut HashMap<String, Vec<Value>>) {
        if value.get("type").and_then(Value::as_str) == Some("text")
            && let Some(marks) = value.get("marks").and_then(Value::as_array)
            && let Some(key) = style_key_from_marks(Some(marks))
        {
            keys.entry(key).or_insert_with(|| marks.clone());
        }
        for child in value
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            visit(child, keys);
        }
    }
    visit(&document.content, &mut keys);
    if let Some(header) = &document.header {
        visit(header, &mut keys);
    }
    if let Some(footer) = &document.footer {
        visit(footer, &mut keys);
    }

    let mut catalog = WriterStyleCatalog::default();
    let mut sorted = keys.into_iter().collect::<Vec<_>>();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    for (key, marks) in sorted {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        key.hash(&mut hasher);
        let name = format!("T{:x}", hasher.finish());
        let properties = odt_text_properties(&marks);
        if properties.is_empty() {
            continue;
        }
        catalog.declarations.push_str(&format!(
            "<style:style style:name=\"{}\" style:family=\"text\"><style:text-properties {properties}/></style:style>",
            xml_escape(&name)
        ));
        catalog.names.insert(key, name);
    }
    catalog
}

fn style_key_from_marks(marks: Option<&Vec<Value>>) -> Option<String> {
    let mut parts = marks
        .into_iter()
        .flatten()
        .filter_map(|mark| {
            let kind = mark.get("type").and_then(Value::as_str)?;
            if !matches!(
                kind,
                "bold" | "italic" | "underline" | "strike" | "textStyle" | "highlight"
            ) {
                return None;
            }
            Some(format!(
                "{}:{}",
                kind,
                mark.get("attrs").cloned().unwrap_or(Value::Null)
            ))
        })
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return None;
    }
    parts.sort();
    Some(parts.join("|"))
}

fn odt_text_properties(marks: &[Value]) -> String {
    let mut properties = Vec::new();
    for mark in marks {
        match mark.get("type").and_then(Value::as_str).unwrap_or_default() {
            "bold" => properties.push("fo:font-weight=\"bold\"".to_string()),
            "italic" => properties.push("fo:font-style=\"italic\"".to_string()),
            "underline" => properties.push(
                "style:text-underline-style=\"solid\" style:text-underline-width=\"auto\""
                    .to_string(),
            ),
            "strike" => properties.push("style:text-line-through-style=\"solid\"".to_string()),
            "textStyle" => {
                if let Some(font) = mark.pointer("/attrs/fontFamily").and_then(Value::as_str) {
                    properties.push(format!("style:font-name=\"{}\"", xml_escape(font)));
                }
                if let Some(size) = mark
                    .pointer("/attrs/fontSize")
                    .and_then(Value::as_str)
                    .filter(|value| valid_style_measure(value))
                {
                    properties.push(format!("fo:font-size=\"{}\"", xml_escape(size)));
                }
                if let Some(color) = mark
                    .pointer("/attrs/color")
                    .and_then(Value::as_str)
                    .filter(|value| valid_color(value))
                {
                    properties.push(format!("fo:color=\"{}\"", xml_escape(color)));
                }
            }
            "highlight" => {
                if let Some(color) = mark
                    .pointer("/attrs/color")
                    .and_then(Value::as_str)
                    .filter(|value| valid_color(value))
                {
                    properties.push(format!("fo:background-color=\"{}\"", xml_escape(color)));
                }
            }
            _ => {}
        }
    }
    properties.join(" ")
}

fn valid_style_measure(value: &str) -> bool {
    value.len() <= 16
        && value.chars().all(|character| {
            character.is_ascii_digit()
                || matches!(character, '.' | '%' | 'p' | 't' | 'x' | 'e' | 'm')
        })
}

fn valid_color(value: &str) -> bool {
    value.len() <= 32
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(character, '#' | '(' | ')' | ',' | '.' | '%' | ' ' | '-')
        })
}

fn build_manifest_xml(document: &EditorDocument) -> String {
    let mut entries = String::from(
        "<manifest:file-entry manifest:full-path=\"/\" manifest:media-type=\"application/vnd.oasis.opendocument.text\"/><manifest:file-entry manifest:full-path=\"content.xml\" manifest:media-type=\"text/xml\"/><manifest:file-entry manifest:full-path=\"styles.xml\" manifest:media-type=\"text/xml\"/><manifest:file-entry manifest:full-path=\"meta.xml\" manifest:media-type=\"text/xml\"/>",
    );
    for asset in &document.assets {
        entries.push_str(&format!(
            "<manifest:file-entry manifest:full-path=\"{}\" manifest:media-type=\"{}\"/>",
            xml_escape(&odt_asset_path(asset)),
            xml_escape(&asset.mime_type)
        ));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><manifest:manifest xmlns:manifest=\"{NS_MANIFEST}\" manifest:version=\"1.3\">{entries}</manifest:manifest>"
    )
}

fn odt_asset_path(asset: &EditorAssetRef) -> String {
    format!(
        "Pictures/{}.{}",
        asset.id,
        extension_for_mime(&asset.mime_type)
    )
}

fn render_odt_blocks(
    value: &Value,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
) -> CommandResult<String> {
    let nodes = if value.get("type").and_then(Value::as_str) == Some("doc") {
        value
            .get("content")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    } else {
        std::slice::from_ref(value)
    };
    let mut output = String::new();
    for node in nodes {
        render_odt_block(node, document, styles, &mut output)?;
    }
    Ok(output)
}

fn render_odt_block(
    node: &Value,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
    output: &mut String,
) -> CommandResult<()> {
    let node_type = node.get("type").and_then(Value::as_str).unwrap_or_default();
    match node_type {
        "paragraph" | "heading" => {
            let tag = if node_type == "heading" {
                "text:h"
            } else {
                "text:p"
            };
            let align = node
                .pointer("/attrs/textAlign")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let style = match align {
                "center" => "Center",
                "right" => "Right",
                _ => "Standard",
            };
            output.push_str(&format!("<{tag} text:style-name=\"{style}\""));
            if node_type == "heading" {
                let level = node
                    .pointer("/attrs/level")
                    .and_then(Value::as_u64)
                    .unwrap_or(1)
                    .clamp(1, 6);
                output.push_str(&format!(" text:outline-level=\"{level}\""));
            }
            output.push('>');
            render_odt_inline_nodes(
                node.get("content").and_then(Value::as_array),
                document,
                styles,
                output,
            )?;
            output.push_str(&format!("</{tag}>"));
        }
        "bulletList" | "orderedList" => {
            let style = if node_type == "orderedList" {
                "NumberList"
            } else {
                "BulletList"
            };
            output.push_str(&format!("<text:list text:style-name=\"{style}\">"));
            for item in node
                .get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                output.push_str("<text:list-item>");
                for block in item
                    .get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    render_odt_block(block, document, styles, output)?;
                }
                output.push_str("</text:list-item>");
            }
            output.push_str("</text:list>");
        }
        "blockquote" => {
            for block in node
                .get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                render_odt_block(block, document, styles, output)?;
            }
        }
        "table" => {
            output.push_str("<table:table table:name=\"Table1\">");
            let rows = node
                .get("content")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default();
            let column_count = rows
                .iter()
                .map(|row| {
                    row.get("content")
                        .and_then(Value::as_array)
                        .map(|cells| {
                            cells
                                .iter()
                                .map(|cell| {
                                    cell.pointer("/attrs/colspan")
                                        .and_then(Value::as_u64)
                                        .unwrap_or(1) as usize
                                })
                                .sum::<usize>()
                        })
                        .unwrap_or_default()
                })
                .max()
                .unwrap_or(0);
            if column_count > 0 {
                output.push_str(&format!(
                    "<table:table-column table:number-columns-repeated=\"{column_count}\"/>"
                ));
            }
            for row in rows {
                output.push_str("<table:table-row>");
                for cell in row
                    .get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    let colspan = cell
                        .pointer("/attrs/colspan")
                        .and_then(Value::as_u64)
                        .unwrap_or(1);
                    let rowspan = cell
                        .pointer("/attrs/rowspan")
                        .and_then(Value::as_u64)
                        .unwrap_or(1);
                    output.push_str("<table:table-cell");
                    if colspan > 1 {
                        output.push_str(&format!(" table:number-columns-spanned=\"{colspan}\""));
                    }
                    if rowspan > 1 {
                        output.push_str(&format!(" table:number-rows-spanned=\"{rowspan}\""));
                    }
                    output.push('>');
                    for block in cell
                        .get("content")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                    {
                        render_odt_block(block, document, styles, output)?;
                    }
                    output.push_str("</table:table-cell>");
                }
                output.push_str("</table:table-row>");
            }
            output.push_str("</table:table>");
        }
        "image" | "documentImage" => {
            output.push_str("<text:p>");
            render_odt_image(node, document, output)?;
            output.push_str("</text:p>");
        }
        "pageBreak" => output.push_str("<text:p text:style-name=\"PageBreak\"/>"),
        "horizontalRule" => output.push_str("<text:p>────────────────</text:p>"),
        "unsupportedObject" => output.push_str("<text:p>[Objet incorporé non éditable]</text:p>"),
        _ => {
            for child in node
                .get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                render_odt_block(child, document, styles, output)?;
            }
        }
    }
    Ok(())
}

fn render_odt_inline_nodes(
    nodes: Option<&Vec<Value>>,
    document: &EditorDocument,
    styles: &WriterStyleCatalog,
    output: &mut String,
) -> CommandResult<()> {
    for node in nodes.into_iter().flatten() {
        let node_type = node.get("type").and_then(Value::as_str).unwrap_or_default();
        match node_type {
            "text" => render_odt_text(node, styles, output),
            "hardBreak" => output.push_str("<text:line-break/>"),
            "image" | "documentImage" => render_odt_image(node, document, output)?,
            "pageBreak" => output.push_str("<text:line-break/>"),
            "unsupportedObject" => output.push_str("[Objet incorporé non éditable]"),
            _ => {}
        }
    }
    Ok(())
}

fn render_odt_text(node: &Value, styles: &WriterStyleCatalog, output: &mut String) {
    let text = node.get("text").and_then(Value::as_str).unwrap_or_default();
    let marks = node.get("marks").and_then(Value::as_array);
    let link = marks
        .into_iter()
        .flatten()
        .find(|mark| mark.get("type").and_then(Value::as_str) == Some("link"));
    let style_name = style_key_from_marks(marks).and_then(|key| styles.names.get(&key));
    if let Some(link) = link
        && let Some(href) = link.pointer("/attrs/href").and_then(Value::as_str)
    {
        output.push_str(&format!("<text:a xlink:href=\"{}\">", xml_escape(href)));
    }
    if let Some(style_name) = style_name {
        output.push_str(&format!(
            "<text:span text:style-name=\"{}\">",
            xml_escape(style_name)
        ));
    }
    render_text_with_page_fields(text, output);
    if style_name.is_some() {
        output.push_str("</text:span>");
    }
    if link.is_some() {
        output.push_str("</text:a>");
    }
}

fn render_text_with_page_fields(text: &str, output: &mut String) {
    let mut remaining = text;
    while let Some(index) = remaining.find(['{']) {
        output.push_str(&xml_escape(&remaining[..index]));
        let tail = &remaining[index..];
        if let Some(rest) = tail.strip_prefix("{page}") {
            output.push_str("<text:page-number text:select-page=\"current\">1</text:page-number>");
            remaining = rest;
        } else if let Some(rest) = tail.strip_prefix("{total}") {
            output.push_str("<text:page-count>1</text:page-count>");
            remaining = rest;
        } else {
            output.push('{');
            remaining = &tail[1..];
        }
    }
    output.push_str(&xml_escape(remaining));
}

fn render_odt_image(
    node: &Value,
    document: &EditorDocument,
    output: &mut String,
) -> CommandResult<()> {
    let asset_id = node
        .pointer("/attrs/assetId")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            "EDITOR_ASSET_INVALID:Identifiant d’image manquant pendant l’export.".to_string()
        })?;
    let asset = document
        .assets
        .iter()
        .find(|asset| asset.id == asset_id)
        .ok_or_else(|| "EDITOR_ASSET_MISSING:Image introuvable pendant l’export.".to_string())?;
    let width = node
        .pointer("/attrs/width")
        .and_then(Value::as_str)
        .filter(|value| value.ends_with("cm") || value.ends_with("mm") || value.ends_with("in"))
        .unwrap_or("15cm");
    let title = node
        .pointer("/attrs/title")
        .and_then(Value::as_str)
        .unwrap_or(&asset.name);
    let height = image_height_for_width(width, asset);
    output.push_str(&format!(
        "<draw:frame draw:name=\"{}\" text:anchor-type=\"as-char\" svg:width=\"{}\" svg:height=\"{}\"><draw:image xlink:href=\"{}\" xlink:type=\"simple\" xlink:show=\"embed\" xlink:actuate=\"onLoad\"/></draw:frame>",
        xml_escape(title),
        xml_escape(width),
        xml_escape(&height),
        xml_escape(&odt_asset_path(asset))
    ));
    Ok(())
}

fn image_height_for_width(width: &str, asset: &EditorAssetRef) -> String {
    let Some(width_cm) = width
        .strip_suffix("cm")
        .and_then(|value| value.parse::<f32>().ok())
    else {
        return "10cm".to_string();
    };
    let ratio = match (asset.width, asset.height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => height as f32 / width as f32,
        _ => 2.0 / 3.0,
    };
    format!("{:.3}cm", (width_cm * ratio).clamp(0.1, 100.0))
}

fn page_dimensions_mm(page: &EditorPageSettings) -> (f32, f32) {
    let (width, height) = match page.format.as_str() {
        "a3" => (297.0, 420.0),
        "a5" => (148.0, 210.0),
        "letter" => (215.9, 279.4),
        "legal" => (215.9, 355.6),
        _ => (210.0, 297.0),
    };
    if page.orientation == "landscape" {
        (height, width)
    } else {
        (width, height)
    }
}

fn contains_page_placeholder(value: Option<&Value>) -> bool {
    fn visit(value: &Value) -> bool {
        if value
            .get("text")
            .and_then(Value::as_str)
            .is_some_and(|text| text.contains("{page}"))
        {
            return true;
        }
        value
            .get("content")
            .and_then(Value::as_array)
            .is_some_and(|children| children.iter().any(visit))
    }
    value.is_some_and(visit)
}

pub(super) fn render_html_document(document: &EditorDocument) -> CommandResult<String> {
    let header = document
        .header
        .as_ref()
        .map(|value| render_html_blocks(value, document))
        .transpose()?
        .unwrap_or_default();
    let body = render_html_blocks(&document.content, document)?;
    let footer = document
        .footer
        .as_ref()
        .map(|value| render_html_blocks(value, document))
        .transpose()?
        .unwrap_or_default();
    let (width, height) = page_dimensions_mm(&document.page);
    Ok(format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><style>@page{{size:{width}mm {height}mm;margin:{}mm {}mm {}mm {}mm}}body{{font-family:Arial,sans-serif;line-height:1.45}}header,footer{{color:#465148}}img{{max-width:100%}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #999;padding:4px}}</style></head><body><header>{header}</header><main>{body}</main><footer>{footer}</footer></body></html>",
        document.page.margins_mm.top,
        document.page.margins_mm.right,
        document.page.margins_mm.bottom,
        document.page.margins_mm.left,
    ))
}

fn render_html_blocks(value: &Value, document: &EditorDocument) -> CommandResult<String> {
    let mut output = String::new();
    let nodes = value
        .get("content")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    for node in nodes {
        render_html_node(node, document, &mut output)?;
    }
    Ok(output)
}

fn render_html_node(
    node: &Value,
    document: &EditorDocument,
    output: &mut String,
) -> CommandResult<()> {
    let kind = node.get("type").and_then(Value::as_str).unwrap_or_default();
    let (open, close) = match kind {
        "paragraph" => ("<p>".to_string(), "</p>"),
        "heading" => {
            let level = node
                .pointer("/attrs/level")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 6);
            (
                format!("<h{level}>"),
                if level == 1 {
                    "</h1>"
                } else if level == 2 {
                    "</h2>"
                } else if level == 3 {
                    "</h3>"
                } else if level == 4 {
                    "</h4>"
                } else if level == 5 {
                    "</h5>"
                } else {
                    "</h6>"
                },
            )
        }
        "bulletList" => ("<ul>".to_string(), "</ul>"),
        "orderedList" => ("<ol>".to_string(), "</ol>"),
        "listItem" => ("<li>".to_string(), "</li>"),
        "blockquote" => ("<blockquote>".to_string(), "</blockquote>"),
        "table" => ("<table>".to_string(), "</table>"),
        "tableRow" => ("<tr>".to_string(), "</tr>"),
        "tableCell" | "tableHeader" => ("<td>".to_string(), "</td>"),
        "horizontalRule" => {
            output.push_str("<hr>");
            return Ok(());
        }
        "hardBreak" => {
            output.push_str("<br>");
            return Ok(());
        }
        "pageBreak" => {
            output.push_str("<div style=\"break-before:page\"></div>");
            return Ok(());
        }
        "image" | "documentImage" => {
            render_html_image(node, document, output)?;
            return Ok(());
        }
        "text" => {
            render_html_text(node, output);
            return Ok(());
        }
        "unsupportedObject" => {
            output.push_str("<aside>[Objet incorporé non éditable]</aside>");
            return Ok(());
        }
        _ => (String::new(), ""),
    };
    output.push_str(&open);
    for child in node
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        render_html_node(child, document, output)?;
    }
    output.push_str(close);
    Ok(())
}

fn render_html_text(node: &Value, output: &mut String) {
    let text = node.get("text").and_then(Value::as_str).unwrap_or_default();
    let marks = node.get("marks").and_then(Value::as_array);
    let mut closing = Vec::new();
    for mark in marks.into_iter().flatten() {
        match mark.get("type").and_then(Value::as_str).unwrap_or_default() {
            "bold" => {
                output.push_str("<strong>");
                closing.push("</strong>");
            }
            "italic" => {
                output.push_str("<em>");
                closing.push("</em>");
            }
            "underline" => {
                output.push_str("<u>");
                closing.push("</u>");
            }
            "strike" => {
                output.push_str("<s>");
                closing.push("</s>");
            }
            "link" => {
                if let Some(href) =
                    mark.pointer("/attrs/href")
                        .and_then(Value::as_str)
                        .filter(|href| {
                            href.starts_with('#')
                                || href.starts_with("http://")
                                || href.starts_with("https://")
                                || href.starts_with("mailto:")
                        })
                {
                    output.push_str(&format!("<a href=\"{}\">", xml_escape(href)));
                    closing.push("</a>");
                }
            }
            "textStyle" | "highlight" => {
                let mut css = Vec::new();
                if let Some(font) = mark.pointer("/attrs/fontFamily").and_then(Value::as_str) {
                    css.push(format!("font-family:{}", html_css_value(font)));
                }
                if let Some(size) = mark
                    .pointer("/attrs/fontSize")
                    .and_then(Value::as_str)
                    .filter(|value| valid_style_measure(value))
                {
                    css.push(format!("font-size:{size}"));
                }
                if let Some(color) = mark
                    .pointer("/attrs/color")
                    .and_then(Value::as_str)
                    .filter(|value| valid_color(value))
                {
                    let property = if mark.get("type").and_then(Value::as_str) == Some("highlight")
                    {
                        "background-color"
                    } else {
                        "color"
                    };
                    css.push(format!("{property}:{color}"));
                }
                if !css.is_empty() {
                    output.push_str(&format!("<span style=\"{}\">", xml_escape(&css.join(";"))));
                    closing.push("</span>");
                }
            }
            _ => {}
        }
    }
    output.push_str(&xml_escape(text));
    for tag in closing.into_iter().rev() {
        output.push_str(tag);
    }
}

fn html_css_value(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            character.is_alphanumeric() || matches!(character, ' ' | '-' | '_' | ',')
        })
        .take(120)
        .collect()
}

fn render_html_image(
    node: &Value,
    document: &EditorDocument,
    output: &mut String,
) -> CommandResult<()> {
    let id = node
        .pointer("/attrs/assetId")
        .and_then(Value::as_str)
        .ok_or_else(|| "EDITOR_ASSET_INVALID:Image sans identifiant.".to_string())?;
    let asset = document
        .assets
        .iter()
        .find(|asset| asset.id == id)
        .ok_or_else(|| "EDITOR_ASSET_MISSING:Image introuvable.".to_string())?;
    let bytes =
        fs::read(asset_file_for_export(&document.id, asset)?).map_err(|error| error.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let alt = node
        .pointer("/attrs/alt")
        .and_then(Value::as_str)
        .unwrap_or(&asset.name);
    output.push_str(&format!(
        "<img src=\"data:{};base64,{}\" alt=\"{}\">",
        asset.mime_type,
        encoded,
        xml_escape(alt)
    ));
    Ok(())
}

pub(super) fn render_plain_text(value: &Value) -> String {
    let mut output = String::new();
    fn visit(value: &Value, output: &mut String) {
        if let Some(text) = value.get("text").and_then(Value::as_str) {
            output.push_str(text);
        }
        if matches!(value.get("type").and_then(Value::as_str), Some("hardBreak")) {
            output.push('\n');
        }
        if matches!(
            value.get("type").and_then(Value::as_str),
            Some("image" | "documentImage")
        ) {
            let alt = value
                .pointer("/attrs/alt")
                .and_then(Value::as_str)
                .unwrap_or("Image");
            output.push_str(&format!("[{alt}]"));
        }
        for child in value
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            visit(child, output);
        }
        if matches!(
            value.get("type").and_then(Value::as_str),
            Some("paragraph" | "heading" | "listItem" | "tableRow")
        ) {
            output.push('\n');
        }
    }
    visit(value, &mut output);
    output.trim_end().to_string()
}

pub(super) fn render_markdown(value: &Value) -> String {
    fn inline(node: &Value) -> String {
        let kind = node.get("type").and_then(Value::as_str).unwrap_or_default();
        if kind == "text" {
            let mut text = node
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .replace('\\', "\\\\")
                .replace('*', "\\*")
                .replace('_', "\\_");
            for mark in node
                .get("marks")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                match mark.get("type").and_then(Value::as_str).unwrap_or_default() {
                    "bold" => text = format!("**{text}**"),
                    "italic" => text = format!("*{text}*"),
                    "strike" => text = format!("~~{text}~~"),
                    "link" => {
                        if let Some(href) = mark.pointer("/attrs/href").and_then(Value::as_str) {
                            text = format!("[{text}]({href})");
                        }
                    }
                    _ => {}
                }
            }
            return text;
        }
        if kind == "hardBreak" {
            return "  \n".to_string();
        }
        if matches!(kind, "image" | "documentImage") {
            let alt = node
                .pointer("/attrs/alt")
                .and_then(Value::as_str)
                .unwrap_or("Image");
            return format!("[{alt}]");
        }
        node.get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(inline)
            .collect()
    }

    fn block(node: &Value, indent: usize) -> String {
        let kind = node.get("type").and_then(Value::as_str).unwrap_or_default();
        let children = node.get("content").and_then(Value::as_array);
        match kind {
            "doc" => children
                .into_iter()
                .flatten()
                .map(|child| block(child, indent))
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n"),
            "heading" => format!(
                "{} {}",
                "#".repeat(
                    node.pointer("/attrs/level")
                        .and_then(Value::as_u64)
                        .unwrap_or(1)
                        .clamp(1, 6) as usize
                ),
                children
                    .into_iter()
                    .flatten()
                    .map(inline)
                    .collect::<String>()
            ),
            "paragraph" => children.into_iter().flatten().map(inline).collect(),
            "bulletList" | "orderedList" => children
                .into_iter()
                .flatten()
                .enumerate()
                .map(|(index, item)| {
                    let marker = if kind == "orderedList" {
                        format!("{}. ", index + 1)
                    } else {
                        "- ".to_string()
                    };
                    format!(
                        "{}{}{}",
                        "  ".repeat(indent),
                        marker,
                        block(item, indent + 1).replace('\n', "\n  ")
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"),
            "listItem" | "blockquote" => children
                .into_iter()
                .flatten()
                .map(|child| block(child, indent))
                .collect::<Vec<_>>()
                .join("\n"),
            "pageBreak" | "horizontalRule" => "---".to_string(),
            "image" | "documentImage" => inline(node),
            "unsupportedObject" => "[Objet incorporé non éditable]".to_string(),
            _ => children
                .into_iter()
                .flatten()
                .map(|child| block(child, indent))
                .collect::<Vec<_>>()
                .join("\n"),
        }
    }

    block(value, 0)
}

fn xml_escape(value: &str) -> String {
    html_escape::encode_safe(value).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::editor::document::new_document;
    use std::io::Cursor;

    #[test]
    fn xml_parser_rejects_doctype_and_deep_documents() {
        assert!(
            parse_xml(b"<!DOCTYPE doc><doc/>")
                .unwrap_err()
                .starts_with("ODT_XML_FORBIDDEN")
        );
        let mut xml = String::new();
        for _ in 0..130 {
            xml.push_str("<a>");
        }
        for _ in 0..130 {
            xml.push_str("</a>");
        }
        assert!(
            parse_xml(xml.as_bytes())
                .unwrap_err()
                .starts_with("ODT_XML_LIMIT")
        );
        assert!(
            parse_xml(b"<doc>&external;</doc>")
                .unwrap_err()
                .starts_with("ODT_XML_FORBIDDEN")
        );
    }

    #[test]
    fn manifest_rejects_encrypted_documents() {
        let manifest = parse_xml(
            format!(
                "<manifest:manifest xmlns:manifest=\"{NS_MANIFEST}\"><manifest:file-entry manifest:full-path=\"content.xml\"><manifest:encryption-data/></manifest:file-entry></manifest:manifest>"
            )
            .as_bytes(),
        )
        .unwrap();
        assert!(
            ensure_manifest_is_safe(&manifest)
                .unwrap_err()
                .starts_with("ODT_ENCRYPTED")
        );
    }

    #[test]
    fn archive_rejects_parent_traversal_entries() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("unsafe.odt");
        let file = fs::File::create(&path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        let stored =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        writer.start_file("mimetype", stored).unwrap();
        writer
            .write_all(b"application/vnd.oasis.opendocument.text")
            .unwrap();
        writer.start_file("../content.xml", stored).unwrap();
        writer.write_all(b"<doc/>").unwrap();
        writer.finish().unwrap();

        let file = fs::File::open(path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert!(
            validate_archive(&mut archive)
                .unwrap_err()
                .starts_with("ODT_PATH_TRAVERSAL")
        );
    }

    #[test]
    fn style_resolution_rejects_inheritance_cycles() {
        let mut catalog = StyleCatalog::default();
        catalog.styles.insert(
            "A".to_string(),
            StyleInfo {
                parent: Some("B".to_string()),
                ..StyleInfo::default()
            },
        );
        catalog.styles.insert(
            "B".to_string(),
            StyleInfo {
                parent: Some("A".to_string()),
                ..StyleInfo::default()
            },
        );
        assert!(
            resolved_style(Some("A"), &catalog)
                .unwrap_err()
                .starts_with("ODT_STYLE_CYCLE")
        );
    }

    #[test]
    fn xml_parser_resolves_renamed_namespaces() {
        let root = parse_xml(format!("<x:document-content xmlns:x=\"{NS_OFFICE}\"><y:p xmlns:y=\"{NS_TEXT}\">Bonjour</y:p></x:document-content>").as_bytes()).unwrap();
        assert!(root.is(NS_OFFICE, "document-content"));
        assert!(root.child_nodes().next().unwrap().is(NS_TEXT, "p"));
    }

    #[test]
    fn page_placeholders_become_odf_fields() {
        let mut output = String::new();
        render_text_with_page_fields("Page {page}/{total}", &mut output);
        assert!(output.contains("text:page-number"));
        assert!(output.contains("text:page-count"));
    }

    #[test]
    fn generated_tables_declare_every_column_and_page_breaks_keep_the_master_page() {
        let mut document = new_document("Rapport");
        document.content = json!({
            "type": "doc",
            "content": [
                {
                    "type": "table",
                    "content": [{
                        "type": "tableRow",
                        "content": [
                            { "type": "tableCell", "content": [{ "type": "paragraph" }] },
                            { "type": "tableCell", "content": [{ "type": "paragraph" }] },
                            { "type": "tableCell", "content": [{ "type": "paragraph" }] }
                        ]
                    }]
                },
                { "type": "pageBreak" }
            ]
        });

        let content = build_content_xml(&document).unwrap();
        let styles = build_styles_xml(&document).unwrap();
        assert!(content.contains("table:number-columns-repeated=\"3\""));
        assert!(content.contains(
            "style:name=\"PageBreak\" style:family=\"paragraph\" style:parent-style-name=\"Standard\""
        ));
        assert!(!content.contains("style:master-page-name"));
        assert!(!styles.contains("style:next-style-name"));
        assert!(styles.contains("<style:header-style>"));
        assert!(styles.contains("<style:footer-style>"));
        assert!(styles.contains(
            "<style:style style:name=\"Standard\" style:family=\"paragraph\" style:class=\"text\"/>"
        ));
    }

    #[test]
    fn rich_odt_round_trip_keeps_image_header_footer_and_page_layout() {
        let mut png = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            2,
            1,
            image::Rgba([34, 102, 68, 255]),
        ))
        .write_to(&mut png, image::ImageFormat::Png)
        .unwrap();
        let (asset, bytes) = make_asset("logo.png", "image/png", png.into_inner()).unwrap();
        let mut document = new_document("Rapport");
        document.page.orientation = "landscape".to_string();
        document.page.numbering = "bottom-right".to_string();
        document.assets.push(asset.clone());
        document.content = json!({
            "type": "doc",
            "content": [
                { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Rapport été", "marks": [{ "type": "bold" }] }] },
                { "type": "image", "attrs": { "assetId": asset.id, "src": format!("mc-asset://{}", asset.id), "alt": "Logo", "title": "Logo", "width": "4cm", "align": "center" } },
                { "type": "pageBreak" },
                { "type": "paragraph", "content": [{ "type": "text", "text": "Deuxième page" }] }
            ]
        });
        document.header = Some(json!({
            "type": "doc",
            "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Multi-Converter" }] }]
        }));
        document.footer = Some(json!({
            "type": "doc",
            "content": [{ "type": "paragraph", "attrs": { "textAlign": "right" }, "content": [{ "type": "text", "text": "Page {page}/{total}" }] }]
        }));

        let directory = tempfile::tempdir().unwrap();
        let output = directory.path().join("roundtrip.odt");
        write_odt_with_assets(&document, &output, |_| Ok(bytes.clone())).unwrap();
        let parsed = parse_odt(&output).unwrap();
        assert_eq!(parsed.page.orientation, "landscape");
        assert_eq!(parsed.assets.len(), 1);
        assert!(
            parsed
                .header
                .unwrap()
                .to_string()
                .contains("Multi-Converter")
        );
        assert!(parsed.footer.unwrap().to_string().contains("{page}"));
        assert!(parsed.content.to_string().contains("Rapport été"));
        assert!(parsed.content.to_string().contains("pageBreak"));
    }
}
