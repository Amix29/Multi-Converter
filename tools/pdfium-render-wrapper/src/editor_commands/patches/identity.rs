use crate::editor_contracts::PdfEditPatchV1;
use pdfium_render::prelude::*;

const PAGE_SELECTOR: &str = "page=";
const INSERT_SELECTOR: &str = "insert=";
const DUPLICATE_SELECTOR: &str = "duplicate=";

#[derive(Clone, Debug)]
struct LogicalPage {
    id: String,
    objects: Vec<String>,
    physical_objects: Vec<String>,
    annotations: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ObjectKind {
    Object,
    Annotation,
}

#[derive(Clone, Debug)]
pub(super) struct ResolvedPatch {
    pub patch: PdfEditPatchV1,
    page_index: usize,
    object: Option<(ObjectKind, usize)>,
    pub alias: Option<String>,
    new_page_id: Option<String>,
}

/// Resolves the stable identities emitted by inspection against the document's
/// current in-memory order. The PDF is still written only after the complete
/// batch succeeds, so a failed late patch cannot publish a partial result.
pub(super) struct PatchIdentityMap {
    pages: Vec<LogicalPage>,
    created: usize,
}

impl PatchIdentityMap {
    pub(super) fn new(document: &PdfDocument<'_>) -> Result<Self, String> {
        let mut pages = Vec::with_capacity(document.pages().len() as usize);
        for index in 0..document.pages().len() as usize {
            let page = document
                .pages()
                .get(index as i32)
                .map_err(|error| format!("PDF_EDITOR_IDENTITY_PAGE:{error}"))?;
            let page_id = format!("p{}", index + 1);
            let objects = (0..page.objects().len())
                .map(|object| format!("{page_id}-o{object}"))
                .collect::<Vec<_>>();
            pages.push(LogicalPage {
                physical_objects: objects.clone(),
                objects,
                annotations: (0..page.annotations().len())
                    .map(|annotation| format!("{page_id}-a{annotation}"))
                    .collect(),
                id: page_id,
            });
        }
        Ok(Self { pages, created: 0 })
    }

    pub(super) fn resolve(&self, source: &PdfEditPatchV1) -> Result<ResolvedPatch, String> {
        let mut patch = source.clone();
        let operation = patch.operation.as_str();
        let mut new_page_id = None;
        let mut resolved_alias = None;

        let (page_index, object) = if operation_targets_object(operation) {
            let alias = patch.object_id.clone().ok_or_else(identity_error)?;
            let (page, kind, index) = self.locate_object(&alias).ok_or_else(identity_error)?;
            let physical_index = match kind {
                ObjectKind::Object => self.pages[page]
                    .physical_objects
                    .iter()
                    .position(|value| value == &alias)
                    .ok_or_else(identity_error)?,
                ObjectKind::Annotation => index,
            };
            patch.page_number = page + 1;
            patch.object_id = Some(normalized_object_id(page, kind, physical_index));
            resolved_alias = Some(alias);
            (page, Some((kind, index)))
        } else if let Some(selector) = patch.object_id.clone() {
            if let Some(value) = selector.strip_prefix(PAGE_SELECTOR) {
                let page = self.locate_page(value).ok_or_else(identity_error)?;
                patch.page_number = page + 1;
                patch.object_id = None;
                (page, None)
            } else if let Some(value) = selector.strip_prefix(INSERT_SELECTOR) {
                ensure_new_page_id(value)?;
                let page = checked_insert_index(patch.page_number, self.pages.len())?;
                new_page_id = Some(value.to_string());
                patch.object_id = None;
                (page, None)
            } else if let Some(value) = selector.strip_prefix(DUPLICATE_SELECTOR) {
                let (source_id, copy_id) = value.split_once('|').ok_or_else(identity_error)?;
                ensure_new_page_id(copy_id)?;
                let page = self.locate_page(source_id).ok_or_else(identity_error)?;
                patch.page_number = page + 1;
                patch.object_id = None;
                new_page_id = Some(copy_id.to_string());
                (page, None)
            } else {
                return Err(identity_error());
            }
        } else {
            let page = if operation == "insertPage" {
                checked_insert_index(patch.page_number, self.pages.len())?
            } else {
                checked_existing_index(patch.page_number, self.pages.len())?
            };
            (page, None)
        };

        if matches!(operation, "duplicatePage" | "movePage") {
            let target = patch.target_page_number.ok_or_else(identity_error)?;
            checked_insert_or_existing_target(operation, target, self.pages.len())?;
        }

        Ok(ResolvedPatch {
            patch,
            page_index,
            object,
            alias: resolved_alias,
            new_page_id,
        })
    }

    pub(super) fn record_success(&mut self, resolved: &ResolvedPatch) -> Result<(), String> {
        let operation = resolved.patch.operation.as_str();
        match operation {
            "insertPage" => {
                let id = resolved
                    .new_page_id
                    .clone()
                    .unwrap_or_else(|| self.generated_page_id("insert"));
                self.pages.insert(
                    resolved.page_index,
                    LogicalPage {
                        id,
                        objects: Vec::new(),
                        physical_objects: Vec::new(),
                        annotations: Vec::new(),
                    },
                );
            }
            "duplicatePage" => {
                let id = resolved
                    .new_page_id
                    .clone()
                    .unwrap_or_else(|| self.generated_page_id("copy"));
                let mut copy = self.pages[resolved.page_index].clone();
                copy.id = id.clone();
                copy.objects = copy
                    .objects
                    .iter()
                    .map(|alias| remap_alias(alias, &id, 'o'))
                    .collect::<Result<_, _>>()?;
                copy.physical_objects = copy
                    .physical_objects
                    .iter()
                    .map(|alias| remap_alias(alias, &id, 'o'))
                    .collect::<Result<_, _>>()?;
                copy.annotations = copy
                    .annotations
                    .iter()
                    .map(|alias| remap_alias(alias, &id, 'a'))
                    .collect::<Result<_, _>>()?;
                self.pages
                    .insert(resolved.patch.target_page_number.unwrap() - 1, copy);
            }
            "movePage" => {
                let page = self.pages.remove(resolved.page_index);
                self.pages
                    .insert(resolved.patch.target_page_number.unwrap() - 1, page);
            }
            "deletePage" => {
                self.pages.remove(resolved.page_index);
            }
            "deleteObject" => self.remove_object(resolved)?,
            "deleteAnnotation" => self.remove_annotation(resolved)?,
            "moveObjectForward" | "moveObjectBackward" | "bringObjectFront" | "sendObjectBack" => {
                self.reorder_object(resolved)?
            }
            "insertImage" => self.push_generated_object(resolved.page_index, 'o'),
            "createAnnotation" => self.push_generated_object(resolved.page_index, 'a'),
            "addOcrTextLayer" => {
                for _ in resolved.patch.ocr_blocks.as_ref().into_iter().flatten() {
                    self.push_generated_object(resolved.page_index, 'o');
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn locate_page(&self, id: &str) -> Option<usize> {
        self.pages.iter().position(|page| page.id == id)
    }

    fn locate_object(&self, id: &str) -> Option<(usize, ObjectKind, usize)> {
        self.pages
            .iter()
            .enumerate()
            .find_map(|(page_index, page)| {
                page.objects
                    .iter()
                    .position(|value| value == id)
                    .map(|index| (page_index, ObjectKind::Object, index))
                    .or_else(|| {
                        page.annotations
                            .iter()
                            .position(|value| value == id)
                            .map(|index| (page_index, ObjectKind::Annotation, index))
                    })
            })
    }

    fn remove_object(&mut self, resolved: &ResolvedPatch) -> Result<(), String> {
        let (ObjectKind::Object, _) = resolved.object.ok_or_else(identity_error)? else {
            return Err(identity_error());
        };
        let alias = resolved.alias.as_deref().ok_or_else(identity_error)?;
        remove_alias(&mut self.pages[resolved.page_index].objects, alias)?;
        remove_alias(&mut self.pages[resolved.page_index].physical_objects, alias)?;
        Ok(())
    }

    fn remove_annotation(&mut self, resolved: &ResolvedPatch) -> Result<(), String> {
        let (ObjectKind::Annotation, index) = resolved.object.ok_or_else(identity_error)? else {
            return Err(identity_error());
        };
        self.pages[resolved.page_index].annotations.remove(index);
        Ok(())
    }

    fn reorder_object(&mut self, resolved: &ResolvedPatch) -> Result<(), String> {
        let (ObjectKind::Object, index) = resolved.object.ok_or_else(identity_error)? else {
            return Err(identity_error());
        };
        let objects = &mut self.pages[resolved.page_index].objects;
        let target = layer_target(index, objects.len(), &resolved.patch.operation)?;
        if target != index {
            let selected = objects.remove(index);
            objects.insert(target, selected);
        }
        Ok(())
    }

    fn push_generated_object(&mut self, page: usize, kind: char) {
        self.created += 1;
        let alias = format!("generated-{}-{kind}{}", self.created, self.created);
        if kind == 'o' {
            self.pages[page].objects.push(alias.clone());
            self.pages[page].physical_objects.push(alias);
        } else {
            self.pages[page].annotations.push(alias);
        }
    }

    pub(super) fn layer_moves(&self) -> Result<Vec<(usize, usize, usize)>, String> {
        let mut result = Vec::new();
        for (page_index, page) in self.pages.iter().enumerate() {
            let mut physical = page.physical_objects.clone();
            if physical.len() != page.objects.len() {
                return Err(identity_error());
            }
            for (target, alias) in page.objects.iter().enumerate() {
                let current = physical
                    .iter()
                    .position(|value| value == alias)
                    .ok_or_else(identity_error)?;
                if current != target {
                    result.push((page_index, current, target));
                    let selected = physical.remove(current);
                    physical.insert(target, selected);
                }
            }
        }
        Ok(result)
    }

    pub(super) fn final_text_location(&self, alias: &str) -> Option<(usize, usize)> {
        self.locate_object(alias).and_then(|(page, kind, index)| {
            (kind == ObjectKind::Object).then_some((page + 1, index))
        })
    }

    fn generated_page_id(&mut self, label: &str) -> String {
        self.created += 1;
        format!("generated-{label}-{}", self.created)
    }
}

pub(super) fn valid_object_alias(value: &str, kind: char) -> bool {
    value.len() <= 160
        && value.is_ascii()
        && value
            .rsplit_once(&format!("-{kind}"))
            .is_some_and(|(page, index)| !page.is_empty() && index.parse::<usize>().is_ok())
}

fn operation_targets_object(operation: &str) -> bool {
    matches!(
        operation,
        "setText"
            | "transformObject"
            | "setFillColor"
            | "setStrokeColor"
            | "setAnnotationContents"
            | "setFormValue"
            | "deleteObject"
            | "replaceImage"
            | "moveObjectForward"
            | "moveObjectBackward"
            | "bringObjectFront"
            | "sendObjectBack"
            | "deleteAnnotation"
    )
}

fn normalized_object_id(page: usize, kind: ObjectKind, index: usize) -> String {
    let kind = match kind {
        ObjectKind::Object => 'o',
        ObjectKind::Annotation => 'a',
    };
    format!("p{}-{kind}{index}", page + 1)
}

fn remap_alias(alias: &str, page_id: &str, kind: char) -> Result<String, String> {
    let (_, index) = alias
        .rsplit_once(&format!("-{kind}"))
        .ok_or_else(identity_error)?;
    Ok(format!("{page_id}-{kind}{index}"))
}

fn remove_alias(values: &mut Vec<String>, alias: &str) -> Result<(), String> {
    let index = values
        .iter()
        .position(|value| value == alias)
        .ok_or_else(identity_error)?;
    values.remove(index);
    Ok(())
}

fn layer_target(index: usize, length: usize, operation: &str) -> Result<usize, String> {
    if length == 0 || index >= length {
        return Err(identity_error());
    }
    Ok(match operation {
        "moveObjectForward" => (index + 1).min(length - 1),
        "moveObjectBackward" => index.saturating_sub(1),
        "bringObjectFront" => length - 1,
        "sendObjectBack" => 0,
        _ => return Err(identity_error()),
    })
}

fn checked_existing_index(page_number: usize, count: usize) -> Result<usize, String> {
    if page_number == 0 || page_number > count {
        Err(identity_error())
    } else {
        Ok(page_number - 1)
    }
}

fn checked_insert_index(page_number: usize, count: usize) -> Result<usize, String> {
    if page_number == 0 || page_number > count + 1 {
        Err(identity_error())
    } else {
        Ok(page_number - 1)
    }
}

fn checked_insert_or_existing_target(
    operation: &str,
    target: usize,
    count: usize,
) -> Result<(), String> {
    if target == 0
        || (operation == "duplicatePage" && target > count + 1)
        || (operation == "movePage" && target > count)
    {
        Err(identity_error())
    } else {
        Ok(())
    }
}

fn ensure_new_page_id(value: &str) -> Result<(), String> {
    if value.len() < 3
        || value.len() > 96
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        Err(identity_error())
    } else {
        Ok(())
    }
}

fn identity_error() -> String {
    "PDF_EDITOR_PATCH_IDENTITY:L’identité logique de page ou d’objet est introuvable.".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_alias_syntax_accepts_source_and_generated_pages() {
        assert!(valid_object_alias("p1-o0", 'o'));
        assert!(valid_object_alias("page-copy-8f1c-o12", 'o'));
        assert!(valid_object_alias("p2-a3", 'a'));
        assert!(!valid_object_alias("../p1-o0", 'a'));
    }

    #[test]
    fn layer_target_tracks_the_same_logical_object() {
        assert_eq!(layer_target(0, 3, "bringObjectFront").unwrap(), 2);
        assert_eq!(layer_target(2, 3, "moveObjectForward").unwrap(), 2);
        assert_eq!(layer_target(1, 3, "moveObjectBackward").unwrap(), 0);
    }
}
