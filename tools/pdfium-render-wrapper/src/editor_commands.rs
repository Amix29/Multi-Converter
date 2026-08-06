mod active_content;
mod commit;
mod inspection;
mod io;
mod layer_worker;
mod patches;
mod unsigned_copy;

use crate::editor_contracts::{
    ApplyPatchesRequest, ApplyPatchesResultV1, CreateUnsignedCopyRequest,
    CreateUnsignedCopyResultV1, InspectObjectsRequest, PdfInspectionV1, RenderEditorPageRequest,
    RenderEditorPageResultV1,
};
use active_content::{active_content_objects, inspect_active_content};
use inspection::{inspect_page, inspect_permissions, inspect_signatures};
use io::{
    constant_time_eq, hash_file, load_document, read_stdin_json, save_atomically,
    unique_pdf_stage_path, unique_stage_path, validate_destination, validate_schema,
    validate_source, write_stdout_json,
};
use patches::{TextExpectation, apply_document_patches, enforce_permissions, validate_patches};
use pdfium_render::prelude::{PdfPageObject, PdfPageObjectsCommon, Pdfium};
use std::fs;
use std::path::Path;
use unsigned_copy::create_unsigned_copy;

const MAX_INSPECTED_PAGES: usize = 32;
const MAX_PATCHES: usize = 10_000;
const MAX_RENDER_PIXELS: f32 = 120_000_000.0;
const MAX_RENDER_SIDE: f32 = 20_000.0;

pub(crate) fn inspect_objects() -> Result<(), String> {
    let request: InspectObjectsRequest = read_stdin_json()?;
    validate_schema(request.schema_version)?;
    let source = validate_source(Path::new(&request.source_path))?;
    let source_hash = hash_file(&source)?;
    if request
        .source_sha256
        .as_deref()
        .is_some_and(|expected| !constant_time_eq(source_hash.as_bytes(), expected.as_bytes()))
    {
        return Err("PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé depuis l’ouverture.".into());
    }
    if request.page_start == 0
        || request.page_count == 0
        || request.page_count > MAX_INSPECTED_PAGES
    {
        return Err("PDF_EDITOR_PAGE_RANGE:La fenêtre doit contenir entre 1 et 32 pages.".into());
    }

    let pdfium = crate::load_pdfium()?;
    let document = load_document(&pdfium, &source, request.password.as_deref())?;
    let page_count = usize::try_from(document.pages().len())
        .map_err(|_| "PDF_EDITOR_PAGE_COUNT:Nombre de pages invalide.".to_string())?;
    let start = request.page_start - 1;
    if start >= page_count || start.saturating_add(request.page_count) > page_count {
        return Err("PDF_EDITOR_PAGE_RANGE:La fenêtre demandée dépasse le document.".into());
    }

    let signatures = inspect_signatures(&document);
    let permissions = inspect_permissions(&document, &signatures)?;
    let mut pages = (start..start + request.page_count)
        .map(|page_index| inspect_page(&document, page_index))
        .collect::<Result<Vec<_>, _>>()?;
    if start == 0 {
        let findings = inspect_active_content(&source, request.password.as_deref())?;
        if let Some(first_page) = pages.first_mut() {
            first_page.objects.extend(active_content_objects(findings));
        }
    }
    if !constant_time_eq(source_hash.as_bytes(), hash_file(&source)?.as_bytes()) {
        return Err(
            "PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé pendant l’inspection.".into(),
        );
    }
    write_stdout_json(&PdfInspectionV1 {
        schema_version: 1,
        source_sha256: source_hash,
        page_count,
        permissions,
        signatures,
        pages,
        active_content_policy: "preserve-without-execution",
    })
}

pub(crate) fn apply_patches() -> Result<(), String> {
    let request: ApplyPatchesRequest = read_stdin_json()?;
    validate_schema(request.schema_version)?;
    if request.patches.is_empty() || request.patches.len() > MAX_PATCHES {
        return Err(
            "PDF_EDITOR_PATCH_LIMIT:Le lot doit contenir entre 1 et 10 000 opérations.".into(),
        );
    }

    let source = validate_source(Path::new(&request.source_path))?;
    let destination = validate_destination(&source, Path::new(&request.destination_path))?;
    let source_hash = hash_file(&source)?;
    if !constant_time_eq(source_hash.as_bytes(), request.source_sha256.as_bytes()) {
        return Err("PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé depuis l’ouverture.".into());
    }

    validate_patches(&request.patches)?;
    let pdfium = crate::load_pdfium()?;
    let mut document = load_document(&pdfium, &source, request.password.as_deref())?;
    let signatures = inspect_signatures(&document);
    let permissions = inspect_permissions(&document, &signatures)?;
    enforce_permissions(&permissions, &request.patches)?;
    let applied = apply_document_patches(&pdfium, &mut document, &request.patches)?;
    let source_hash_before_commit = hash_file(&source)?;
    if !constant_time_eq(source_hash.as_bytes(), source_hash_before_commit.as_bytes()) {
        return Err("PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé pendant l’édition.".into());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "PDF_EDITOR_DESTINATION_INVALID:Dossier absent.".to_string())?;
    let staged_final = unique_pdf_stage_path(parent, "pdf-editor-final")?;
    let write_result = if applied.layer_moves.is_empty() {
        let result = save_atomically(&document, &staged_final);
        drop(document);
        result
    } else {
        let intermediate = unique_stage_path(parent, "pdf-editor-layer-source.pdf")?;
        let first_save = save_atomically(&document, &intermediate);
        drop(document);
        if let Err(error) = first_save {
            let _ = fs::remove_file(&intermediate);
            return Err(error);
        }
        let result = layer_worker::spawn(
            &intermediate,
            &staged_final,
            request.password.as_deref(),
            &applied.layer_moves,
        );
        let _ = fs::remove_file(&intermediate);
        result
    };
    if let Err(error) = write_result {
        let _ = fs::remove_file(&staged_final);
        return Err(error);
    }
    commit::validate_and_commit(
        &source,
        &source_hash,
        &staged_final,
        &destination,
        "PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé pendant l’édition.",
        |staged| {
            verify_saved_texts(
                &pdfium,
                staged,
                request.password.as_deref(),
                &applied.text_expectations,
            )
        },
    )?;
    write_stdout_json(&ApplyPatchesResultV1 {
        schema_version: 1,
        source_sha256: source_hash,
        destination_path: destination.to_string_lossy().to_string(),
        applied_patches: request.patches.len(),
    })
}

fn verify_saved_texts(
    pdfium: &Pdfium,
    destination: &Path,
    password: Option<&str>,
    expectations: &[TextExpectation],
) -> Result<(), String> {
    if expectations.is_empty() {
        return Ok(());
    }
    let document = load_document(pdfium, destination, password)?;
    for expectation in expectations {
        let page = document
            .pages()
            .get((expectation.page_number - 1) as i32)
            .map_err(|error| format!("PDF_EDITOR_TEXT_VERIFY_SAVED:{error}"))?;
        let object = page
            .objects()
            .get(expectation.object_index)
            .map_err(|error| format!("PDF_EDITOR_TEXT_VERIFY_SAVED:{error}"))?;
        let exact_text_is_present = matches!(object, PdfPageObject::Text(ref text)
            if text.text() == expectation.text);
        if !exact_text_is_present {
            return Err(format!(
                "PDF_EDITOR_TEXT_VERIFY_SAVED:L’objet texte attendu est invalide sur la page {} après réouverture.",
                expectation.page_number
            ));
        }
    }
    Ok(())
}

pub(crate) fn apply_layer_moves_internal() -> Result<(), String> {
    layer_worker::run()
}

pub(crate) fn create_editable_copy() -> Result<(), String> {
    let request: CreateUnsignedCopyRequest = read_stdin_json()?;
    validate_schema(request.schema_version)?;
    let source = validate_source(Path::new(&request.source_path))?;
    let destination = validate_destination(&source, Path::new(&request.destination_path))?;
    let source_hash = hash_file(&source)?;
    if !constant_time_eq(source_hash.as_bytes(), request.source_sha256.as_bytes()) {
        return Err("PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé depuis l’ouverture.".into());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| "PDF_EDITOR_DESTINATION_INVALID:Dossier absent.".to_string())?;
    let staged_final = unique_pdf_stage_path(parent, "pdf-editor-unsigned-final")?;
    let removed = match create_unsigned_copy(&source, &staged_final, request.password.as_deref()) {
        Ok(removed) => removed,
        Err(error) => {
            let _ = fs::remove_file(&staged_final);
            return Err(error);
        }
    };
    commit::validate_and_commit(
        &source,
        &source_hash,
        &staged_final,
        &destination,
        "PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé pendant la création de la copie.",
        |staged| {
            let pdfium = crate::load_pdfium()?;
            let document = load_document(&pdfium, staged, None)?;
            if !inspect_signatures(&document).is_empty()
                || inspect_permissions(&document, &[])?.doc_mdp_level.is_some()
            {
                return Err("PDF_EDITOR_UNSIGNED_COPY_INVALID:La copie contient encore une signature ou une restriction DocMDP.".into());
            }
            Ok(())
        },
    )?;
    write_stdout_json(&CreateUnsignedCopyResultV1 {
        schema_version: 1,
        source_sha256: source_hash,
        destination_path: destination.to_string_lossy().to_string(),
        removed_signature_structures: removed,
    })
}

pub(crate) fn render_page() -> Result<(), String> {
    let request: RenderEditorPageRequest = read_stdin_json()?;
    validate_schema(request.schema_version)?;
    if request.page_number == 0 || !(36..=300).contains(&request.dpi) {
        return Err("PDF_EDITOR_RENDER_RANGE:Page ou résolution de rendu invalide.".into());
    }
    let source = validate_source(Path::new(&request.source_path))?;
    let source_hash = hash_file(&source)?;
    if !constant_time_eq(source_hash.as_bytes(), request.source_sha256.as_bytes()) {
        return Err("PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé depuis l’ouverture.".into());
    }
    let output = io::validate_render_output(Path::new(&request.output_path))?;
    let pdfium = crate::load_pdfium()?;
    let document = load_document(&pdfium, &source, request.password.as_deref())?;
    let page = document
        .pages()
        .get((request.page_number - 1) as i32)
        .map_err(|error| format!("PDF_EDITOR_RENDER_PAGE:{error}"))?;
    let width_points = page.width().value;
    let height_points = page.height().value;
    let width_pixels = (width_points / 72.0) * f32::from(request.dpi);
    let height_pixels = (height_points / 72.0) * f32::from(request.dpi);
    if !width_pixels.is_finite()
        || !height_pixels.is_finite()
        || width_pixels <= 0.0
        || height_pixels <= 0.0
        || width_pixels > MAX_RENDER_SIDE
        || height_pixels > MAX_RENDER_SIDE
        || width_pixels * height_pixels > MAX_RENDER_PIXELS
    {
        return Err(
            "PDF_EDITOR_RENDER_LIMIT:La page rendue dépasse les limites de sécurité.".into(),
        );
    }
    crate::render_page(
        &document,
        &source,
        &output,
        crate::RenderOptions {
            page: request.page_number,
            format: crate::OutputFormat::Png,
            dpi: request.dpi,
            quality: 90,
        },
        request.page_number,
    )?;
    if !constant_time_eq(source_hash.as_bytes(), hash_file(&source)?.as_bytes()) {
        let _ = std::fs::remove_file(&output);
        return Err("PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé pendant le rendu.".into());
    }
    write_stdout_json(&RenderEditorPageResultV1 {
        schema_version: 1,
        source_sha256: source_hash,
        output_path: output.to_string_lossy().to_string(),
        width_points,
        height_points,
    })
}
