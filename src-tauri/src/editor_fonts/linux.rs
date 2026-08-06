use super::FontInspection;
use std::{fs, path::Path, process::Command};
use ttf_parser::{Face, Tag};

const MAX_FONT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_FONTCONFIG_OUTPUT: usize = 16 * 1024 * 1024;

pub(super) fn list_system_fonts() -> Result<(String, Vec<String>), String> {
    let output = fontconfig("fc-list", &["--format", "%{family}\n"])?;
    let families = output
        .lines()
        .flat_map(|line| line.split(','))
        .map(str::trim)
        .filter(|family| !family.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    let default_output = fontconfig("fc-match", &["--format", "%{family}\n", "sans-serif"])?;
    let default_family = default_output
        .lines()
        .next()
        .and_then(|line| line.split(',').next())
        .map(str::trim)
        .filter(|family| !family.is_empty())
        .unwrap_or("sans-serif")
        .to_string();
    Ok((default_family, families))
}

pub(super) fn inspect_font(
    family: &str,
    text: &str,
    bold: bool,
    italic: bool,
) -> Result<FontInspection, String> {
    let style = match (bold, italic) {
        (true, true) => ":style=Bold Italic",
        (true, false) => ":style=Bold",
        (false, true) => ":style=Italic",
        (false, false) => "",
    };
    let pattern = format!("{family}{style}");
    let output = fontconfig("fc-match", &["--format", "%{family}\n%{file}\n", &pattern])?;
    let mut lines = output.lines();
    let resolved_family = lines
        .next()
        .and_then(|line| line.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Fontconfig did not resolve a family".to_string())?
        .to_string();
    let path = lines
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Fontconfig did not resolve a local font file".to_string())?;
    let bytes = read_font(Path::new(path))?;
    let count = ttf_parser::fonts_in_collection(&bytes).unwrap_or(1);
    let mut best: Option<FontInspection> = None;
    for index in 0..count {
        let Ok(face) = Face::parse(&bytes, index) else {
            continue;
        };
        let covers_text = covers(&face, text);
        let fs_type = face
            .table_data(Tag::from_bytes(b"OS/2"))
            .and_then(|table| table.get(8..10))
            .map(|value| u16::from_be_bytes([value[0], value[1]]));
        let inspection = FontInspection {
            family: resolved_family.clone(),
            fs_type,
            covers_text,
        };
        if inspection.covers_text {
            return Ok(inspection);
        }
        best = Some(inspection);
    }
    best.ok_or_else(|| "resolved font file contains no readable OpenType face".into())
}

fn covers(face: &Face<'_>, text: &str) -> bool {
    text.chars()
        .filter(|character| !character.is_control() && !character.is_whitespace())
        .all(|character| face.glyph_index(character).is_some())
}

fn read_font(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_FONT_BYTES {
        return Err("resolved font is not a bounded regular file".into());
    }
    fs::read(path).map_err(|error| error.to_string())
}

fn fontconfig(command: &str, arguments: &[&str]) -> Result<String, String> {
    let output = Command::new(command)
        .args(arguments)
        .output()
        .map_err(|error| format!("{command} is unavailable: {error}"))?;
    if !output.status.success() {
        return Err(format!("{command} exited with {}", output.status));
    }
    if output.stdout.len() > MAX_FONTCONFIG_OUTPUT {
        return Err(format!("{command} returned an oversized response"));
    }
    String::from_utf8(output.stdout).map_err(|_| format!("{command} returned invalid UTF-8"))
}
