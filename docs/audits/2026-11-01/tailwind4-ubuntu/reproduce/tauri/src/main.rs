use tauri::{WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[tauri::command]
fn resize(window: WebviewWindow, width: f64) -> Result<(), String> {
    window.set_focus().map_err(|e| e.to_string())?;
    window.set_size(tauri::LogicalSize::new(width, 840.0)).map_err(|e| e.to_string())
}

#[tauri::command]
fn report(value: serde_json::Value) {
    println!("PROBE_REPORT={value}");
}

#[tauri::command]
fn keyboard() { println!("PROBE_KEYBOARD"); }

#[tauri::command]
fn finish(app: tauri::AppHandle) { app.exit(0); }

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![resize, report, keyboard, finish])
        .setup(|app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Multi-Converter — Tailwind 4 native Tauri probe")
                .inner_size(1440.0, 840.0).position(0.0, 0.0).decorations(false)
                .on_page_load(|window, payload| {
                    if payload.event() == tauri::webview::PageLoadEvent::Finished {
                        let _ = window.eval(include_str!("runner.js"));
                    }
                }).build()?;
            window.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("isolated Tauri CSS probe failed");
}
