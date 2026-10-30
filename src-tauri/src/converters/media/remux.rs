use super::*;
use serde_json::Value;

pub(in crate::converters) fn copy_streams(
    app: &AppHandle,
    job_id: &str,
    input: &Path,
    output: &Path,
    target: &str,
) -> Result<()> {
    let probe = streams::probe(app, input)?;
    let args = copy_arguments(&probe, target)?;
    run_ffmpeg(
        app,
        job_id,
        input,
        output,
        &args,
        FfmpegRunOptions {
            phase_label: "Copie des flux sans recompression",
            batch_concurrency: 1,
        },
    )
}

pub(in crate::converters) fn copy_arguments(probe: &Value, target: &str) -> Result<Vec<String>> {
    let streams = probe["streams"]
        .as_array()
        .filter(|items| !items.is_empty())
        .ok_or_else(|| {
            ConvertError::Message("Le média ne contient aucune piste copiable.".to_string())
        })?;
    if !streams.iter().any(|stream| {
        stream["codec_type"] == "video" && stream["disposition"]["attached_pic"].as_u64() != Some(1)
    }) {
        return Err(ConvertError::Message(
            "La copie vers un conteneur vidéo exige une piste vidéo.".to_string(),
        ));
    }
    for stream in streams {
        let kind = stream["codec_type"].as_str().unwrap_or("");
        let codec = stream["codec_name"].as_str().unwrap_or("");
        if !compatible(target, kind, codec) {
            return Err(ConvertError::Message(format!(
                "Une piste ({kind}, {codec}) ne peut pas être copiée dans ce conteneur. Choisissez MKV ou le mode Réencoder. Aucune piste n’a été supprimée et aucun réencodage automatique n’a été effectué."
            )));
        }
    }
    Ok(owned_args(&[
        "-map",
        "0",
        "-map_metadata",
        "0",
        "-map_chapters",
        "0",
        "-codec",
        "copy",
    ]))
}

fn compatible(target: &str, kind: &str, codec: &str) -> bool {
    match (target, kind) {
        ("mp4" | "mov", "video") => matches!(codec, "h264" | "hevc"),
        ("mp4" | "mov", "audio") => matches!(codec, "aac" | "alac"),
        ("mp4" | "mov", "subtitle") => codec == "mov_text",
        ("webm", "video") => matches!(codec, "vp8" | "vp9" | "av1"),
        ("webm", "audio") => matches!(codec, "vorbis" | "opus"),
        ("webm", "subtitle") => codec == "webvtt",
        ("mkv", "video") => matches!(
            codec,
            "h264" | "hevc" | "av1" | "vp8" | "vp9" | "mpeg4" | "mpeg2video" | "ffv1" | "mjpeg"
        ),
        ("mkv", "audio") => matches!(
            codec,
            "aac"
                | "alac"
                | "mp3"
                | "mp2"
                | "ac3"
                | "eac3"
                | "flac"
                | "vorbis"
                | "opus"
                | "pcm_s16le"
                | "pcm_s24le"
                | "pcm_s32le"
                | "pcm_f32le"
                | "truehd"
        ),
        ("mkv", "subtitle") => matches!(
            codec,
            "subrip" | "ass" | "ssa" | "webvtt" | "dvd_subtitle" | "hdmv_pgs_subtitle"
        ),
        ("mkv", "attachment") => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_checks_every_track_and_never_falls_back_to_reencoding() {
        let source = serde_json::json!({"streams": [
            {"codec_type":"video", "codec_name":"h264", "color_transfer":"smpte2084"},
            {"codec_type":"audio", "codec_name":"aac"},
            {"codec_type":"audio", "codec_name":"aac"},
            {"codec_type":"subtitle", "codec_name":"subrip"}
        ]});
        assert!(copy_arguments(&source, "mp4").is_err());
        assert!(copy_arguments(&source, "webm").is_err());
        assert!(copy_arguments(&source, "avi").is_err());
        assert!(
            copy_arguments(&source, "mkv")
                .unwrap()
                .windows(2)
                .any(|pair| pair == ["-codec", "copy"])
        );
        let unsupported = serde_json::json!({"streams":[
            {"codec_type":"video", "codec_name":"h264"}, {"codec_type":"data", "codec_name":"bin_data"}
        ]});
        assert!(copy_arguments(&unsupported, "mkv").is_err());
    }
}
