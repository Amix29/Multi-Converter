fn main() {
    let args: Vec<_> = std::env::args().collect();
    let source = oar_ocr::utils::load_image(&args[1]).expect("input image");
    if args.len() == 4 {
        let coordinates: [[f32; 2]; 4] = serde_json::from_str(&args[2]).expect("quadrilateral");
        let points: Vec<_> = coordinates
            .into_iter()
            .map(|[x, y]| oar_ocr::processors::Point::new(x, y))
            .collect();
        let result = oar_ocr::utils::get_rotate_crop_image(&source, &points).expect("crop");
        result.save(&args[3]).expect("output crop");
        return;
    }
    assert_eq!(args.len(), 5);
    let result = oar_ocr::utils::image::opencv_resize_linear_rgb(
        &source,
        args[2].parse().expect("width"),
        args[3].parse().expect("height"),
    );
    result.save(&args[4]).expect("output image");
}
