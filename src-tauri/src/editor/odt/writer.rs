use super::styles::{automatic_styles, named_styles, writer_style_catalog};
use super::writer_render::{contains_page_placeholder, page_dimensions_mm, render_odt_blocks};
use super::xml::xml_escape;
use super::{
    NS_DRAW, NS_FO, NS_MANIFEST, NS_OFFICE, NS_STYLE, NS_SVG, NS_TABLE, NS_TEXT, NS_XLINK,
};
use crate::editor::assets::{asset_file_for_export, extension_for_mime};
use crate::editor::document::{CommandResult, EditorAssetRef, EditorDocument};
use std::fs;
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;

// Writer implementation is kept in this module so reader and writer share the exact
// page, style, asset and placeholder rules.
pub(in crate::editor) fn write_odt(document: &EditorDocument, output: &Path) -> CommandResult<()> {
    write_odt_with_assets(document, output, |asset| {
        let source = asset_file_for_export(&document.id, asset)?;
        fs::read(source).map_err(|error| error.to_string())
    })
}

pub(super) fn write_odt_with_assets(
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

pub(super) fn build_content_xml(document: &EditorDocument) -> CommandResult<String> {
    let writer_styles = writer_style_catalog(document);
    let body = render_odt_blocks(&document.content, document, &writer_styles)?;
    Ok(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><office:document-content xmlns:office=\"{NS_OFFICE}\" xmlns:text=\"{NS_TEXT}\" xmlns:style=\"{NS_STYLE}\" xmlns:table=\"{NS_TABLE}\" xmlns:draw=\"{NS_DRAW}\" xmlns:xlink=\"{NS_XLINK}\" xmlns:fo=\"{NS_FO}\" xmlns:svg=\"{NS_SVG}\" office:version=\"1.3\"><office:automatic-styles>{}</office:automatic-styles><office:body><office:text>{body}</office:text></office:body></office:document-content>",
        automatic_styles(&writer_styles)
    ))
}

pub(super) fn build_styles_xml(document: &EditorDocument) -> CommandResult<String> {
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

pub(super) fn odt_asset_path(asset: &EditorAssetRef) -> String {
    format!(
        "Pictures/{}.{}",
        asset.id,
        extension_for_mime(&asset.mime_type)
    )
}
