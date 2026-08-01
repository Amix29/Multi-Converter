use super::xml::XmlNode;
use crate::editor::document::{EditorAssetRef, EditorCompatibilityWarning, EditorPageSettings};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Default)]
pub(super) struct StyleInfo {
    pub(super) parent: Option<String>,
    pub(super) family: String,
    pub(super) text: HashMap<String, String>,
    pub(super) paragraph: HashMap<String, String>,
}

#[derive(Default)]
pub(super) struct StyleCatalog {
    pub(super) styles: HashMap<String, StyleInfo>,
    pub(super) ordered_lists: HashSet<String>,
    pub(super) page_layouts: HashMap<String, EditorPageSettings>,
    pub(super) master_layout: Option<String>,
    pub(super) header: Option<XmlNode>,
    pub(super) footer: Option<XmlNode>,
}

pub(in crate::editor) struct ParsedOdt {
    pub(in crate::editor) content: Value,
    pub(in crate::editor) header: Option<Value>,
    pub(in crate::editor) footer: Option<Value>,
    pub(in crate::editor) page: EditorPageSettings,
    pub(in crate::editor) assets: Vec<(EditorAssetRef, Vec<u8>)>,
    pub(in crate::editor) warnings: Vec<EditorCompatibilityWarning>,
}

pub(super) struct AssetContext {
    pub(super) package_assets: HashMap<String, (String, Vec<u8>)>,
    pub(super) imported: HashMap<String, EditorAssetRef>,
    pub(super) assets: Vec<(EditorAssetRef, Vec<u8>)>,
    pub(super) warnings: Vec<EditorCompatibilityWarning>,
}

#[derive(Default)]
pub(super) struct WriterStyleCatalog {
    pub(super) names: HashMap<String, String>,
    pub(super) declarations: String,
}
