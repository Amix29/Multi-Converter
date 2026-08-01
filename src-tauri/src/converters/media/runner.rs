use super::*;

pub(super) fn run_ffmpeg<T: AsRef<str>>(
    app: &AppHandle,
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    codec_args: &[T],
    options: FfmpegRunOptions<'_>,
) -> Result<()> {
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        input_path.to_string_lossy().to_string(),
    ];
    args.extend(codec_args.iter().map(|item| item.as_ref().to_string()));
    args.push("-threads".to_string());
    args.push(ffmpeg_threads(options.batch_concurrency));
    args.extend([
        "-progress".to_string(),
        "pipe:2".to_string(),
        "-nostats".to_string(),
    ]);
    args.push(output_path.to_string_lossy().to_string());
    emit_progress(app, job_id, 12, "Analyse du média");
    check_cancelled(job_id)?;

    let mut command = Command::new(ffmpeg_path(app)?);
    configure_child_process(&mut command);
    let mut child = command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| ConvertError::Message("FFmpeg n'a pas pu démarrer.".to_string()))?;
    let (line_sender, line_receiver) = mpsc::channel();
    let stderr_reader = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            if line_sender.send(line).is_err() {
                break;
            }
        }
    });

    let mut stderr_text = String::new();
    let mut duration_ms: Option<u64> = None;
    let mut last_progress = 12u8;
    let status = loop {
        if is_cancelled(job_id) {
            terminate_child_process(&mut child);
            let _ = stderr_reader.join();
            return Err(ConvertError::Message("Conversion annulée.".to_string()));
        }
        while let Ok(line) = line_receiver.try_recv() {
            handle_ffmpeg_progress_line(
                app,
                job_id,
                options,
                line?,
                &mut stderr_text,
                &mut duration_ms,
                &mut last_progress,
            );
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(error) => {
                terminate_child_process(&mut child);
                let _ = stderr_reader.join();
                return Err(error.into());
            }
        }
        match line_receiver.recv_timeout(Duration::from_millis(120)) {
            Ok(line) => handle_ffmpeg_progress_line(
                app,
                job_id,
                options,
                line?,
                &mut stderr_text,
                &mut duration_ms,
                &mut last_progress,
            ),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => {}
                Err(error) => {
                    terminate_child_process(&mut child);
                    let _ = stderr_reader.join();
                    return Err(error.into());
                }
            },
        }
    };
    let _ = stderr_reader.join();
    while let Ok(line) = line_receiver.try_recv() {
        handle_ffmpeg_progress_line(
            app,
            job_id,
            options,
            line?,
            &mut stderr_text,
            &mut duration_ms,
            &mut last_progress,
        );
    }

    check_cancelled(job_id)?;
    if status.success() {
        emit_progress(app, job_id, 96, options.phase_label);
        Ok(())
    } else {
        Err(ConvertError::Message(clean_ffmpeg_error(&stderr_text)))
    }
}

fn handle_ffmpeg_progress_line(
    app: &AppHandle,
    job_id: &str,
    options: FfmpegRunOptions<'_>,
    line: String,
    stderr_text: &mut String,
    duration_ms: &mut Option<u64>,
    last_progress: &mut u8,
) {
    append_limited_log(stderr_text, &line);
    if duration_ms.is_none() {
        *duration_ms = parse_ffmpeg_duration_ms(&line);
    }
    if let Some(out_time_ms) = parse_ffmpeg_out_time_ms(&line) {
        if let Some(duration) = duration_ms.filter(|value| *value > 0) {
            let progress = (12 + ((out_time_ms.min(duration) * 84) / duration) as u8).min(96);
            if progress > *last_progress {
                *last_progress = progress;
                emit_progress(app, job_id, progress, options.phase_label);
            }
        }
    } else if line.trim() == "progress=continue" && duration_ms.is_none() && *last_progress < 88 {
        *last_progress = (*last_progress).saturating_add(3).min(88);
        emit_progress(app, job_id, *last_progress, options.phase_label);
    }
}

fn parse_ffmpeg_duration_ms(line: &str) -> Option<u64> {
    let start = line.find("Duration: ")? + "Duration: ".len();
    let value = line.get(start..start + 11)?;
    parse_ffmpeg_time_ms(value)
}

fn parse_ffmpeg_out_time_ms(line: &str) -> Option<u64> {
    if let Some(value) = line.strip_prefix("out_time_ms=") {
        return value.trim().parse::<u64>().ok().map(|value| value / 1000);
    }
    line.strip_prefix("out_time=")
        .and_then(|value| parse_ffmpeg_time_ms(value.trim()))
}

fn parse_ffmpeg_time_ms(value: &str) -> Option<u64> {
    let mut parts = value.split(':');
    let hours = parts.next()?.parse::<u64>().ok()?;
    let minutes = parts.next()?.parse::<u64>().ok()?;
    let seconds = parts.next()?;
    let mut second_parts = seconds.split('.');
    let seconds = second_parts.next()?.parse::<u64>().ok()?;
    let millis = second_parts
        .next()
        .map(|fraction| {
            let padded = format!("{fraction:0<3}");
            padded.get(..3).unwrap_or("0").parse::<u64>().unwrap_or(0)
        })
        .unwrap_or(0);
    Some(((hours * 3600) + (minutes * 60) + seconds) * 1000 + millis)
}

fn clean_ffmpeg_error(stderr: &str) -> String {
    let lines: Vec<_> = stderr
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let tail = lines
        .iter()
        .rev()
        .take(5)
        .copied()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" ");
    if tail.is_empty() {
        "FFmpeg n'a pas pu convertir ce fichier.".to_string()
    } else {
        tail
    }
}

pub(in crate::converters) fn append_limited_log(buffer: &mut String, line: &str) {
    buffer.push_str(line);
    buffer.push('\n');
    if buffer.len() <= MAX_FFMPEG_PROGRESS_LOG_CHARS {
        return;
    }

    let tail_start = if buffer.is_ascii() {
        buffer.len() - MAX_FFMPEG_PROGRESS_LOG_CHARS
    } else {
        let character_count = buffer.chars().count();
        if character_count <= MAX_FFMPEG_PROGRESS_LOG_CHARS {
            return;
        }
        buffer
            .char_indices()
            .nth(character_count - MAX_FFMPEG_PROGRESS_LOG_CHARS)
            .map(|(index, _)| index)
            .unwrap_or_default()
    };
    let tail = buffer.split_off(tail_start);
    buffer.clear();
    buffer.push_str("[sortie tronquée]\n");
    buffer.push_str(&tail);
}
