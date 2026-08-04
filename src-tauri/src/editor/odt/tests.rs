use super::package::validate_archive;
use super::reader::parse_odt;
use super::styles::resolved_style;
use super::types::{StyleCatalog, StyleInfo};
use super::writer::{build_content_xml, build_styles_xml, write_odt_with_assets};
use super::writer_render::render_text_with_page_fields;
use super::xml::{ensure_manifest_is_safe, parse_xml};
use super::{NS_MANIFEST, NS_OFFICE, NS_TEXT};
use crate::editor::assets::make_asset;
use crate::editor::document::new_document;
use serde_json::json;
use std::fs;
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;

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
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
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
    assert_eq!(content.matches("<table:table-column ").count(), 3);
    assert!(content.contains("table:name=\"BodyTable1\""));
    assert!(content.contains("style:family=\"table-column\""));
    assert!(content.contains("table:style-name=\"TableCell\""));
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
    parse_xml(content.as_bytes()).unwrap();
}

#[test]
fn generated_layout_keeps_justification_unique_tables_widths_and_merged_cells() {
    let mut document = new_document("Rapport structuré");
    document.content = json!({
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "attrs": { "textAlign": "justify" },
                "content": [{ "type": "text", "text": "Texte justifié" }]
            },
            {
                "type": "table",
                "content": [
                    {
                        "type": "tableRow",
                        "content": [
                            { "type": "tableHeader", "attrs": { "colspan": 1, "rowspan": 2, "colwidth": [120] }, "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "A" }] }] },
                            { "type": "tableHeader", "attrs": { "colspan": 2, "rowspan": 1, "colwidth": [200, 100] }, "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "B" }] }] }
                        ]
                    },
                    {
                        "type": "tableRow",
                        "content": [
                            { "type": "tableCell", "attrs": { "colspan": 1, "rowspan": 1, "colwidth": [200] }, "content": [{ "type": "paragraph" }] },
                            { "type": "tableCell", "attrs": { "colspan": 1, "rowspan": 1, "colwidth": [100] }, "content": [{ "type": "paragraph" }] }
                        ]
                    }
                ]
            },
            {
                "type": "table",
                "content": [{
                    "type": "tableRow",
                    "content": [{ "type": "tableCell", "attrs": { "colspan": 1, "rowspan": 1, "colwidth": [100] }, "content": [{ "type": "paragraph" }] }]
                }]
            }
        ]
    });

    let content = build_content_xml(&document).unwrap();
    assert!(content.contains("text:style-name=\"Justify\""));
    assert_eq!(content.matches("table:name=\"BodyTable1\"").count(), 1);
    assert_eq!(content.matches("table:name=\"BodyTable2\"").count(), 1);
    assert!(content.contains("style:name=\"BodyTable1.Column1\""));
    assert!(content.contains("style:column-width=\"48.571mm\""));
    assert!(content.contains("style:column-width=\"80.952mm\""));
    assert!(content.contains("style:column-width=\"40.476mm\""));
    assert!(content.matches("<table:covered-table-cell/>").count() >= 2);
    assert!(content.contains("table:style-name=\"TableHeaderCell\""));
    parse_xml(content.as_bytes()).unwrap();
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

#[test]
fn rich_odt_round_trip_keeps_table_proportions_and_floating_image_layout() {
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
        4,
        2,
        image::Rgba([80, 70, 60, 255]),
    ))
    .write_to(&mut png, image::ImageFormat::Png)
    .unwrap();
    let (asset, bytes) = make_asset("figure.png", "image/png", png.into_inner()).unwrap();
    let mut document = new_document("Mise en page");
    document.assets.push(asset.clone());
    document.content = json!({
        "type": "doc",
        "content": [
            {
                "type": "image",
                "attrs": {
                    "assetId": asset.id,
                    "src": format!("mc-asset://{}", asset.id),
                    "alt": "Figure",
                    "title": "Figure",
                    "width": "50%",
                    "height": "40mm",
                    "align": "right",
                    "layoutMode": "floating",
                    "offsetXmm": -12.5,
                    "offsetYmm": 22,
                    "zIndex": -20,
                    "wrapMode": "parallel"
                }
            },
            {
                "type": "table",
                "content": [{
                    "type": "tableRow",
                    "content": [
                        { "type": "tableCell", "attrs": { "colspan": 1, "rowspan": 1, "colwidth": [120] }, "content": [{ "type": "paragraph" }] },
                        { "type": "tableCell", "attrs": { "colspan": 1, "rowspan": 1, "colwidth": [240] }, "content": [{ "type": "paragraph" }] }
                    ]
                }]
            }
        ]
    });

    let directory = tempfile::tempdir().unwrap();
    let output = directory.path().join("layout-roundtrip.odt");
    write_odt_with_assets(&document, &output, |_| Ok(bytes.clone())).unwrap();
    let parsed = parse_odt(&output).unwrap();
    let image = &parsed.content["content"][0]["attrs"];
    assert_eq!(image["layoutMode"], "floating");
    assert_eq!(image["align"], "right");
    assert_eq!(image["wrapMode"], "parallel");
    assert_eq!(image["zIndex"], -20);
    assert_eq!(image["offsetXmm"], -12.5);
    assert_eq!(image["offsetYmm"], 22.0);
    let first_width = parsed.content["content"][1]["content"][0]["content"][0]["attrs"]["colwidth"]
        [0]
    .as_u64()
    .unwrap();
    let second_width =
        parsed.content["content"][1]["content"][0]["content"][1]["attrs"]["colwidth"][0]
            .as_u64()
            .unwrap();
    assert!((second_width as f64 / first_width as f64 - 2.0).abs() < 0.02);
}
