use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfPermissionV1 {
    pub schema_version: u8,
    pub can_modify: bool,
    pub can_annotate: bool,
    pub can_fill_forms: bool,
    pub can_assemble: bool,
    pub doc_mdp_level: Option<u8>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfSignatureInfoV1 {
    pub schema_version: u8,
    pub index: usize,
    pub doc_mdp_level: Option<u8>,
    pub reason: Option<String>,
    pub signing_date: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfBoundsV1 {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfObjectV1 {
    pub schema_version: u8,
    pub object_id: String,
    pub kind: String,
    pub bounds: PdfBoundsV1,
    pub editable: bool,
    pub text: Option<String>,
    pub font_family: Option<String>,
    pub font_size_points: Option<f32>,
    pub fill_color: Option<String>,
    pub stroke_color: Option<String>,
    pub rotation_degrees: f32,
    pub active_content: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfPageV1 {
    pub schema_version: u8,
    pub page_number: usize,
    pub width_points: f32,
    pub height_points: f32,
    pub rotation_degrees: u16,
    pub objects: Vec<PdfObjectV1>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfEditPatchV1 {
    pub schema_version: u8,
    pub operation: String,
    pub page_number: usize,
    #[serde(default)]
    pub object_id: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub matrix: Option<[f32; 6]>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub rotation_degrees: Option<u16>,
    #[serde(default)]
    pub bounds: Option<PdfBoundsV1>,
    #[serde(default)]
    pub image_path: Option<String>,
    #[serde(default)]
    pub annotation_type: Option<String>,
    #[serde(default)]
    pub target_page_number: Option<usize>,
    #[serde(default)]
    pub width_points: Option<f32>,
    #[serde(default)]
    pub height_points: Option<f32>,
    #[serde(default)]
    pub ocr_blocks: Option<Vec<PdfOcrTextBlockV1>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfOcrTextBlockV1 {
    pub text: String,
    pub bounds: PdfBoundsV1,
    #[serde(default)]
    pub font_size_points: Option<f32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfEditorSessionV1 {
    pub schema_version: u8,
    pub session_id: String,
    pub source_sha256: String,
    pub source_name: String,
    pub page_count: usize,
    pub permissions: PdfPermissionV1,
    pub signatures: Vec<PdfSignatureInfoV1>,
    pub active_content_policy: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfPageWindowV1 {
    pub schema_version: u8,
    pub source_sha256: String,
    pub page_count: usize,
    pub pages: Vec<PdfPageV1>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WrapperInspectionV1 {
    pub schema_version: u8,
    pub source_sha256: String,
    pub page_count: usize,
    pub permissions: PdfPermissionV1,
    pub signatures: Vec<PdfSignatureInfoV1>,
    pub pages: Vec<PdfPageV1>,
    pub active_content_policy: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct InspectObjectsRequest<'a> {
    pub schema_version: u8,
    pub source_path: &'a str,
    pub source_sha256: Option<&'a str>,
    pub password: Option<&'a str>,
    pub page_start: usize,
    pub page_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApplyPatchesRequest<'a> {
    pub schema_version: u8,
    pub source_path: &'a str,
    pub destination_path: &'a str,
    pub source_sha256: &'a str,
    pub password: Option<&'a str>,
    pub patches: &'a [PdfEditPatchV1],
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RenderEditorPageRequest<'a> {
    pub schema_version: u8,
    pub source_path: &'a str,
    pub source_sha256: &'a str,
    pub output_path: &'a str,
    pub password: Option<&'a str>,
    pub page_number: usize,
    pub dpi: u16,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WrapperRenderedPageV1 {
    pub schema_version: u8,
    pub source_sha256: String,
    pub output_path: String,
    pub width_points: f32,
    pub height_points: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfRenderedPageV1 {
    pub schema_version: u8,
    pub source_sha256: String,
    pub page_number: usize,
    pub mime_type: String,
    pub bytes: Vec<u8>,
    pub width_points: f32,
    pub height_points: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfSaveResultV1 {
    pub schema_version: u8,
    pub source_sha256: String,
    pub destination_path: String,
    pub applied_patches: usize,
    pub had_existing_signatures: bool,
    pub signature_validity: String,
    pub rebased_session: PdfEditorSessionV1,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PdfEditableCopyResultV1 {
    pub schema_version: u8,
    pub source_sha256: String,
    pub destination_path: String,
    pub removed_signature_structures: usize,
    pub rebased_session: PdfEditorSessionV1,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WrapperApplyResultV1 {
    pub schema_version: u8,
    pub source_sha256: String,
    pub destination_path: String,
    pub applied_patches: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateEditableCopyRequest<'a> {
    pub schema_version: u8,
    pub source_path: &'a str,
    pub destination_path: &'a str,
    pub source_sha256: &'a str,
    pub password: Option<&'a str>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WrapperEditableCopyResultV1 {
    pub schema_version: u8,
    pub source_sha256: String,
    pub destination_path: String,
    pub removed_signature_structures: usize,
}
