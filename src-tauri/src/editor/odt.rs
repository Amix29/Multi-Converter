mod html;
mod package;
mod reader;
mod styles;
mod text;
mod tiptap;
mod types;
mod writer;
mod writer_render;
mod xml;

#[cfg(test)]
mod tests;

pub(super) use html::render_html_document;
pub(super) use reader::parse_odt;
pub(super) use text::{render_markdown, render_plain_text};
pub(super) use types::ParsedOdt;
pub(super) use writer::write_odt;

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
