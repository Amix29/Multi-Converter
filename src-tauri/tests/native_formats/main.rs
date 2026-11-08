use multi_converter_lib::format_test_api as desktop;
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};

fn dispatch(app: &tauri::AppHandle, request: Value) -> Result<Value, String> {
    match request["op"].as_str() {
        Some("catalog") => Ok(json!(desktop::formats())),
        Some("tools") => {
            let mut paths = serde_json::Map::new();
            for id in [
                "ffmpeg",
                "ffprobe",
                "libreoffice",
                "pandoc",
                "pdfium",
                "libvips",
            ] {
                let path = desktop::resolve_tool(Some(app), id)
                    .ok_or_else(|| format!("Missing native engine: {id}"))?;
                paths.insert(id.to_string(), json!(path));
            }
            Ok(Value::Object(paths))
        }
        Some("describe") => {
            let input = request["input"].as_str().ok_or("Missing source")?;
            let description = desktop::describe_file_with_app(Some(app), input)
                .map_err(|error| error.to_string())?;
            Ok(json!(description))
        }
        Some("convert") => {
            tauri::async_runtime::block_on(desktop::convert(app.clone(), request["job"].clone()))
        }
        _ => Err("Unknown native test request".into()),
    }
}

fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let app = tauri::Builder::default()
        .manage(desktop::OcrState::default())
        .build(context)
        .expect("initialize native Tauri runtime");
    for line in io::stdin().lock().lines() {
        let request = serde_json::from_str(&line.expect("test request")).expect("request JSON");
        let response = match dispatch(app.handle(), request) {
            Ok(value) => json!({"ok": value}),
            Err(error) => json!({"error": error}),
        };
        println!("MC_FORMAT_REPLY {response}");
        io::stdout().flush().expect("flush test response");
    }
}
