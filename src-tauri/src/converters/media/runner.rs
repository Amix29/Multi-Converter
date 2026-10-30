use super::*;

const MAX_ENGINE_SILENCE: Duration = Duration::from_secs(15 * 60);

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
        "-protocol_whitelist".to_string(),
        INPUT_PROTOCOLS.to_string(),
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
    let mut child = crate::process_support::ManagedChild::new(
        command
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()?,
    );
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| ConvertError::Message("FFmpeg n'a pas pu démarrer.".to_string()))?;
    let (line_sender, line_receiver) = mpsc::sync_channel(128);
    let stderr_reader = std::thread::spawn(move || {
        stream_stderr_chunks(stderr, line_sender);
    });

    let mut stderr_text = String::new();
    let mut duration_ms: Option<u64> = None;
    let mut last_progress = 12u8;
    let mut last_activity = std::time::Instant::now();
    let status = loop {
        if is_cancelled(job_id) {
            terminate_child_process(&mut child);
            drop(line_receiver);
            let _ = stderr_reader.join();
            return Err(ConvertError::Message("Conversion annulée.".to_string()));
        }
        for _ in 0..128 {
            let Ok(line) = line_receiver.try_recv() else {
                break;
            };
            last_activity = std::time::Instant::now();
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
        if last_activity.elapsed() > MAX_ENGINE_SILENCE {
            terminate_child_process(&mut child);
            drop(line_receiver);
            let _ = stderr_reader.join();
            return Err(ConvertError::Message(
                "Le moteur média ne répond plus. Vous pouvez réessayer la conversion.".to_string(),
            ));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(error) => {
                terminate_child_process(&mut child);
                drop(line_receiver);
                let _ = stderr_reader.join();
                return Err(error.into());
            }
        }
        match line_receiver.recv_timeout(Duration::from_millis(120)) {
            Ok(line) => {
                last_activity = std::time::Instant::now();
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
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => {}
                Err(error) => {
                    terminate_child_process(&mut child);
                    drop(line_receiver);
                    let _ = stderr_reader.join();
                    return Err(error.into());
                }
            },
        }
    };
    // Drain a bounded channel before joining so a full stderr buffer cannot deadlock.
    let drain_started = std::time::Instant::now();
    while !stderr_reader.is_finished() && drain_started.elapsed() < Duration::from_secs(2) {
        if let Ok(line) = line_receiver.recv_timeout(Duration::from_millis(20)) {
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
    }
    if stderr_reader.is_finished() {
        let _ = stderr_reader.join();
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

    check_cancelled(job_id)?;
    if status.success() {
        emit_progress(app, job_id, 96, options.phase_label);
        Ok(())
    } else {
        Err(ConvertError::Message(clean_ffmpeg_error(&stderr_text)))
    }
}

fn stream_stderr_chunks(stream: impl Read, sender: mpsc::SyncSender<std::io::Result<String>>) {
    let mut reader = BufReader::new(stream);
    loop {
        let mut bytes = Vec::with_capacity(4096);
        match reader.by_ref().take(4096).read_until(b'\n', &mut bytes) {
            Ok(0) => break,
            Ok(_) => {
                if sender
                    .send(Ok(String::from_utf8_lossy(&bytes).into_owned()))
                    .is_err()
                {
                    break;
                }
            }
            Err(error) => {
                let _ = sender.send(Err(error));
                break;
            }
        }
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
    if let Some(out_time_ms) = parse_ffmpeg_out_time_ms(&line)
        && let Some(duration) = duration_ms.filter(|value| *value > 0)
    {
        let progress = (12 + ((out_time_ms.min(duration) * 84) / duration) as u8).min(96);
        if progress > *last_progress {
            *last_progress = progress;
            emit_progress(app, job_id, progress, options.phase_label);
        }
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

#[cfg(test)]
mod bounded_stderr_tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn oversized_and_non_utf8_stderr_is_bounded_and_drained() {
        let mut bytes = vec![b'x'; 1024 * 1024];
        bytes.push(0xff);
        let (sender, receiver) = mpsc::sync_channel(2);
        let producer = std::thread::spawn(move || stream_stderr_chunks(Cursor::new(bytes), sender));
        let mut chunks = 0;
        let mut replacement_seen = false;
        for line in receiver {
            let text = line.unwrap();
            assert!(text.len() <= 4096 * 3);
            replacement_seen |= text.contains('\u{fffd}');
            chunks += 1;
        }
        producer.join().unwrap();
        assert!(chunks > 250);
        assert!(replacement_seen);
    }

    #[test]
    fn dropping_the_consumer_unblocks_a_full_stderr_queue() {
        let (sender, receiver) = mpsc::sync_channel(1);
        let producer = std::thread::spawn(move || {
            stream_stderr_chunks(Cursor::new(vec![b'x'; 65536]), sender)
        });
        receiver.recv().unwrap().unwrap();
        drop(receiver);
        producer.join().unwrap();
    }
}
