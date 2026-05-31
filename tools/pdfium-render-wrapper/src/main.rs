use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ImageFormat};
use pdfium_render::prelude::*;
use std::env;
use std::fs::{self, File};
use std::path::{Path, PathBuf};

const DEFAULT_DPI: u16 = 200;
const DEFAULT_JPEG_QUALITY: u8 = 90;
const MAX_DPI: u16 = 600;
const MAX_PAGES: usize = 2000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OutputFormat {
    Png,
    Jpeg,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    match args.first().map(String::as_str) {
        Some("--check") => {
            load_pdfium()?;
            println!("PDFium prêt");
            Ok(())
        }
        Some("--version") => {
            println!("pdfium-render-wrapper 0.2.0");
            Ok(())
        }
        Some("--page-count") => {
            let input = args.get(1).ok_or_else(usage)?;
            let pdfium = load_pdfium()?;
            let document = load_document(&pdfium, Path::new(input))?;
            println!("{}", page_count(&document)?);
            Ok(())
        }
        Some("--render") => {
            if args.len() < 3 {
                return Err(usage());
            }
            let options = RenderOptions::parse(&args[3..], Some(Path::new(&args[2])))?;
            render_one(Path::new(&args[1]), Path::new(&args[2]), options)
        }
        Some("--render-all") => {
            if args.len() < 3 {
                return Err(usage());
            }
            let options = RenderOptions::parse(&args[3..], None)?;
            render_all(Path::new(&args[1]), Path::new(&args[2]), options)
        }
        _ => Err(usage()),
    }
}

fn usage() -> String {
    [
        "Usage:",
        "  pdfium-render --check",
        "  pdfium-render --version",
        "  pdfium-render --page-count <input.pdf>",
        "  pdfium-render --render <input.pdf> <output.png|jpg|jpeg> --page 1 --format png --dpi 200",
        "  pdfium-render --render-all <input.pdf> <output-dir> --format png --dpi 200",
        "  pdfium-render --render-all <input.pdf> <output-dir> --format jpg --dpi 200 --quality 90",
    ]
    .join("\n")
}

#[derive(Clone, Copy, Debug)]
struct RenderOptions {
    page: usize,
    format: OutputFormat,
    dpi: u16,
    quality: u8,
}

impl RenderOptions {
    fn parse(args: &[String], output: Option<&Path>) -> Result<Self, String> {
        let mut page = 1usize;
        let mut format = output
            .and_then(OutputFormat::from_path)
            .unwrap_or(OutputFormat::Png);
        let mut dpi = DEFAULT_DPI;
        let mut quality = DEFAULT_JPEG_QUALITY;
        let mut index = 0;
        while index < args.len() {
            match args[index].as_str() {
                "--page" => {
                    page = parse_next(args, index, "page")?;
                    if page == 0 {
                        return Err("Le numéro de page PDFium commence à 1.".to_string());
                    }
                    index += 2;
                }
                "--format" => {
                    let value = args
                        .get(index + 1)
                        .ok_or_else(|| "Valeur manquante pour --format.".to_string())?;
                    format = OutputFormat::parse(value)?;
                    index += 2;
                }
                "--dpi" => {
                    dpi = parse_next(args, index, "dpi")?;
                    if !(36..=MAX_DPI).contains(&dpi) {
                        return Err(format!("DPI PDFium hors limites : 36 à {MAX_DPI}."));
                    }
                    index += 2;
                }
                "--quality" => {
                    quality = parse_next(args, index, "quality")?;
                    if !(1..=100).contains(&quality) {
                        return Err("Qualité JPEG invalide : 1 à 100.".to_string());
                    }
                    index += 2;
                }
                other => return Err(format!("Argument PDFium inconnu : {other}")),
            }
        }
        Ok(Self {
            page,
            format,
            dpi,
            quality,
        })
    }
}

fn parse_next<T>(args: &[String], index: usize, label: &str) -> Result<T, String>
where
    T: std::str::FromStr,
{
    args.get(index + 1)
        .ok_or_else(|| format!("Valeur manquante pour --{label}."))?
        .parse::<T>()
        .map_err(|_| format!("Valeur invalide pour --{label}."))
}

impl OutputFormat {
    fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "png" => Ok(Self::Png),
            "jpg" | "jpeg" => Ok(Self::Jpeg),
            _ => Err("Format PDFium supporté : png ou jpg.".to_string()),
        }
    }

    fn from_path(path: &Path) -> Option<Self> {
        path.extension()
            .and_then(|extension| extension.to_str())
            .and_then(|extension| Self::parse(extension).ok())
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
        }
    }
}

fn render_one(input: &Path, output: &Path, options: RenderOptions) -> Result<(), String> {
    let pdfium = load_pdfium()?;
    let document = load_document(&pdfium, input)?;
    ensure_page_count(page_count(&document)?)?;
    render_page(&document, input, output, options, options.page)?;
    println!("{}", output.display());
    Ok(())
}

fn render_all(input: &Path, output_dir: &Path, options: RenderOptions) -> Result<(), String> {
    let pdfium = load_pdfium()?;
    let document = load_document(&pdfium, input)?;
    let count = page_count(&document)?;
    ensure_page_count(count)?;
    fs::create_dir_all(output_dir)
        .map_err(|error| format!("Dossier de sortie PDFium inaccessible : {error}"))?;
    let width = count.to_string().len().max(3);
    let stem = safe_stem(input);
    for page in 1..=count {
        let output = output_dir.join(format!(
            "{stem}-page-{page:0width$}.{}",
            options.format.extension()
        ));
        render_page(&document, input, &output, options, page)?;
        println!("{}", output.display());
    }
    Ok(())
}

fn ensure_page_count(page_count: usize) -> Result<(), String> {
    if page_count == 0 {
        return Err("Ce PDF ne contient aucune page lisible.".to_string());
    }
    if page_count > MAX_PAGES {
        return Err(format!(
            "Ce PDF contient {page_count} pages. La limite actuelle est de {MAX_PAGES} pages pour éviter une conversion trop lourde."
        ));
    }
    Ok(())
}

fn page_count(document: &PdfDocument) -> Result<usize, String> {
    usize::try_from(document.pages().len()).map_err(|_| "Nombre de pages PDF invalide.".to_string())
}

fn render_page(
    document: &PdfDocument,
    input: &Path,
    output: &Path,
    options: RenderOptions,
    page_number: usize,
) -> Result<(), String> {
    let page_index = page_number - 1;
    let page = document.pages().get(page_index as i32).map_err(|_| {
        format!(
            "La page {page_number} est introuvable dans {}.",
            input.display()
        )
    })?;
    let target_width = ((page.width().value / 72.0) * f32::from(options.dpi))
        .round()
        .clamp(1.0, 20000.0) as i32;
    let image = page
        .render_with_config(
            &PdfRenderConfig::new()
                .set_target_width(target_width)
                .set_maximum_height(20000),
        )
        .map_err(|error| format!("PDFium ne peut pas rendre la page {page_number} : {error}"))?
        .as_image()
        .map_err(|error| format!("Image PDFium invalide pour la page {page_number} : {error}"))?;
    write_image(&image, output, options)?;
    Ok(())
}

fn write_image(image: &DynamicImage, output: &Path, options: RenderOptions) -> Result<(), String> {
    match options.format {
        OutputFormat::Png => image
            .save_with_format(output, ImageFormat::Png)
            .map_err(|error| format!("PDFium ne peut pas écrire l'image PNG : {error}")),
        OutputFormat::Jpeg => {
            let file = File::create(output)
                .map_err(|error| format!("PDFium ne peut pas créer l'image JPEG : {error}"))?;
            let mut encoder = JpegEncoder::new_with_quality(file, options.quality);
            encoder
                .encode_image(image)
                .map_err(|error| format!("PDFium ne peut pas écrire l'image JPEG : {error}"))
        }
    }
}

fn load_pdfium() -> Result<Pdfium, String> {
    let library = pdfium_library_path()?;
    let bindings = Pdfium::bind_to_library(&library).map_err(|error| {
        format!(
            "PDFium ne peut pas être chargé depuis {} : {error}",
            library.display()
        )
    })?;
    Ok(Pdfium::new(bindings))
}

fn load_document<'a>(pdfium: &'a Pdfium, input: &Path) -> Result<PdfDocument<'a>, String> {
    if !input.is_file() {
        return Err(format!("PDF introuvable : {}", input.display()));
    }
    pdfium
        .load_pdf_from_file(input, None)
        .map_err(|error| format!("PDFium ne peut pas ouvrir ce PDF. Il est peut-être protégé, corrompu ou non pris en charge : {error}"))
}

fn pdfium_library_path() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("PDFIUM_DLL_PATH") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "PDFIUM_DLL_PATH ne pointe pas vers un fichier : {}",
            path.display()
        ));
    }

    let exe_dir = env::current_exe()
        .map_err(|error| format!("Chemin du wrapper PDFium introuvable : {error}"))?
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Dossier du wrapper PDFium introuvable.".to_string())?;
    let candidate = exe_dir.join(Pdfium::pdfium_platform_library_name());
    if candidate.is_file() {
        return Ok(candidate);
    }
    Err(format!(
        "pdfium.dll est absent du dossier moteur : {}",
        candidate.display()
    ))
}

fn safe_stem(input: &Path) -> String {
    let stem = input
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("document");
    let sanitized = stem
        .chars()
        .map(|ch| {
            if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control()
            {
                '-'
            } else {
                ch
            }
        })
        .collect::<String>();
    if sanitized.trim().is_empty() {
        "document".to_string()
    } else {
        sanitized
    }
}
