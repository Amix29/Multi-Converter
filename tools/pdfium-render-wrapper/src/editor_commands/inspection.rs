use crate::editor_contracts::{
    PdfBoundsV1, PdfObjectV1, PdfPageV1, PdfPermissionV1, PdfSignatureInfoV1,
};
use pdfium_render::prelude::*;

pub(super) fn inspect_signatures(document: &PdfDocument<'_>) -> Vec<PdfSignatureInfoV1> {
    document
        .signatures()
        .iter()
        .enumerate()
        .map(|(index, signature)| PdfSignatureInfoV1 {
            schema_version: 1,
            index,
            doc_mdp_level: signature
                .modification_detection_permission()
                .ok()
                .map(mdp_level),
            reason: signature.reason(),
            signing_date: signature.signing_date(),
        })
        .collect()
}

fn mdp_level(permission: PdfSignatureModificationDetectionPermission) -> u8 {
    match permission {
        PdfSignatureModificationDetectionPermission::Mdp1 => 1,
        PdfSignatureModificationDetectionPermission::Mdp2 => 2,
        PdfSignatureModificationDetectionPermission::Mdp3 => 3,
    }
}

pub(super) fn inspect_permissions(
    document: &PdfDocument<'_>,
    signatures: &[PdfSignatureInfoV1],
) -> Result<PdfPermissionV1, String> {
    let permissions = document.permissions();
    let doc_mdp_level = signatures
        .iter()
        .filter_map(|value| value.doc_mdp_level)
        .min();
    Ok(PdfPermissionV1 {
        schema_version: 1,
        can_modify: permissions
            .can_modify_document_content()
            .map_err(permission_error)?
            && doc_mdp_level.is_none(),
        can_annotate: permissions
            .can_add_or_modify_text_annotations()
            .map_err(permission_error)?
            && !matches!(doc_mdp_level, Some(1 | 2)),
        can_fill_forms: permissions
            .can_fill_existing_interactive_form_fields()
            .map_err(permission_error)?
            && !matches!(doc_mdp_level, Some(1)),
        can_assemble: permissions
            .can_assemble_document()
            .map_err(permission_error)?
            && doc_mdp_level.is_none(),
        doc_mdp_level,
    })
}

fn permission_error(error: PdfiumError) -> String {
    format!("PDF_EDITOR_PERMISSIONS:{error}")
}

pub(super) fn inspect_page(
    document: &PdfDocument<'_>,
    page_index: usize,
) -> Result<PdfPageV1, String> {
    let page = document
        .pages()
        .get(page_index as i32)
        .map_err(|error| format!("PDF_EDITOR_PAGE_READ:{}:{error}", page_index + 1))?;
    let mut objects = page
        .objects()
        .iter()
        .enumerate()
        .map(|(index, object)| inspect_object(page_index + 1, index, object))
        .collect::<Result<Vec<_>, _>>()?;
    objects.extend(
        page.annotations()
            .iter()
            .enumerate()
            .map(|(index, annotation)| inspect_annotation(page_index + 1, index, annotation))
            .collect::<Result<Vec<_>, _>>()?,
    );
    Ok(PdfPageV1 {
        schema_version: 1,
        page_number: page_index + 1,
        width_points: page.width().value,
        height_points: page.height().value,
        rotation_degrees: page
            .rotation()
            .map_err(|error| format!("PDF_EDITOR_PAGE_ROTATION:{error}"))?
            .as_degrees() as u16,
        objects,
    })
}

fn inspect_object(
    page: usize,
    index: usize,
    object: PdfPageObject<'_>,
) -> Result<PdfObjectV1, String> {
    let bounds = bounds_from_quad(
        object
            .bounds()
            .map_err(|error| format!("PDF_EDITOR_OBJECT_BOUNDS:{error}"))?,
    );
    let rotation_degrees = object.get_rotation_clockwise_degrees();
    let fill_color = object.fill_color().ok().map(color_to_hex);
    let stroke_color = object.stroke_color().ok().map(color_to_hex);
    let (kind, editable, text, font_family, font_size_points) = match &object {
        PdfPageObject::Text(value) => (
            "text",
            true,
            Some(value.text()),
            Some(value.font().family()),
            Some(value.scaled_font_size().value),
        ),
        PdfPageObject::Path(_) => ("path", true, None, None, None),
        PdfPageObject::Image(_) => ("image", true, None, None, None),
        PdfPageObject::Shading(_) => ("shading", false, None, None, None),
        PdfPageObject::XObjectForm(_) => ("xObjectForm", false, None, None, None),
        PdfPageObject::Unsupported(_) => ("unsupported", false, None, None, None),
    };
    Ok(PdfObjectV1 {
        schema_version: 1,
        object_id: format!("p{page}-o{index}"),
        kind: kind.into(),
        bounds,
        editable,
        text,
        font_family,
        font_size_points,
        fill_color,
        stroke_color,
        rotation_degrees,
        active_content: false,
    })
}

fn inspect_annotation(
    page: usize,
    index: usize,
    annotation: PdfPageAnnotation<'_>,
) -> Result<PdfObjectV1, String> {
    let annotation_type = annotation.annotation_type();
    let action_label = annotation_action_label(&annotation);
    let active_content = annotation_is_active(annotation_type)
        || matches!(action_label.as_deref(), Some("Launch" | "Unsupported"));
    let bounds = bounds_from_rect(
        annotation
            .bounds()
            .map_err(|error| format!("PDF_EDITOR_ANNOTATION_BOUNDS:{error}"))?,
    );
    let form = annotation.as_form_field();
    let (kind, editable, text) = if let Some(field) = form {
        let field_type = field.field_type();
        let editable = matches!(
            field_type,
            PdfFormFieldType::Text | PdfFormFieldType::Checkbox | PdfFormFieldType::RadioButton
        );
        let value = match field {
            PdfFormField::Text(value) => value.value(),
            PdfFormField::Checkbox(value) => value.is_checked().ok().map(|value| value.to_string()),
            PdfFormField::RadioButton(value) => {
                value.is_checked().ok().map(|value| value.to_string())
            }
            PdfFormField::ComboBox(value) => value.value(),
            PdfFormField::ListBox(value) => value.value(),
            _ => None,
        };
        (format!("form:{field_type:?}"), editable, value)
    } else {
        (
            format!("annotation:{annotation_type:?}"),
            annotation_is_classic_editable(annotation_type),
            annotation
                .contents()
                .or_else(|| action_label.map(|value| format!("action:{value}"))),
        )
    };
    Ok(PdfObjectV1 {
        schema_version: 1,
        object_id: format!("p{page}-a{index}"),
        kind,
        bounds,
        editable,
        text,
        font_family: None,
        font_size_points: None,
        fill_color: None,
        stroke_color: None,
        rotation_degrees: 0.0,
        active_content,
    })
}

fn annotation_is_active(annotation_type: PdfPageAnnotationType) -> bool {
    matches!(
        annotation_type,
        PdfPageAnnotationType::Sound
            | PdfPageAnnotationType::Movie
            | PdfPageAnnotationType::Screen
            | PdfPageAnnotationType::ThreeD
            | PdfPageAnnotationType::RichMedia
            | PdfPageAnnotationType::XfaWidget
    )
}

fn annotation_is_classic_editable(annotation_type: PdfPageAnnotationType) -> bool {
    matches!(
        annotation_type,
        PdfPageAnnotationType::Circle
            | PdfPageAnnotationType::FreeText
            | PdfPageAnnotationType::Highlight
            | PdfPageAnnotationType::Ink
            | PdfPageAnnotationType::Popup
            | PdfPageAnnotationType::Square
            | PdfPageAnnotationType::Squiggly
            | PdfPageAnnotationType::Stamp
            | PdfPageAnnotationType::Strikeout
            | PdfPageAnnotationType::Text
            | PdfPageAnnotationType::Underline
    )
}

fn annotation_action_label(annotation: &PdfPageAnnotation<'_>) -> Option<String> {
    let PdfPageAnnotation::Link(link) = annotation else {
        return None;
    };
    link.link()
        .ok()
        .and_then(|link| link.action())
        .map(|action| format!("{:?}", action.action_type()))
}

fn bounds_from_quad(bounds: PdfQuadPoints) -> PdfBoundsV1 {
    bounds_from_rect(bounds.to_rect())
}

fn bounds_from_rect(bounds: PdfRect) -> PdfBoundsV1 {
    PdfBoundsV1 {
        x: bounds.left().value,
        y: bounds.bottom().value,
        width: bounds.width().value,
        height: bounds.height().value,
    }
}

fn color_to_hex(color: PdfColor) -> String {
    format!(
        "#{:02X}{:02X}{:02X}{:02X}",
        color.red(),
        color.green(),
        color.blue(),
        color.alpha()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_annotation_types_are_explicitly_classified() {
        let active = [
            PdfPageAnnotationType::Sound,
            PdfPageAnnotationType::Movie,
            PdfPageAnnotationType::Screen,
            PdfPageAnnotationType::ThreeD,
            PdfPageAnnotationType::RichMedia,
            PdfPageAnnotationType::XfaWidget,
        ];
        assert!(active.into_iter().all(annotation_is_active));
        assert!(!annotation_is_active(PdfPageAnnotationType::Text));
        assert!(annotation_is_classic_editable(PdfPageAnnotationType::Text));
        assert!(!annotation_is_classic_editable(PdfPageAnnotationType::Link));
        assert!(!annotation_is_classic_editable(
            PdfPageAnnotationType::FileAttachment
        ));
    }
}
