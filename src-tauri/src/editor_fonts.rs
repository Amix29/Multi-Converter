use serde::Serialize;
use std::{collections::HashSet, sync::OnceLock};

#[cfg(target_os = "macos")]
#[path = "editor_fonts/macos.rs"]
mod platform;
#[cfg(target_os = "linux")]
#[path = "editor_fonts/linux.rs"]
mod platform;
#[cfg(windows)]
#[path = "editor_fonts/windows.rs"]
mod platform;

const MAX_FAMILY_CHARS: usize = 128;
const MAX_SAMPLE_CHARS: usize = 262_144;
const MAX_CATALOG_FAMILIES: usize = 4_096;
// Cache only a successful enumeration. A transient DirectWrite/CoreText/
// Fontconfig failure must remain retryable from the non-blocking editor UI.
static FONT_CATALOG: OnceLock<(String, Vec<String>)> = OnceLock::new();

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSystemFontCatalogV1 {
    schema_version: u8,
    default_family: String,
    families: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorFontEmbeddingPolicyV1 {
    schema_version: u8,
    requested_family: String,
    resolved_family: String,
    permission: &'static str,
    can_embed_pdf: bool,
    substituted: bool,
    requested_can_embed_pdf: bool,
    requested_covers_text: bool,
    no_subsetting: bool,
    warning: Option<String>,
}

#[derive(Debug)]
pub(crate) struct FontInspection {
    pub family: String,
    pub fs_type: Option<u16>,
    pub covers_text: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct EmbeddingPolicy {
    permission: &'static str,
    can_embed: bool,
    no_subsetting: bool,
}

#[tauri::command]
pub fn editor_list_system_fonts() -> Result<EditorSystemFontCatalogV1, String> {
    let (default_family, families) = system_font_catalog()?;
    if families.is_empty() {
        return Err("EDITOR_FONT_ENUMERATION_FAILED: no installed family was reported".into());
    }
    let default_family = families
        .iter()
        .find(|family| family.eq_ignore_ascii_case(default_family))
        .cloned()
        .unwrap_or_else(|| families[0].clone());
    Ok(EditorSystemFontCatalogV1 {
        schema_version: 1,
        default_family,
        families: families.clone(),
    })
}

#[tauri::command]
pub fn editor_inspect_font_embedding(
    family: String,
    text: String,
    bold: bool,
    italic: bool,
) -> Result<EditorFontEmbeddingPolicyV1, String> {
    let requested_family = validate_family(&family)?;
    if text.chars().count() > MAX_SAMPLE_CHARS {
        return Err("EDITOR_FONT_SAMPLE_TOO_LARGE: text exceeds 262144 characters".into());
    }

    let initial = platform::inspect_font(&requested_family, &text, bold, italic).ok();
    let initial_policy = initial
        .as_ref()
        .map(|inspection| policy_from_fs_type(inspection.fs_type));
    let requested_face_found = initial
        .as_ref()
        .is_some_and(|inspection| inspection.family.eq_ignore_ascii_case(&requested_family));
    let requested_can_embed =
        requested_face_found && initial_policy.is_some_and(|policy| policy.can_embed);
    let requested_covers_text = requested_face_found
        && initial
            .as_ref()
            .is_some_and(|inspection| inspection.covers_text);
    if let Some(inspection) = initial.as_ref()
        && inspection.family.eq_ignore_ascii_case(&requested_family)
        && initial_policy.is_some_and(|policy| policy.can_embed)
        && inspection.covers_text
    {
        return Ok(policy_result(
            requested_family,
            initial.expect("the exact installed family was inspected"),
            initial_policy.expect("the inspected family has a policy"),
            false,
            requested_can_embed,
            requested_covers_text,
            None,
        ));
    }

    let reason = match (&initial, initial_policy) {
        (Some(inspection), _) if !inspection.family.eq_ignore_ascii_case(&requested_family) => {
            "police non installée"
        }
        (Some(inspection), Some(policy)) => substitution_reason(policy, inspection.covers_text),
        _ => "police non installée",
    };
    let (default_family, families) = system_font_catalog()?;
    let candidates = std::iter::once(default_family).chain(families.iter());
    if let Some((inspection, policy)) = find_embeddable_fallback(
        &requested_family,
        &text,
        bold,
        italic,
        candidates,
        platform::inspect_font,
    ) {
        let warning = format!(
            "La police « {requested_family} » ne peut pas être incorporée au PDF ({reason}). « {} » sera utilisée.",
            inspection.family
        );
        return Ok(policy_result(
            requested_family,
            inspection,
            policy,
            true,
            requested_can_embed,
            requested_covers_text,
            Some(warning),
        ));
    }

    Err(format!(
        "EDITOR_FONT_NO_EMBEDDABLE_FALLBACK: no installed font covers the requested text ({reason})"
    ))
}

fn system_font_catalog() -> Result<(&'static String, &'static Vec<String>), String> {
    if let Some((default_family, families)) = FONT_CATALOG.get() {
        return Ok((default_family, families));
    }
    let (default_family, mut families) = platform::list_system_fonts()
        .map_err(|error| format!("EDITOR_FONT_ENUMERATION_FAILED: {error}"))?;
    normalize_families(&mut families);
    if families.len() > MAX_CATALOG_FAMILIES {
        families.truncate(MAX_CATALOG_FAMILIES);
    }
    if families.is_empty() {
        return Err("EDITOR_FONT_ENUMERATION_FAILED: no installed family was reported".into());
    }
    // A racing caller may have populated the cache first; both successful
    // catalogs are valid, and every caller reads the single retained value.
    let _ = FONT_CATALOG.set((default_family, families));
    let (default_family, families) = FONT_CATALOG
        .get()
        .expect("a successful font enumeration populates the cache");
    Ok((default_family, families))
}

fn validate_family(value: &str) -> Result<String, String> {
    let family = value.trim();
    if family.is_empty() || family.chars().count() > MAX_FAMILY_CHARS {
        return Err("EDITOR_FONT_INVALID_FAMILY: family must contain 1 to 128 characters".into());
    }
    if family.chars().any(char::is_control) {
        return Err("EDITOR_FONT_INVALID_FAMILY: control characters are forbidden".into());
    }
    Ok(family.to_string())
}

fn normalize_families(families: &mut Vec<String>) {
    *families = families
        .drain(..)
        .map(|family| family.trim().to_string())
        .filter(|family| {
            !family.is_empty()
                && family.chars().count() <= MAX_FAMILY_CHARS
                && !family.chars().any(char::is_control)
        })
        .collect();
    families.sort_by_key(|family| family.to_lowercase());
    families.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
}

fn policy_from_fs_type(fs_type: Option<u16>) -> EmbeddingPolicy {
    let Some(bits) = fs_type else {
        return EmbeddingPolicy {
            permission: "unknown",
            can_embed: false,
            no_subsetting: false,
        };
    };
    if bits & 0x0200 != 0 {
        return EmbeddingPolicy {
            permission: "bitmap-only",
            can_embed: false,
            no_subsetting: bits & 0x0100 != 0,
        };
    }
    if bits & 0x0002 != 0 {
        return EmbeddingPolicy {
            permission: "restricted",
            can_embed: false,
            no_subsetting: bits & 0x0100 != 0,
        };
    }
    let no_subsetting = bits & 0x0100 != 0;
    if bits & 0x0008 != 0 {
        return EmbeddingPolicy {
            permission: "editable",
            can_embed: !no_subsetting,
            no_subsetting,
        };
    }
    if bits & 0x0004 != 0 {
        return EmbeddingPolicy {
            permission: "preview-print",
            can_embed: !no_subsetting,
            no_subsetting,
        };
    }
    EmbeddingPolicy {
        permission: "installable",
        can_embed: !no_subsetting,
        no_subsetting,
    }
}

fn substitution_reason(policy: EmbeddingPolicy, covers_text: bool) -> &'static str {
    if !covers_text {
        "glyphes manquants"
    } else if policy.no_subsetting {
        "incorporation complète exigée par la police mais non garantie par l’exporteur PDF"
    } else {
        match policy.permission {
            "restricted" => "incorporation interdite",
            "bitmap-only" => "incorporation limitée aux bitmaps",
            _ => "permission d’incorporation indéterminée",
        }
    }
}

fn policy_result(
    requested_family: String,
    inspection: FontInspection,
    policy: EmbeddingPolicy,
    substituted: bool,
    requested_can_embed_pdf: bool,
    requested_covers_text: bool,
    warning: Option<String>,
) -> EditorFontEmbeddingPolicyV1 {
    EditorFontEmbeddingPolicyV1 {
        schema_version: 1,
        requested_family,
        resolved_family: inspection.family,
        permission: policy.permission,
        can_embed_pdf: policy.can_embed,
        substituted,
        requested_can_embed_pdf,
        requested_covers_text,
        no_subsetting: policy.no_subsetting,
        warning,
    }
}

fn find_embeddable_fallback<'a, I, F>(
    requested_family: &str,
    text: &str,
    bold: bool,
    italic: bool,
    candidates: I,
    mut inspect: F,
) -> Option<(FontInspection, EmbeddingPolicy)>
where
    I: IntoIterator<Item = &'a String>,
    F: FnMut(&str, &str, bool, bool) -> Result<FontInspection, String>,
{
    let mut inspected = HashSet::new();
    for candidate in candidates.into_iter().take(MAX_CATALOG_FAMILIES + 1) {
        let key = candidate.to_lowercase();
        if candidate.eq_ignore_ascii_case(requested_family) || !inspected.insert(key) {
            continue;
        }
        let Ok(inspection) = inspect(candidate, text, bold, italic) else {
            continue;
        };
        let policy = policy_from_fs_type(inspection.fs_type);
        if policy.can_embed && inspection.covers_text {
            return Some((inspection, policy));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fs_type_permissions_follow_opentype_rules() {
        assert_eq!(policy_from_fs_type(Some(0)).permission, "installable");
        assert_eq!(
            policy_from_fs_type(Some(0x0004)).permission,
            "preview-print"
        );
        assert_eq!(policy_from_fs_type(Some(0x0008)).permission, "editable");
        assert_eq!(policy_from_fs_type(Some(0x0002)).permission, "restricted");
        assert_eq!(policy_from_fs_type(Some(0x0200)).permission, "bitmap-only");
        assert_eq!(policy_from_fs_type(None).permission, "unknown");
        assert!(!policy_from_fs_type(Some(0x0208)).can_embed);
        assert!(policy_from_fs_type(Some(0x0108)).no_subsetting);
        assert!(!policy_from_fs_type(Some(0x0108)).can_embed);
    }

    #[test]
    fn family_normalization_is_sorted_and_case_insensitive() {
        let mut families = vec!["Verdana".into(), " arial ".into(), "ARIAL".into()];
        normalize_families(&mut families);
        assert_eq!(families, vec!["arial", "Verdana"]);
    }

    #[test]
    fn fallback_search_reaches_a_family_after_the_old_sixty_four_item_cutoff() {
        let families = (0..80)
            .map(|index| format!("Family {index:02}"))
            .collect::<Vec<_>>();
        let mut inspected = Vec::new();
        let result = find_embeddable_fallback(
            "Missing",
            "Texte",
            false,
            false,
            families.iter(),
            |family, _, _, _| {
                inspected.push(family.to_string());
                Ok(FontInspection {
                    family: family.to_string(),
                    fs_type: Some(0),
                    covers_text: family == "Family 72",
                })
            },
        )
        .expect("the bounded full catalog should reach Family 72");
        assert_eq!(result.0.family, "Family 72");
        assert!(inspected.len() > 64);
    }

    #[test]
    fn no_subsetting_candidates_are_skipped_when_full_embedding_is_not_guaranteed() {
        let families = ["No subset".into(), "Safe fallback".into()];
        let result = find_embeddable_fallback(
            "Missing",
            "Texte",
            false,
            false,
            families.iter(),
            |family, _, _, _| {
                Ok(FontInspection {
                    family: family.to_string(),
                    fs_type: Some(if family == "No subset" { 0x0108 } else { 0 }),
                    covers_text: true,
                })
            },
        )
        .expect("an unrestricted fallback should remain available");
        assert_eq!(result.0.family, "Safe fallback");
    }

    #[cfg(windows)]
    #[test]
    fn directwrite_catalog_and_missing_family_fallback_are_operational() {
        let catalog =
            editor_list_system_fonts().expect("DirectWrite should enumerate installed fonts");
        assert!(catalog.families.len() > 10);
        assert!(
            catalog
                .families
                .iter()
                .any(|family| family.eq_ignore_ascii_case(&catalog.default_family))
        );

        let result = editor_inspect_font_embedding(
            "__MultiConverterMissingFont__".into(),
            "Bonjour Multi-Converter".into(),
            false,
            false,
        )
        .expect("a missing family should receive an embeddable installed fallback");
        assert!(result.substituted);
        assert!(result.can_embed_pdf);
        assert_ne!(result.requested_family, result.resolved_family);
        assert!(result.warning.is_some());
    }
}
