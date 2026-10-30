use super::*;
use serde_json::Value;
pub(in crate::converters) const INPUT_PROTOCOLS: &str = "file,pipe";

pub(super) fn primary_video_arguments() -> Vec<String> {
    owned_args(&["-map", "0:V:0?", "-map", "0:a:0?", "-sn", "-dn"])
}

pub(in crate::converters) fn source_warnings(
    app: &AppHandle,
    input: &Path,
    video: bool,
) -> Result<Vec<ConversionWarning>> {
    let ffprobe = engines::resolve_tool(Some(app), "ffprobe").ok_or_else(|| {
        ConvertError::Message("ffprobe est requis pour vérifier les pistes du média.".to_string())
    })?;
    let mut command = Command::new(ffprobe);
    command
        .args([
            "-v",
            "error",
            "-protocol_whitelist",
            INPUT_PROTOCOLS,
            "-show_entries",
            "stream=codec_type,color_transfer:stream_disposition=attached_pic",
            "-of",
            "json",
        ])
        .arg(input.canonicalize()?);
    let output = run_command_bounded(&mut command, Duration::from_secs(30)).map_err(|_| {
        ConvertError::Message("L’analyse des pistes du média n’a pas abouti.".to_string())
    })?;
    if !output.status.success() {
        return Err(ConvertError::Message(
            "Le média ne peut pas être analysé par ffprobe.".to_string(),
        ));
    }
    inspect(&serde_json::from_slice(&output.stdout)?, video)
}

fn inspect(probe: &Value, video: bool) -> Result<Vec<ConversionWarning>> {
    let streams = probe["streams"].as_array().ok_or_else(|| {
        ConvertError::Message("La liste des pistes du média est invalide.".to_string())
    })?;
    let mut videos = 0;
    let mut audios = 0;
    let mut other = 0;
    for stream in streams {
        match stream["codec_type"].as_str() {
            Some("video") if stream["disposition"]["attached_pic"].as_u64() != Some(1) => {
                videos += 1;
                if video
                    && matches!(
                        stream["color_transfer"].as_str(),
                        Some("smpte2084" | "arib-std-b67")
                    )
                {
                    return Err(ConvertError::Message(
                        "Ce média HDR nécessite une conversion de couleurs dédiée, qui n’est pas encore proposée. La conversion est arrêtée pour éviter un rendu altéré.".to_string()));
                }
            }
            Some("audio") => audios += 1,
            _ => other += 1,
        }
    }
    if audios > 1 || (video && videos > 1) || other > 0 {
        return Ok(vec![ConversionWarning {
            code: "media-primary-streams".to_string(),
            message: "Seules la première piste audio et, pour une vidéo, la première piste vidéo sont conservées. Les pistes supplémentaires, sous-titres et pièces jointes sont exclus.".to_string(),
            page_number: None,
        }]);
    }
    Ok(vec![])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extra_languages_subtitles_and_covers_are_not_discarded_silently() {
        let probe = serde_json::json!({"streams":[
            {"codec_type":"video"},{"codec_type":"audio"},{"codec_type":"audio"},
            {"codec_type":"subtitle"},{"codec_type":"attachment"}]});
        assert_eq!(
            inspect(&probe, true).unwrap()[0].code,
            "media-primary-streams"
        );
        let cover = serde_json::json!({"streams":[{"codec_type":"audio"},
            {"codec_type":"video","disposition":{"attached_pic":1}}]});
        assert_eq!(inspect(&cover, false).unwrap().len(), 1);
    }

    #[test]
    fn hdr_reencoding_is_refused_but_audio_extraction_remains_available() {
        let hdr = serde_json::json!({"streams":[{"codec_type":"video","color_transfer":"smpte2084"},{"codec_type":"audio"}]});
        assert!(inspect(&hdr, true).is_err());
        assert!(inspect(&hdr, false).is_ok());
        let sdr = serde_json::json!({"streams":[{"codec_type":"video"},{"codec_type":"audio"}]});
        assert!(inspect(&sdr, true).unwrap().is_empty());
    }
}
