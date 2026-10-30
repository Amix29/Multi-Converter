use super::matrices::{ffprobe_test_path, multilingual_source, run_ffmpeg_conversion};
use super::*;

#[test]
#[ignore = "full conversion matrix is run by npm run test:conversions"]
fn conversion_matrix_copy_retains_all_tracks_and_encoded_packets() {
    let directory = tempfile::tempdir().unwrap();
    let input = multilingual_source(directory.path());
    let source_bytes = fs::read(&input).unwrap();
    let output = directory.path().join("copied.mkv");
    let source_probe = packet_probe(&input);
    let args = media::remux::copy_arguments(&source_probe, "mkv").unwrap();
    assert!(media::remux::copy_arguments(&source_probe, "mp4").is_err());
    run_ffmpeg_conversion(&input, &output, args);
    let copied = packet_probe(&output);
    assert_eq!(copied["streams"].as_array().unwrap().len(), 4);
    assert_eq!(copied["chapters"][0]["tags"]["title"], "Chapter fixture");
    for index in 0..4 {
        let hashes = |probe: &serde_json::Value| -> Vec<String> {
            probe["packets"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|packet| packet["stream_index"] == index)
                .map(|packet| packet["data_hash"].as_str().unwrap().to_string())
                .collect()
        };
        assert_eq!(hashes(&source_probe), hashes(&copied));
    }
    let languages: Vec<_> = copied["streams"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|stream| stream["codec_type"] == "audio")
        .map(|stream| stream["tags"]["language"].as_str().unwrap())
        .collect();
    assert_eq!(languages, ["fra", "eng"]);
    assert_eq!(fs::read(input).unwrap(), source_bytes);
}

fn packet_probe(input: &Path) -> serde_json::Value {
    let output = Command::new(ffprobe_test_path())
        .args([
            "-v",
            "error",
            "-show_streams",
            "-show_packets",
            "-show_chapters",
            "-show_data_hash",
            "sha256",
            "-of",
            "json",
        ])
        .arg(input)
        .output()
        .unwrap();
    assert!(output.status.success());
    serde_json::from_slice(&output.stdout).unwrap()
}
