use image::{ImageFormat, Rgba, RgbaImage};
use std::path::Path;

pub fn save_color_image(path: &Path, color: Rgba<u8>) {
    RgbaImage::from_pixel(32, 32, color)
        .save_with_format(path, ImageFormat::Png)
        .unwrap();
}

pub fn mini_pdf_two_pages() -> Vec<u8> {
    let page_one = "BT /F1 18 Tf 40 110 Td (Page 1) Tj ET\n";
    let page_two = "BT /F1 18 Tf 40 110 Td (Page 2) Tj ET\n";
    build_pdf(&[
        "<< /Type /Catalog /Pages 2 0 R >>".into(),
        "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>".into(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".into(),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into(),
        format!(
            "<< /Length {} >>\nstream\n{page_one}endstream",
            page_one.len()
        ),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>".into(),
        format!(
            "<< /Length {} >>\nstream\n{page_two}endstream",
            page_two.len()
        ),
    ])
}

pub fn mini_pdf_two_text_objects() -> Vec<u8> {
    let content = "BT /F1 18 Tf 30 130 Td (First) Tj ET\nBT /F1 18 Tf 30 90 Td (Second) Tj ET\n";
    let objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".into(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".into(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".into(),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into(),
        format!(
            "<< /Length {} >>\nstream\n{content}endstream",
            content.len()
        ),
    ];
    build_pdf(&objects)
}

fn build_pdf(objects: &[String]) -> Vec<u8> {
    let mut output = b"%PDF-1.7\n".to_vec();
    let mut offsets = Vec::with_capacity(objects.len());
    for (index, object) in objects.iter().enumerate() {
        offsets.push(output.len());
        output.extend_from_slice(format!("{} 0 obj\n{object}\nendobj\n", index + 1).as_bytes());
    }
    let xref = output.len();
    output.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    output.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets {
        output.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    output.extend_from_slice(
        format!(
            "trailer << /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    output
}
