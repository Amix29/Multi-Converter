use super::contracts::{PdfEditPatchV1, PdfPermissionV1};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PatchClass {
    Content,
    Annotation,
    Form,
    Assembly,
}

fn patch_class(operation: &str) -> Option<PatchClass> {
    match operation {
        "setAnnotationContents" | "createAnnotation" | "deleteAnnotation" => {
            Some(PatchClass::Annotation)
        }
        "setFormValue" => Some(PatchClass::Form),
        "rotatePage" | "deletePage" | "insertPage" | "duplicatePage" | "movePage" => {
            Some(PatchClass::Assembly)
        }
        "setText" | "transformObject" | "setFillColor" | "setStrokeColor" | "deleteObject"
        | "moveObjectForward" | "moveObjectBackward" | "bringObjectFront" | "sendObjectBack"
        | "insertImage" | "replaceImage" | "addOcrTextLayer" => Some(PatchClass::Content),
        _ => None,
    }
}

pub(super) fn validate_patch_permissions(
    permissions: &PdfPermissionV1,
    patches: &[PdfEditPatchV1],
) -> Result<(), String> {
    for patch in patches {
        if patch.operation == "addSignature" {
            return Err("PDF_EDITOR_SIGNATURE_CREATION_UNSUPPORTED:Multi-Converter ne crée pas de signature cryptographique PDF.".into());
        }
        let class = patch_class(&patch.operation).ok_or_else(|| {
            format!(
                "PDF_EDITOR_PATCH_UNSUPPORTED:Opération non prise en charge : {}",
                patch.operation
            )
        })?;
        let allowed = match class {
            PatchClass::Content => permissions.can_modify,
            PatchClass::Annotation => permissions.can_annotate,
            PatchClass::Form => permissions.can_fill_forms,
            PatchClass::Assembly => permissions.can_assemble,
        };
        if !allowed {
            return Err(format!(
                "PDF_EDITOR_PERMISSION_DENIED:{} est interdit par les permissions du document ou DocMDP.",
                patch.operation
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch(operation: &str) -> PdfEditPatchV1 {
        PdfEditPatchV1 {
            schema_version: 1,
            operation: operation.into(),
            page_number: 1,
            object_id: None,
            text: None,
            matrix: None,
            color: None,
            rotation_degrees: None,
            bounds: None,
            image_path: None,
            annotation_type: None,
            target_page_number: None,
            width_points: None,
            height_points: None,
            ocr_blocks: None,
        }
    }

    fn permissions(level: Option<u8>) -> PdfPermissionV1 {
        PdfPermissionV1 {
            schema_version: 1,
            can_modify: level.is_none(),
            can_annotate: !matches!(level, Some(1 | 2)),
            can_fill_forms: !matches!(level, Some(1)),
            can_assemble: level.is_none(),
            doc_mdp_level: level,
        }
    }

    #[test]
    fn doc_mdp_level_one_is_read_only() {
        let level = permissions(Some(1));
        for operation in [
            "setText",
            "setFormValue",
            "setAnnotationContents",
            "deletePage",
        ] {
            assert!(validate_patch_permissions(&level, &[patch(operation)]).is_err());
        }
    }

    #[test]
    fn doc_mdp_level_two_only_allows_forms_and_signatures() {
        let level = permissions(Some(2));
        assert!(validate_patch_permissions(&level, &[patch("setFormValue")]).is_ok());
        for operation in [
            "setAnnotationContents",
            "createAnnotation",
            "deleteAnnotation",
            "setText",
            "insertImage",
            "insertPage",
        ] {
            assert!(validate_patch_permissions(&level, &[patch(operation)]).is_err());
        }
    }

    #[test]
    fn doc_mdp_level_three_allows_annotations_but_not_content() {
        let level = permissions(Some(3));
        assert!(validate_patch_permissions(&level, &[patch("setFormValue")]).is_ok());
        for operation in [
            "setAnnotationContents",
            "createAnnotation",
            "deleteAnnotation",
        ] {
            assert!(validate_patch_permissions(&level, &[patch(operation)]).is_ok());
        }
        for operation in ["setText", "insertImage", "addOcrTextLayer", "movePage"] {
            assert!(validate_patch_permissions(&level, &[patch(operation)]).is_err());
        }
    }

    #[test]
    fn signature_creation_is_always_rejected() {
        assert!(
            validate_patch_permissions(&permissions(None), &[patch("addSignature")])
                .unwrap_err()
                .contains("ne crée pas")
        );
    }

    #[test]
    fn extended_safe_operations_are_classified() {
        let permissions = permissions(None);
        for operation in [
            "insertPage",
            "movePage",
            "createAnnotation",
            "deleteAnnotation",
            "insertImage",
            "replaceImage",
            "addOcrTextLayer",
        ] {
            assert!(validate_patch_permissions(&permissions, &[patch(operation)]).is_ok());
        }
    }

    #[test]
    fn active_pdf_features_are_not_silently_emulated() {
        let permissions = permissions(None);
        for operation in ["executeJavaScript", "editXfa", "editRichMedia"] {
            assert!(
                validate_patch_permissions(&permissions, &[patch(operation)])
                    .unwrap_err()
                    .contains("non prise en charge")
            );
        }
    }
}
