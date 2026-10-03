use super::io::{replace_file, unique_stage_path};
use lopdf::{Dictionary, Document, Object, ObjectId};
use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::io::{Seek, Write};
use std::path::Path;

pub(super) fn create_unsigned_copy(
    source: &Path,
    destination: &Path,
    password: Option<&str>,
) -> Result<usize, String> {
    let mut document = match password {
        Some(password) => Document::load_with_password(source, password),
        None => Document::load(source),
    }
    .map_err(|error| format!("PDF_EDITOR_UNSIGNED_COPY_OPEN:{error}"))?;
    let removed = strip_signatures(&mut document)?;
    if removed == 0 {
        return Err("PDF_EDITOR_UNSIGNED_COPY_NOT_SIGNED:Le PDF ne contient aucune structure de signature à retirer.".into());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| "PDF_EDITOR_DESTINATION_INVALID:Dossier absent.".to_string())?;
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document.pdf");
    let staged = unique_stage_path(parent, name)?;
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .read(true)
            .write(true)
            .open(&staged)
            .map_err(|error| format!("PDF_EDITOR_STAGE_CREATE:{error}"))?;
        document
            .save_to(&mut file)
            .map_err(|error| format!("PDF_EDITOR_UNSIGNED_COPY_SAVE:{error}"))?;
        file.flush()
            .map_err(|error| format!("PDF_EDITOR_UNSIGNED_COPY_FLUSH:{error}"))?;
        file.sync_all()
            .map_err(|error| format!("PDF_EDITOR_UNSIGNED_COPY_SYNC:{error}"))?;
        file.rewind()
            .map_err(|error| format!("PDF_EDITOR_UNSIGNED_COPY_REWIND:{error}"))?;
        drop(file);
        replace_file(&staged, destination)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&staged);
    }
    result.map(|_| removed)
}

fn strip_signatures(document: &mut Document) -> Result<usize, String> {
    let mut field_ids = BTreeSet::new();
    let mut value_ids = BTreeSet::new();

    if let Ok(catalog) = document.catalog()
        && let Ok(acro_form) = catalog.get_deref(b"AcroForm", document)
        && let Ok(acro_form) = acro_form.as_dict()
        && let Ok(fields) = acro_form.get(b"Fields")
    {
        let fields = fields.clone();
        collect_signature_fields(
            document,
            &fields,
            false,
            &mut BTreeSet::new(),
            &mut field_ids,
            &mut value_ids,
        );
    }

    for (id, object) in &document.objects {
        let Some(dictionary) = object_dictionary(object) else {
            continue;
        };
        if is_signature_field(dictionary) {
            field_ids.insert(*id);
            collect_signature_value(dictionary, &mut value_ids);
        }
        if is_signature_value(dictionary) {
            value_ids.insert(*id);
        }
    }

    let acro_form_id = document
        .catalog()
        .ok()
        .and_then(|catalog| catalog.get(b"AcroForm").ok())
        .and_then(|value| value.as_reference().ok());
    if let Ok(catalog) = document.catalog_mut() {
        catalog.remove(b"Perms");
    }
    if let Some(acro_form_id) = acro_form_id
        && let Ok(acro_form) = document.get_dictionary_mut(acro_form_id)
    {
        acro_form.remove(b"SigFlags");
    }

    for (id, object) in &mut document.objects {
        if field_ids.contains(id) || value_ids.contains(id) {
            continue;
        }
        let Some(dictionary) = object_dictionary_mut(object) else {
            continue;
        };
        for key in [
            b"Fields".as_slice(),
            b"Kids".as_slice(),
            b"Annots".as_slice(),
        ] {
            if let Ok(Object::Array(values)) = dictionary.get_mut(key) {
                values.retain(|value| !is_removed_reference(value, &field_ids, &value_ids));
            }
        }
        if dictionary
            .get(b"V")
            .ok()
            .and_then(|value| value.as_reference().ok())
            .is_some_and(|id| value_ids.contains(&id))
        {
            dictionary.remove(b"V");
        }
    }

    let removed = field_ids.len() + value_ids.len();
    for id in field_ids.into_iter().chain(value_ids) {
        document.delete_object(id);
    }
    document.prune_objects();
    Ok(removed)
}

fn collect_signature_fields(
    document: &Document,
    value: &Object,
    inherited_signature: bool,
    visited: &mut BTreeSet<ObjectId>,
    field_ids: &mut BTreeSet<ObjectId>,
    value_ids: &mut BTreeSet<ObjectId>,
) {
    match value {
        Object::Array(values) => {
            for value in values {
                collect_signature_fields(
                    document,
                    value,
                    inherited_signature,
                    visited,
                    field_ids,
                    value_ids,
                );
            }
        }
        Object::Reference(id) => {
            if !visited.insert(*id) {
                return;
            }
            if let Some(object) = document.objects.get(id) {
                let Some(dictionary) = object_dictionary(object) else {
                    return;
                };
                let signature = inherited_signature || is_signature_field(dictionary);
                if signature {
                    field_ids.insert(*id);
                    collect_signature_value(dictionary, value_ids);
                }
                if let Ok(kids) = dictionary.get(b"Kids") {
                    collect_signature_fields(
                        document, kids, signature, visited, field_ids, value_ids,
                    );
                }
            }
        }
        Object::Dictionary(dictionary) => {
            let signature = inherited_signature || is_signature_field(dictionary);
            collect_signature_value(dictionary, value_ids);
            if let Ok(kids) = dictionary.get(b"Kids") {
                collect_signature_fields(document, kids, signature, visited, field_ids, value_ids);
            }
        }
        _ => {}
    }
}

fn collect_signature_value(dictionary: &Dictionary, value_ids: &mut BTreeSet<ObjectId>) {
    if let Ok(id) = dictionary.get(b"V").and_then(Object::as_reference) {
        value_ids.insert(id);
    }
}

fn is_signature_field(dictionary: &Dictionary) -> bool {
    dictionary
        .get(b"FT")
        .and_then(Object::as_name)
        .is_ok_and(|value| value == b"Sig")
}

fn is_signature_value(dictionary: &Dictionary) -> bool {
    dictionary
        .get(b"Type")
        .and_then(Object::as_name)
        .is_ok_and(|value| value == b"Sig")
        || (dictionary.has(b"ByteRange") && dictionary.has(b"Contents"))
}

fn object_dictionary(object: &Object) -> Option<&Dictionary> {
    match object {
        Object::Dictionary(value) => Some(value),
        Object::Stream(value) => Some(&value.dict),
        _ => None,
    }
}

fn object_dictionary_mut(object: &mut Object) -> Option<&mut Dictionary> {
    match object {
        Object::Dictionary(value) => Some(value),
        Object::Stream(value) => Some(&mut value.dict),
        _ => None,
    }
}

fn is_removed_reference(
    value: &Object,
    field_ids: &BTreeSet<ObjectId>,
    value_ids: &BTreeSet<ObjectId>,
) -> bool {
    match value {
        Object::Reference(id) => field_ids.contains(id) || value_ids.contains(id),
        Object::Dictionary(dictionary) => {
            is_signature_field(dictionary) || is_signature_value(dictionary)
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::dictionary;

    #[test]
    fn removes_signature_fields_and_catalog_permissions_but_keeps_other_forms() {
        let mut document = Document::new();
        let signature_value = document.add_object(dictionary! {
            "Type" => "Sig",
            "ByteRange" => vec![Object::Integer(0), Object::Integer(10)],
            "Contents" => Object::string_literal("signed")
        });
        let signature_field = document.add_object(dictionary! {
            "FT" => "Sig",
            "V" => signature_value,
            "Subtype" => "Widget"
        });
        let text_field = document.add_object(dictionary! {
            "FT" => "Tx",
            "T" => Object::string_literal("kept")
        });
        let acro_form = document.add_object(dictionary! {
            "Fields" => vec![signature_field.into(), text_field.into()],
            "SigFlags" => 3
        });
        let catalog = document.add_object(dictionary! {
            "Type" => "Catalog",
            "AcroForm" => acro_form,
            "Perms" => dictionary! { "DocMDP" => signature_value }
        });
        document.trailer.set("Root", catalog);

        assert_eq!(strip_signatures(&mut document).unwrap(), 2);
        assert!(!document.has_object(signature_field));
        assert!(!document.has_object(signature_value));
        assert!(document.has_object(text_field));
        let catalog = document.catalog().unwrap();
        assert!(!catalog.has(b"Perms"));
        let acro_form = catalog
            .get_deref(b"AcroForm", &document)
            .unwrap()
            .as_dict()
            .unwrap();
        assert!(!acro_form.has(b"SigFlags"));
        let fields = acro_form.get(b"Fields").unwrap().as_array().unwrap();
        assert_eq!(fields, &vec![text_field.into()]);
    }

    #[test]
    fn refuses_to_claim_an_unsigned_document_was_sanitized() {
        let mut document = Document::new();
        let catalog = document.add_object(dictionary! { "Type" => "Catalog" });
        document.trailer.set("Root", catalog);
        assert_eq!(strip_signatures(&mut document).unwrap(), 0);
    }
}
