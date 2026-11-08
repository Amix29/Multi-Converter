//! Offline CPU worker for the complete PP-OCRv6_medium pipeline.
use oar_ocr::core::config::{OrtExecutionProvider, OrtGraphOptimizationLevel, OrtSessionConfig};
use oar_ocr::domain::tasks::{TextDetectionConfig, TextRecognitionConfig};
use oar_ocr::oarocr::{OAROCR, OAROCRBuilder};
use oar_ocr::processors::LimitType;
use oar_ocr::utils::load_image;
use serde::Deserialize;
use serde_json::{Value, json};
use std::fs;
use std::io::{self, BufRead, Read, Write};
use std::path::PathBuf;
mod models;
mod runtime;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    schema_version: u32,
    job_id: String,
    input: PathBuf,
    output: PathBuf,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("OCR_NATIVE_RUNTIME:{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut models = None;
    let (mut input, mut output, mut job_id, mut serve) = (None, None, None, false);
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--serve" => serve = true,
            "--models" => models = args.next().map(PathBuf::from),
            "--input" => input = args.next().map(PathBuf::from),
            "--output" => output = args.next().map(PathBuf::from),
            "--job-id" => job_id = args.next(),
            "--provider" if args.next().as_deref() == Some("cpu") => {}
            _ => return Err(format!("Unsupported argument: {arg}")),
        }
    }
    let root = models
        .ok_or("Missing --models")?
        .canonicalize()
        .map_err(display)?;
    runtime::initialize()?;
    let config = OrtSessionConfig {
        intra_threads: Some(2),
        inter_threads: Some(1),
        parallel_execution: Some(false),
        optimization_level: Some(OrtGraphOptimizationLevel::DisableAll),
        execution_providers: Some(vec![OrtExecutionProvider::CPU]),
        log_severity_level: Some(3),
        ..Default::default()
    };
    // Match the actually inspected reference settings, not PP-OCRv6 presets.
    let detection = TextDetectionConfig {
        score_threshold: 0.3,
        box_threshold: 0.6,
        unclip_ratio: 1.5,
        max_candidates: 1000,
        limit_side_len: Some(1536),
        limit_type: Some(LimitType::Max),
        max_side_len: Some(4000),
    };
    let pipeline = OAROCRBuilder::new(
        models::load(&root, "text-detection")?,
        models::load(&root, "text-recognition")?,
        models::dictionary(&root)?,
    )
    .with_document_image_orientation_classification(models::load(&root, "document-orientation")?)
    .with_document_image_rectification(models::load(&root, "document-unwarping")?)
    .with_text_line_orientation_classification(models::load(&root, "textline-orientation")?)
    .text_detection_config(detection)
    .text_recognition_config(TextRecognitionConfig {
        score_threshold: 0.0,
    })
    .ort_session(config)
    .image_batch_size(1)
    .region_batch_size(6)
    .build()
    .map_err(display)?;
    if !serve {
        return recognize(
            &pipeline,
            &Request {
                schema_version: 1,
                job_id: job_id.ok_or("Missing --job-id")?,
                input: input.ok_or("Missing --input")?,
                output: output.ok_or("Missing --output")?,
            },
        );
    }
    send(&json!({"type":"ready","schemaVersion":1}))?;
    let mut stdin = io::stdin().lock();
    loop {
        let mut line = Vec::new();
        let size = stdin
            .by_ref()
            .take(131_073)
            .read_until(b'\n', &mut line)
            .map_err(display)?;
        if size == 0 {
            break;
        }
        if size > 131_072 {
            send(&json!({"type":"failed","jobId":"","message":"Request exceeds size limit"}))?;
            return Err("Request exceeds size limit".into());
        }
        let parsed: Result<Request, _> = serde_json::from_slice(&line);
        let request = match parsed {
            Ok(request)
                if request.schema_version == 1
                    && !request.job_id.is_empty()
                    && request.job_id.len() <= 128 =>
            {
                request
            }
            _ => {
                send(&json!({"type":"failed","jobId":"","message":"Invalid request"}))?;
                continue;
            }
        };
        let reply = match recognize(&pipeline, &request) {
            Ok(()) => json!({"type":"completed","jobId":request.job_id}),
            Err(error) => {
                json!({"type":"failed","jobId":request.job_id,"message":error.chars().take(800).collect::<String>()})
            }
        };
        send(&reply)?;
    }
    Ok(())
}

fn recognize(pipeline: &OAROCR, request: &Request) -> Result<(), String> {
    if request.output.exists() {
        return Err("Output already exists".into());
    }
    let input = request.input.canonicalize().map_err(display)?;
    if input == request.output {
        return Err("Input and output must differ".into());
    }
    if !input.is_file() || fs::metadata(&input).map_err(display)?.len() > 128 * 1024 * 1024 {
        return Err("Input exceeds the file limit".into());
    }
    let image = load_image(&input).map_err(display)?;
    if image.width() > 32_768
        || image.height() > 32_768
        || u64::from(image.width()) * u64::from(image.height()) > 120_000_000
    {
        return Err("Input exceeds the image limits".into());
    }
    let results = pipeline.predict(vec![image]).map_err(display)?;
    let page = results.first().ok_or("No OCR result")?;
    #[cfg(feature = "diagnostics")]
    if let Some(directory) = std::env::var_os("MC_NATIVE_TRACE") {
        let directory = PathBuf::from(directory);
        fs::create_dir_all(&directory).map_err(display)?;
        fs::write(
            directory.join("regions.json"),
            serde_json::to_vec_pretty(page).map_err(display)?,
        )
        .map_err(display)?;
        let image = page.rectified_img.as_ref().unwrap_or(&page.input_img);
        let save = |name: &str, pixels: &[u8], width: u32, height: u32| -> Result<(), String> {
            let mut file = fs::File::create(directory.join(name)).map_err(display)?;
            write!(file, "P6\n{width} {height}\n255\n").map_err(display)?;
            file.write_all(pixels).map_err(display)
        };
        save(
            "rectified.ppm",
            image.as_raw(),
            image.width(),
            image.height(),
        )?;
        for (index, region) in page.text_regions.iter().enumerate() {
            let crop = oar_ocr::utils::get_rotate_crop_image(image, &region.bounding_box.points)
                .map_err(display)?;
            let crop = oar_ocr::domain::apply_text_line_orientation(
                crop,
                region.orientation_angle.unwrap_or(0.0),
            );
            save(
                &format!("crop-{index}.ppm"),
                crop.as_raw(),
                crop.width(),
                crop.height(),
            )?;
        }
    }
    let mut blocks = Vec::new();
    for region in &page.text_regions {
        let Some(text) = &region.text else { continue };
        if text.trim().is_empty() {
            continue;
        }
        let points = &region.bounding_box.points;
        let min_x = points.iter().map(|p| p.x).fold(f32::INFINITY, f32::min);
        let min_y = points.iter().map(|p| p.y).fold(f32::INFINITY, f32::min);
        let max_x = points.iter().map(|p| p.x).fold(f32::NEG_INFINITY, f32::max);
        let max_y = points.iter().map(|p| p.y).fold(f32::NEG_INFINITY, f32::max);
        if ![min_x, min_y, max_x, max_y].iter().all(|p| p.is_finite()) {
            return Err("Invalid OCR geometry".into());
        }
        blocks.push(json!({"text":text.as_ref(),"confidence":region.confidence.unwrap_or(0.0).clamp(0.0,1.0),
            "boundingBox":{"x":min_x,"y":min_y,"width":(max_x-min_x).max(0.0),"height":(max_y-min_y).max(0.0)}}));
    }
    let text = blocks
        .iter()
        .filter_map(|b| b["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let result = json!({"schemaVersion":1,"jobId":request.job_id,"text":text,
        "pages":[{"pageNumber":1,"source":"ocr","width":0,"height":0,"text":text,"blocks":blocks,"warnings":[]}],"warnings":[]});
    if let Some(parent) = request.output.parent() {
        fs::create_dir_all(parent).map_err(display)?;
    }
    let temp = request.output.with_extension("tmp");
    let bytes = serde_json::to_vec(&result).map_err(display)?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("OCR result exceeds size limit".into());
    }
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(display)?;
    file.write_all(&bytes).map_err(display)?;
    file.sync_all().map_err(display)?;
    drop(file);
    fs::rename(&temp, &request.output).map_err(display)?;
    Ok(())
}

fn send(value: &Value) -> Result<(), String> {
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{value}").map_err(display)?;
    stdout.flush().map_err(display)
}
fn display(error: impl std::fmt::Display) -> String {
    error.to_string()
}
