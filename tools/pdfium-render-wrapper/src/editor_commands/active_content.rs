use crate::editor_contracts::{PdfBoundsV1, PdfObjectV1};
use lopdf::{Document, Object};
use std::collections::BTreeSet;
use std::path::Path;

const MAX_ACTIVE_CONTENT_FINDINGS: usize = 128;

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(super) struct ActiveContentFinding {
    pub kind: &'static str,
    pub location: &'static str,
}

pub(super) fn active_content_objects(findings: Vec<ActiveContentFinding>) -> Vec<PdfObjectV1> {
    findings
        .into_iter()
        .enumerate()
        .map(|(index, finding)| PdfObjectV1 {
            schema_version: 1,
            object_id: format!("p1-active-{index}-{}-{}", finding.location, finding.kind),
            kind: format!("active:{}", finding.kind),
            bounds: PdfBoundsV1 {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 0.0,
            },
            editable: false,
            text: Some(finding.location.into()),
            font_family: None,
            font_size_points: None,
            fill_color: None,
            stroke_color: None,
            rotation_degrees: 0.0,
            active_content: true,
        })
        .collect()
}

pub(super) fn inspect_active_content(
    source: &Path,
    password: Option<&str>,
) -> Result<Vec<ActiveContentFinding>, String> {
    let document = match password {
        Some(password) => Document::load_with_password(source, password),
        None => Document::load(source),
    }
    .map_err(|error| format!("PDF_EDITOR_ACTIVE_CONTENT_PARSE:{error}"))?;

    let mut findings = BTreeSet::new();
    inspect_catalog(&document, &mut findings)?;
    for object in document.objects.values() {
        inspect_object(object, "object", &mut findings);
        if findings.len() >= MAX_ACTIVE_CONTENT_FINDINGS {
            break;
        }
    }

    Ok(findings
        .into_iter()
        .take(MAX_ACTIVE_CONTENT_FINDINGS)
        .collect())
}

fn inspect_catalog(
    document: &Document,
    findings: &mut BTreeSet<ActiveContentFinding>,
) -> Result<(), String> {
    let catalog = document
        .catalog()
        .map_err(|error| format!("PDF_EDITOR_ACTIVE_CONTENT_CATALOG:{error}"))?;
    if catalog.has(b"OpenAction") {
        findings.insert(ActiveContentFinding {
            kind: "openAction",
            location: "catalog",
        });
    }
    if catalog.has(b"AA") {
        findings.insert(ActiveContentFinding {
            kind: "additionalActions",
            location: "catalog",
        });
    }
    if let Ok(names) = catalog.get_deref(b"Names", document)
        && let Ok(names) = names.as_dict()
        && names.has(b"JavaScript")
    {
        findings.insert(ActiveContentFinding {
            kind: "javascript",
            location: "documentNames",
        });
    }
    if let Ok(acro_form) = catalog.get_deref(b"AcroForm", document)
        && let Ok(acro_form) = acro_form.as_dict()
        && acro_form.has(b"XFA")
    {
        findings.insert(ActiveContentFinding {
            kind: "xfa",
            location: "acroForm",
        });
    }
    Ok(())
}

fn inspect_object(
    object: &Object,
    location: &'static str,
    findings: &mut BTreeSet<ActiveContentFinding>,
) {
    if findings.len() >= MAX_ACTIVE_CONTENT_FINDINGS {
        return;
    }
    match object {
        Object::Dictionary(dictionary) => inspect_dictionary(dictionary, location, findings),
        Object::Stream(stream) => inspect_dictionary(&stream.dict, location, findings),
        Object::Array(values) => {
            for value in values {
                inspect_object(value, location, findings);
                if findings.len() >= MAX_ACTIVE_CONTENT_FINDINGS {
                    break;
                }
            }
        }
        _ => {}
    }
}

fn inspect_dictionary(
    dictionary: &lopdf::Dictionary,
    location: &'static str,
    findings: &mut BTreeSet<ActiveContentFinding>,
) {
    if let Ok(action) = dictionary.get(b"S").and_then(Object::as_name) {
        let kind = match action {
            b"JavaScript" => Some("javascript"),
            b"Launch" => Some("launch"),
            b"Movie" => Some("movie"),
            b"Sound" => Some("sound"),
            b"Rendition" => Some("mediaRendition"),
            b"GoToE" => Some("embeddedNavigation"),
            _ => None,
        };
        if let Some(kind) = kind {
            findings.insert(ActiveContentFinding { kind, location });
        }
    }
    if let Ok(subtype) = dictionary.get(b"Subtype").and_then(Object::as_name) {
        let kind = match subtype {
            b"3D" => Some("3d"),
            b"RichMedia" => Some("richMedia"),
            b"Movie" => Some("movie"),
            b"Sound" => Some("sound"),
            b"Screen" => Some("screen"),
            b"Widget" if dictionary.has(b"XFA") => Some("xfa"),
            _ => None,
        };
        if let Some(kind) = kind {
            findings.insert(ActiveContentFinding { kind, location });
        }
    }
    if dictionary.has(b"AA") {
        findings.insert(ActiveContentFinding {
            kind: "additionalActions",
            location,
        });
    }
    for (_, value) in dictionary.iter() {
        inspect_object(value, location, findings);
        if findings.len() >= MAX_ACTIVE_CONTENT_FINDINGS {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{Dictionary, Object, Stream};

    #[test]
    fn classification_never_reads_script_source() {
        let mut dictionary = Dictionary::new();
        dictionary.set("S", Object::Name(b"JavaScript".to_vec()));
        dictionary.set("JS", Object::string_literal("app.alert('do not run')"));
        let mut findings = BTreeSet::new();
        inspect_object(&Object::Dictionary(dictionary), "object", &mut findings);
        assert_eq!(findings.len(), 1);
        assert!(findings.contains(&ActiveContentFinding {
            kind: "javascript",
            location: "object",
        }));
    }

    #[test]
    fn stream_metadata_classifies_rich_media_without_decoding_stream() {
        let mut dictionary = Dictionary::new();
        dictionary.set("Subtype", Object::Name(b"RichMedia".to_vec()));
        let stream = Stream::new(dictionary, b"untrusted payload".to_vec());
        let mut findings = BTreeSet::new();
        inspect_object(&Object::Stream(stream), "object", &mut findings);
        assert!(findings.iter().any(|value| value.kind == "richMedia"));
    }
}
