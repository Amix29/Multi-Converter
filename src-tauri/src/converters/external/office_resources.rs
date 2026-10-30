use super::*;

const XML_LIMIT: u64 = 64 * 1024 * 1024;
const XLINK: &str = "http://www.w3.org/1999/xlink";
const ODT_TEXT: &str = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";

pub(super) fn validate(input: &Path, extension: &str) -> Result<()> {
    let extension = extension.to_ascii_lowercase();
    if !matches!(extension.as_str(), "docx" | "odt") {
        return Ok(());
    }
    let mut archive = text::open_validated_text_archive(
        input,
        "Office",
        extension == "docx",
        text::TEXT_ARCHIVE_LIMITS,
    )?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let name = entry.name()?.to_ascii_lowercase();
        let relationships = extension == "docx" && name.ends_with(".rels");
        let content = name.ends_with(".xml") && (extension == "odt" || name.starts_with("word/"));
        if !relationships && !content {
            continue;
        }
        if entry.size() > XML_LIMIT {
            return Err(blocked("Ressources XML Office trop volumineuses."));
        }
        let mut xml = String::new();
        entry
            .by_ref()
            .take(XML_LIMIT + 1)
            .read_to_string(&mut xml)?;
        if xml.len() as u64 > XML_LIMIT {
            return Err(blocked("Ressources XML Office trop volumineuses."));
        }
        validate_xml(&xml, extension == "odt", relationships)?;
    }
    Ok(())
}

fn validate_xml(xml: &str, odt: bool, relationships: bool) -> Result<()> {
    let document = roxmltree::Document::parse_with_options(
        xml,
        roxmltree::ParsingOptions {
            allow_dtd: false,
            nodes_limit: 1_000_000,
            ..Default::default()
        },
    )
    .map_err(|_| blocked("Impossible de vérifier les ressources XML Office."))?;
    for node in document.descendants().filter(|node| node.is_element()) {
        if odt && node.tag_name().name().starts_with("dde-") {
            return Err(blocked("Une liaison DDE externe a été bloquée."));
        }
        if relationships
            && node.tag_name().name() == "Relationship"
            && node
                .attribute("TargetMode")
                .is_some_and(|mode| mode.eq_ignore_ascii_case("external"))
            && !node
                .attribute("Type")
                .is_some_and(|kind| kind.ends_with("/hyperlink"))
        {
            return Err(blocked(
                "Une ressource Office externe a été bloquée. Incorporez-la au document avant la conversion.",
            ));
        }
        if odt
            && let Some(target) = node.attribute((XLINK, "href"))
            && !node.has_tag_name((ODT_TEXT, "a"))
            && !is_package_reference(target)
        {
            return Err(blocked(
                "Une ressource ODT externe a été bloquée. Incorporez-la au document avant la conversion.",
            ));
        }
        if !odt {
            let instruction = if node.tag_name().name() == "instrText" {
                node.text()
            } else {
                node.attributes()
                    .find(|attribute| attribute.name() == "instr")
                    .map(|attribute| attribute.value())
            };
            if instruction.is_some_and(external_field) {
                return Err(blocked(
                    "Un champ Office lié à une ressource externe a été bloqué.",
                ));
            }
        }
    }
    // Complex field instructions can be split across several Word runs.
    if !odt {
        let instructions: String = document
            .descendants()
            .filter(|node| node.is_element() && node.tag_name().name() == "instrText")
            .filter_map(|node| node.text())
            .collect();
        if external_field(&instructions) {
            return Err(blocked(
                "Un champ Office lié à une ressource externe a été bloqué.",
            ));
        }
    }
    Ok(())
}

fn is_package_reference(target: &str) -> bool {
    if target.starts_with('#') {
        return true;
    }
    !target.starts_with('/')
        && !target.contains([':', '\\'])
        && !target.split('/').any(|part| part == "..")
}

fn external_field(value: &str) -> bool {
    value.split_whitespace().any(|word| {
        matches!(
            word.to_ascii_uppercase().as_str(),
            "INCLUDEPICTURE" | "INCLUDETEXT" | "DDE" | "DDEAUTO" | "LINK"
        )
    })
}

fn blocked(message: &str) -> ConvertError {
    ConvertError::Message(message.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_office_resources_fail_before_native_import_but_links_remain() {
        for kind in ["image", "oleObject", "attachedTemplate", "aFChunk"] {
            let xml = format!(
                r#"<Relationships><Relationship Type="office/{kind}" TargetMode="External" Target="http://127.0.0.1/pixel.png"/></Relationships>"#
            );
            assert!(validate_xml(&xml, false, true).is_err());
        }
        let hyperlink = r#"<Relationships><Relationship Type="office/hyperlink" TargetMode="External" Target="https://example.invalid"/></Relationships>"#;
        assert!(validate_xml(hyperlink, false, true).is_ok());
        assert!(
            validate_xml(
                "<!DOCTYPE x [<!ENTITY x SYSTEM 'file:///private'>]><x>&x;</x>",
                false,
                true
            )
            .is_err()
        );
    }

    #[test]
    fn odt_package_images_are_allowed_external_images_and_fields_are_rejected() {
        for (target, allowed) in [
            ("Pictures/local.png", true),
            ("#bookmark", true),
            ("http://127.0.0.1/pixel.png", false),
            ("file:///private", false),
            ("../private.png", false),
        ] {
            let xml = format!(r#"<image xmlns:xlink="{XLINK}" xlink:href="{target}"/>"#);
            assert_eq!(validate_xml(&xml, true, false).is_ok(), allowed, "{target}");
        }
        let instruction =
            "<root><instrText> INCLUDEPICTURE http://127.0.0.1/pixel.png </instrText></root>";
        assert!(validate_xml(instruction, false, false).is_err());
        let split = "<root><instrText> INCLU</instrText><instrText>DEPICTURE http://127.0.0.1/pixel.png </instrText></root>";
        assert!(validate_xml(split, false, false).is_err());
    }
}
