use crate::editor_contracts::PdfEditPatchV1;
use pdfium_render::prelude::*;

const MAX_PAGES: usize = 2_000;

pub(super) fn apply_page_patch<'a>(
    pdfium: &'a Pdfium,
    document: &mut PdfDocument<'a>,
    patch: &PdfEditPatchV1,
) -> Result<(), String> {
    match patch.operation.as_str() {
        "insertPage" => insert_blank(document, patch),
        "duplicatePage" => duplicate(pdfium, document, patch),
        "movePage" => move_page(pdfium, document, patch),
        "deletePage" => delete(document, patch.page_number),
        _ => Err("PDF_EDITOR_PATCH_UNSUPPORTED:Opération de page inconnue.".into()),
    }
}

fn insert_blank(document: &mut PdfDocument<'_>, patch: &PdfEditPatchV1) -> Result<(), String> {
    let page_count = document.pages().len() as usize;
    ensure_can_grow(page_count)?;
    if patch.page_number > page_count + 1 {
        return Err("PDF_EDITOR_PATCH_PAGE:Position d’insertion hors du document.".into());
    }
    let size = PdfPagePaperSize::new_custom(
        PdfPoints::new(patch.width_points.unwrap()),
        PdfPoints::new(patch.height_points.unwrap()),
    );
    document
        .pages_mut()
        .create_page_at_index(size, (patch.page_number - 1) as i32)
        .map_err(|error| format!("PDF_EDITOR_INSERT_PAGE:{error}"))?;
    Ok(())
}

fn duplicate<'a>(
    pdfium: &'a Pdfium,
    document: &mut PdfDocument<'a>,
    patch: &PdfEditPatchV1,
) -> Result<(), String> {
    let page_count = document.pages().len() as usize;
    ensure_can_grow(page_count)?;
    let source = checked_existing_index(patch.page_number, page_count)?;
    let destination_number = patch.target_page_number.unwrap();
    if destination_number == 0 || destination_number > page_count + 1 {
        return Err("PDF_EDITOR_DUPLICATE_PAGE:Position de copie hors du document.".into());
    }
    let snapshot = snapshot(pdfium, document)?;
    document
        .pages_mut()
        .copy_page_from_document(&snapshot, source, (destination_number - 1) as i32)
        .map_err(|error| format!("PDF_EDITOR_DUPLICATE_PAGE:{error}"))
}

fn move_page<'a>(
    pdfium: &'a Pdfium,
    document: &mut PdfDocument<'a>,
    patch: &PdfEditPatchV1,
) -> Result<(), String> {
    let page_count = document.pages().len() as usize;
    let source = checked_existing_index(patch.page_number, page_count)?;
    let destination_number = patch.target_page_number.unwrap();
    let destination = checked_existing_index(destination_number, page_count)?;
    if source == destination {
        return Ok(());
    }
    let snapshot = snapshot(pdfium, document)?;
    document
        .pages()
        .get(source)
        .map_err(|error| format!("PDF_EDITOR_MOVE_PAGE:{error}"))?
        .delete()
        .map_err(|error| format!("PDF_EDITOR_MOVE_PAGE:{error}"))?;
    document
        .pages_mut()
        .copy_page_from_document(&snapshot, source, destination)
        .map_err(|error| format!("PDF_EDITOR_MOVE_PAGE:{error}"))
}

fn delete(document: &mut PdfDocument<'_>, page_number: usize) -> Result<(), String> {
    let page_count = document.pages().len() as usize;
    if page_count <= 1 {
        return Err("PDF_EDITOR_EMPTY:Un PDF doit conserver au moins une page.".into());
    }
    let index = checked_existing_index(page_number, page_count)?;
    document
        .pages()
        .get(index)
        .map_err(|error| format!("PDF_EDITOR_PATCH_PAGE:{error}"))?
        .delete()
        .map_err(|error| format!("PDF_EDITOR_PATCH_DELETE_PAGE:{error}"))
}

fn snapshot<'a>(pdfium: &'a Pdfium, document: &PdfDocument<'_>) -> Result<PdfDocument<'a>, String> {
    let bytes = document
        .save_to_bytes()
        .map_err(|error| format!("PDF_EDITOR_PAGE_SNAPSHOT:{error}"))?;
    pdfium
        .load_pdf_from_byte_vec(bytes, None)
        .map_err(|error| format!("PDF_EDITOR_PAGE_SNAPSHOT:{error}"))
}

fn ensure_can_grow(page_count: usize) -> Result<(), String> {
    if page_count >= MAX_PAGES {
        Err("PDF_EDITOR_PAGE_LIMIT:Le document est limité à 2 000 pages.".into())
    } else {
        Ok(())
    }
}

fn checked_existing_index(page_number: usize, page_count: usize) -> Result<i32, String> {
    if page_number == 0 || page_number > page_count {
        Err("PDF_EDITOR_PATCH_PAGE:Numéro de page hors du document.".into())
    } else {
        Ok((page_number - 1) as i32)
    }
}
