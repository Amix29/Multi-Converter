use super::io::{
    constant_time_eq, hash_file, load_document, read_stdin_json, save_atomically,
    validate_destination, validate_schema, validate_source,
};
use super::patches::apply_layer_moves;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

const MAX_LAYER_MOVES: usize = 10_000;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LayerWorkerRequest {
    schema_version: u8,
    source_path: String,
    destination_path: String,
    source_sha256: String,
    password: Option<String>,
    moves: Vec<(usize, usize, usize)>,
}

pub(super) fn spawn(
    source: &Path,
    destination: &Path,
    password: Option<&str>,
    moves: &[(usize, usize, usize)],
) -> Result<(), String> {
    let request = LayerWorkerRequest {
        schema_version: 1,
        source_path: source.to_string_lossy().to_string(),
        destination_path: destination.to_string_lossy().to_string(),
        source_sha256: hash_file(source)?,
        password: password.map(str::to_owned),
        moves: moves.to_vec(),
    };
    let executable =
        std::env::current_exe().map_err(|error| format!("PDF_EDITOR_LAYER_WORKER_PATH:{error}"))?;
    let mut child = Command::new(executable)
        .arg("--apply-layer-moves-internal")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("PDF_EDITOR_LAYER_WORKER_START:{error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "PDF_EDITOR_LAYER_WORKER_STDIN:Entrée indisponible.".to_string())?
        .write_all(
            &serde_json::to_vec(&request)
                .map_err(|error| format!("PDF_EDITOR_LAYER_WORKER_JSON:{error}"))?,
        )
        .map_err(|error| format!("PDF_EDITOR_LAYER_WORKER_STDIN:{error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("PDF_EDITOR_LAYER_WORKER_WAIT:{error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "PDF_EDITOR_LAYER_WORKER_FAILED:{}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

pub(super) fn run() -> Result<(), String> {
    let request: LayerWorkerRequest = read_stdin_json()?;
    validate_schema(request.schema_version)?;
    if request.moves.is_empty() || request.moves.len() > MAX_LAYER_MOVES {
        return Err("PDF_EDITOR_LAYER_WORKER_LIMIT:Lot de calques invalide.".into());
    }
    let source = validate_source(Path::new(&request.source_path))?;
    let destination = validate_destination(&source, Path::new(&request.destination_path))?;
    let source_hash = hash_file(&source)?;
    if !constant_time_eq(source_hash.as_bytes(), request.source_sha256.as_bytes()) {
        return Err("PDF_EDITOR_SOURCE_CHANGED:Le PDF intermédiaire a changé.".into());
    }
    let pdfium = crate::load_pdfium()?;
    let mut document = load_document(&pdfium, &source, request.password.as_deref())?;
    apply_layer_moves(&mut document, &request.moves)?;
    save_atomically(&document, &destination)
}
