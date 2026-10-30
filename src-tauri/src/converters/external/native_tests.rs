use super::*;
use std::net::TcpListener;

#[test]
#[ignore = "native bundled engines are run by npm run test:conversions"]
fn conversion_matrix_libvips_orientation_and_jpeg_matte() {
    let directory = tempfile::tempdir().unwrap();
    let vips = engines::resolve_tool(None, "libvips").expect("bundled libvips");
    let transparent = directory.path().join("transparent.png");
    let oriented = directory.path().join("transparent.v");
    let jpeg = directory.path().join("white.jpg");
    ::image::RgbaImage::from_pixel(16, 32, ::image::Rgba([255, 0, 0, 0]))
        .save(&transparent)
        .unwrap();
    run(engine_command(&vips)
        .env("VIPS_CONCURRENCY", "1")
        .arg("autorot")
        .arg(&transparent)
        .arg(&oriented))
    .unwrap();
    run(engine_command(&vips)
        .env("VIPS_CONCURRENCY", "1")
        .arg("jpegsave")
        .arg(&oriented)
        .arg(&jpeg)
        .args(["--Q", "85", "--background", "255"]))
    .unwrap();
    let decoded = ::image::open(&jpeg).unwrap().into_rgb8();
    assert!(
        decoded
            .pixels()
            .all(|pixel| pixel.0.iter().all(|value| *value >= 250))
    );

    let rotated = directory.path().join("rotated.jpg");
    ::image::DynamicImage::new_rgb8(16, 32)
        .save(&rotated)
        .unwrap();
    let original = fs::read(&rotated).unwrap();
    let exif = b"Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0";
    let mut tagged = original[..2].to_vec();
    tagged.extend_from_slice(&[0xff, 0xe1]);
    tagged.extend_from_slice(&((exif.len() + 2) as u16).to_be_bytes());
    tagged.extend_from_slice(exif);
    tagged.extend_from_slice(&original[2..]);
    fs::write(&rotated, &tagged).unwrap();
    let output = directory.path().join("oriented.png");
    run(engine_command(&vips)
        .env("VIPS_CONCURRENCY", "1")
        .arg("autorot")
        .arg(&rotated)
        .arg(&output))
    .unwrap();
    let decoded = ::image::open(output).unwrap();
    assert_eq!((decoded.width(), decoded.height()), (32, 16));
    assert_eq!(fs::read(rotated).unwrap(), tagged);
}

#[test]
#[ignore = "native bundled engines are run by npm run test:conversions"]
fn conversion_matrix_pandoc_resources_are_local_and_embedded() {
    let temp = tempfile::tempdir().unwrap();
    let staging = temp.path().join("staging");
    fs::create_dir(&staging).unwrap();
    let pandoc = engines::resolve_tool(None, "pandoc").expect("bundled Pandoc");
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let remote = format!("http://{}/pixel.png", listener.local_addr().unwrap());
    let input = temp.path().join("document.html");
    fs::write(
        &input,
        format!("<p>Local fixture</p><img src=\"{remote}\">"),
    )
    .unwrap();
    let original = fs::read(&input).unwrap();
    assert!(prepare_local_input(&pandoc, &input, &staging, run).is_err());
    assert!(
        listener.accept().is_err(),
        "preparation must not fetch a remote image"
    );
    assert_eq!(fs::read(&input).unwrap(), original);

    ::image::DynamicImage::new_rgba8(8, 8)
        .save(temp.path().join("pixel.png"))
        .unwrap();
    fs::write(&input, "<p>Local fixture</p><img src=\"pixel.png\">").unwrap();
    let original = fs::read(&input).unwrap();
    let ast = prepare_local_input(&pandoc, &input, &staging, run).unwrap();
    for extension in ["odt", "docx"] {
        let output = temp.path().join(format!("output.{extension}"));
        run(engine_command(&pandoc)
            .args(["--sandbox", "--fail-if-warnings"])
            .arg(&ast)
            .arg("-o")
            .arg(&output))
        .unwrap();
        let archive = zip::ZipArchive::new(File::open(output).unwrap()).unwrap();
        assert!(
            archive
                .file_names()
                .any(|name| name.unwrap().ends_with(".png")),
            "local image must be embedded in {extension}"
        );
    }
    assert_eq!(fs::read(input).unwrap(), original);
    assert!(
        listener.accept().is_err(),
        "no native conversion may fetch the remote image"
    );
}

fn run(command: &mut Command) -> Result<()> {
    let output = run_command_bounded(command, Duration::from_secs(30)).unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(())
}
