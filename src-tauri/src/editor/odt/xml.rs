use super::{MAX_XML_BYTES, MAX_XML_DEPTH, MAX_XML_NODES, NS_MANIFEST};
use crate::editor::document::CommandResult;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub(super) enum XmlChild {
    Node(XmlNode),
    Text(String),
}

#[derive(Clone, Debug)]
pub(super) struct XmlNode {
    pub(super) namespace: String,
    pub(super) name: String,
    pub(super) attrs: HashMap<(String, String), String>,
    pub(super) children: Vec<XmlChild>,
}

impl XmlNode {
    pub(super) fn is(&self, namespace: &str, name: &str) -> bool {
        self.namespace == namespace && self.name == name
    }

    pub(super) fn attr(&self, namespace: &str, name: &str) -> Option<&str> {
        self.attrs
            .get(&(namespace.to_string(), name.to_string()))
            .map(String::as_str)
    }

    pub(super) fn child_nodes(&self) -> impl Iterator<Item = &XmlNode> {
        self.children.iter().filter_map(|child| match child {
            XmlChild::Node(node) => Some(node),
            XmlChild::Text(_) => None,
        })
    }

    pub(super) fn descendants<'a>(&'a self, output: &mut Vec<&'a XmlNode>) {
        for node in self.child_nodes() {
            output.push(node);
            node.descendants(output);
        }
    }
}

pub(super) fn parse_xml(bytes: &[u8]) -> CommandResult<XmlNode> {
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

pub(super) fn ensure_manifest_is_safe(root: &XmlNode) -> CommandResult<()> {
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

pub(super) fn manifest_media_types(root: &XmlNode) -> HashMap<String, String> {
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

pub(super) fn xml_escape(value: &str) -> String {
    html_escape::encode_safe(value).into_owned()
}
