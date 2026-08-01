use super::*;

mod runner;

#[cfg(test)]
pub(in crate::converters) use runner::append_limited_log;
use runner::run_ffmpeg;

#[derive(Clone, Copy)]
struct FfmpegRunOptions<'a> {
    phase_label: &'a str,
    batch_concurrency: usize,
}
pub(in crate::converters) fn ffmpeg_path(app: &AppHandle) -> Result<PathBuf> {
    engines::resolve_tool(Some(app), "ffmpeg").ok_or_else(|| {
        ConvertError::Message(
            "FFmpeg embarqué est introuvable. Réinstallez Multi-Converter ou relancez le build avec les binaires de base.".to_string(),
        )
    })
}

pub(in crate::converters) fn ffmpeg_threads(batch_concurrency: usize) -> String {
    let cores = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(2);
    if batch_concurrency <= 1 {
        "0".to_string()
    } else {
        std::cmp::max(1, cores / batch_concurrency).to_string()
    }
}

pub(in crate::converters) fn x264_preset() -> &'static str {
    "veryfast"
}

pub(in crate::converters) fn convert_audio(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
    batch_concurrency: usize,
) -> Result<()> {
    let args = audio_args(target_format)?;
    run_ffmpeg(
        app,
        job_id,
        input_path,
        output_path,
        &args,
        FfmpegRunOptions {
            phase_label: "Conversion audio",
            batch_concurrency,
        },
    )
}

pub(in crate::converters) fn audio_args(target_format: &str) -> Result<Vec<&'static str>> {
    Ok(match target_format {
        "mp3" => vec!["-vn", "-codec:a", "libmp3lame", "-q:a", "2"],
        "m4a" => vec!["-vn", "-codec:a", "aac", "-b:a", "192k"],
        "flac" => vec!["-vn", "-codec:a", "flac"],
        "wav" => vec!["-vn", "-codec:a", "pcm_s16le"],
        "ogg" => vec!["-vn", "-codec:a", "libvorbis", "-q:a", "5"],
        "wma" => vec!["-vn", "-codec:a", "wmav2", "-b:a", "192k"],
        "opus" => vec!["-vn", "-codec:a", "libopus", "-b:a", "128k"],
        "aiff" => vec!["-vn", "-codec:a", "pcm_s16be"],
        "alac" => vec!["-vn", "-codec:a", "alac", "-f", "ipod"],
        "ac3" => vec!["-vn", "-codec:a", "ac3", "-b:a", "448k"],
        "mp2" => vec![
            "-vn", "-ar", "44100", "-ac", "2", "-codec:a", "mp2", "-b:a", "192k",
        ],
        "amr" => vec![
            "-vn",
            "-ar",
            "8000",
            "-ac",
            "1",
            "-codec:a",
            "libopencore_amrnb",
            "-f",
            "amr",
        ],
        "au" => vec!["-vn", "-codec:a", "pcm_s16be", "-f", "au"],
        "caf" => vec!["-vn", "-codec:a", "pcm_s16be", "-f", "caf"],
        _ => {
            return Err(ConvertError::Message(format!(
                "Format audio {} non supporté par le moteur intégré.",
                target_format.to_uppercase()
            )));
        }
    })
}

pub(in crate::converters) fn convert_video(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    target_format: &str,
    batch_concurrency: usize,
) -> Result<()> {
    let mut gpu_attempted = false;
    for args in gpu_video_args(app, target_format) {
        gpu_attempted = true;
        check_cancelled(job_id)?;
        if run_ffmpeg(
            app,
            job_id,
            input_path,
            output_path,
            &args,
            FfmpegRunOptions {
                phase_label: "Conversion vidéo",
                batch_concurrency,
            },
        )
        .is_ok()
        {
            return Ok(());
        }
        let _ = fs::remove_file(output_path);
    }
    if gpu_attempted {
        emit_progress(
            app,
            job_id,
            18,
            "Accélération GPU indisponible, fallback CPU",
        );
    }

    let args = cpu_video_args(target_format)?;
    run_ffmpeg(
        app,
        job_id,
        input_path,
        output_path,
        &args,
        FfmpegRunOptions {
            phase_label: "Conversion vidéo",
            batch_concurrency,
        },
    )
}

pub(in crate::converters) fn cpu_video_args(target_format: &str) -> Result<Vec<String>> {
    Ok(match target_format {
        "mp4" => owned_args(&[
            "-codec:v",
            "libx264",
            "-preset",
            x264_preset(),
            "-crf",
            "23",
            "-codec:a",
            "aac",
            "-b:a",
            "160k",
        ]),
        "mkv" => owned_args(&[
            "-codec:v",
            "libx264",
            "-preset",
            x264_preset(),
            "-crf",
            "23",
            "-codec:a",
            "aac",
            "-b:a",
            "160k",
        ]),
        "webm" => owned_args(&[
            "-codec:v",
            "libvpx-vp9",
            "-b:v",
            "0",
            "-crf",
            "32",
            "-codec:a",
            "libopus",
            "-b:a",
            "128k",
        ]),
        "mov" => owned_args(&[
            "-codec:v",
            "libx264",
            "-preset",
            x264_preset(),
            "-crf",
            "23",
            "-codec:a",
            "aac",
            "-b:a",
            "160k",
        ]),
        "avi" => owned_args(&[
            "-codec:v", "mpeg4", "-q:v", "5", "-codec:a", "mp3", "-b:a", "160k",
        ]),
        "wmv" => owned_args(&[
            "-vf",
            wmv_compatibility_scale_filter(),
            "-codec:v",
            "wmv2",
            "-b:v",
            "3500k",
            "-maxrate",
            "5000k",
            "-bufsize",
            "10000k",
            "-codec:a",
            "wmav2",
            "-b:a",
            "160k",
        ]),
        "3gp" => owned_args(&[
            "-s", "640x360", "-codec:v", "mpeg4", "-codec:a", "aac", "-b:a", "96k",
        ]),
        "mts" => owned_args(&[
            "-codec:v",
            "libx264",
            "-preset",
            x264_preset(),
            "-crf",
            "23",
            "-codec:a",
            "aac",
            "-f",
            "mpegts",
        ]),
        "mpeg2" => owned_args(&[
            "-codec:v",
            "mpeg2video",
            "-q:v",
            "3",
            "-codec:a",
            "mp2",
            "-b:a",
            "192k",
        ]),
        "ogv" => owned_args(&[
            "-codec:v",
            "libtheora",
            "-q:v",
            "7",
            "-codec:a",
            "libvorbis",
            "-q:a",
            "5",
        ]),
        _ => {
            return Err(ConvertError::Message(format!(
                "Format vidéo {} non supporté par le moteur intégré.",
                target_format.to_uppercase()
            )));
        }
    })
}

pub(in crate::converters) fn gpu_video_args(
    app: &AppHandle,
    target_format: &str,
) -> Vec<Vec<String>> {
    if !matches!(target_format, "mp4" | "mkv" | "mov" | "mts") {
        return Vec::new();
    }

    ["h264_nvenc", "h264_qsv", "h264_amf"]
        .into_iter()
        .filter(|encoder| ffmpeg_supports_encoder(app, encoder))
        .map(|encoder| gpu_h264_args(target_format, encoder))
        .collect()
}

pub(in crate::converters) fn wmv_compatibility_scale_filter() -> &'static str {
    "scale=w=trunc(min(1920\\,iw)/2)*2:h=trunc(min(1080\\,ih)/2)*2:force_original_aspect_ratio=decrease"
}

pub(in crate::converters) fn gpu_h264_args(target_format: &str, encoder: &str) -> Vec<String> {
    let mut args = owned_args(&[
        "-codec:v", encoder, "-b:v", "8M", "-maxrate", "12M", "-bufsize", "16M",
    ]);

    match target_format {
        "mts" => args.extend(owned_args(&[
            "-codec:a", "aac", "-b:a", "192k", "-f", "mpegts",
        ])),
        _ => args.extend(owned_args(&["-codec:a", "aac", "-b:a", "192k"])),
    }

    args
}

pub(in crate::converters) fn ffmpeg_supports_encoder(app: &AppHandle, encoder: &str) -> bool {
    let Ok(ffmpeg) = ffmpeg_path(app) else {
        return false;
    };
    let mut command = Command::new(ffmpeg);
    command.args(["-hide_banner", "-encoders"]);
    run_command_bounded(&mut command, Duration::from_secs(10))
        .ok()
        .is_some_and(|output| String::from_utf8_lossy(&output.stdout).contains(encoder))
}

pub(in crate::converters) fn owned_args(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| item.to_string()).collect()
}
