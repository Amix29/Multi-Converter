use crate::editor_contracts::PdfEditPatchV1;
use pdfium_render::prelude::*;

use super::parse_index;

pub(super) fn set_value(page: &mut PdfPage<'_>, patch: &PdfEditPatchV1) -> Result<(), String> {
    let mut annotation = page
        .annotations()
        .get(parse_index(patch, 'a')?)
        .map_err(|error| format!("PDF_EDITOR_PATCH_FORM:{error}"))?;
    if matches!(annotation, PdfPageAnnotation::XfaWidget(_)) {
        return Err(
            "PDF_EDITOR_XFA_UNSUPPORTED:Les formulaires XFA sont préservés mais jamais exécutés ni modifiés."
                .into(),
        );
    }
    let field = annotation.as_form_field_mut().ok_or_else(|| {
        "PDF_EDITOR_PATCH_FORM:L’annotation n’est pas un champ AcroForm.".to_string()
    })?;
    let value = patch.text.as_deref().unwrap();
    match field {
        PdfFormField::Text(text) => text
            .set_value(value)
            .map_err(|error| format!("PDF_EDITOR_PATCH_FORM:{error}")),
        PdfFormField::Checkbox(checkbox) => {
            let checked = value.parse::<bool>().map_err(|_| {
                "PDF_EDITOR_PATCH_FORM:Une case à cocher attend true ou false.".to_string()
            })?;
            checkbox
                .set_checked(checked)
                .map_err(|error| format!("PDF_EDITOR_PATCH_FORM:{error}"))
        }
        PdfFormField::RadioButton(radio) => {
            if value != "true" {
                return Err("PDF_EDITOR_PATCH_FORM:Un bouton radio peut être sélectionné avec true ; la désélection isolée n’est pas autorisée par PDFium.".into());
            }
            radio
                .set_checked()
                .map_err(|error| format!("PDF_EDITOR_PATCH_FORM:{error}"))
        }
        PdfFormField::ComboBox(_) | PdfFormField::ListBox(_) => Err(
            "PDF_EDITOR_FORM_API_UNAVAILABLE:pdfium-render 0.9.1 expose la lecture des listes et menus combinés, mais pas la sélection d’une option.".into(),
        ),
        _ => Err("PDF_EDITOR_PATCH_FORM:Ce type de champ AcroForm n’est pas modifiable dans ce runtime.".into()),
    }
}
