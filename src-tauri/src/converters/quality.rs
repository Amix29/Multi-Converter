use super::QualityProfile;

impl QualityProfile {
    pub(super) fn jpeg_quality(self) -> u8 {
        match self {
            Self::Compact => 70,
            Self::Balanced => 85,
            Self::High => 95,
        }
    }

    pub(super) fn pdf_dpi(self) -> &'static str {
        match self {
            Self::Compact => "150",
            Self::Balanced => "220",
            Self::High => "300",
        }
    }
}

pub(super) fn audio_arguments(
    mut args: Vec<String>,
    target: &str,
    quality: QualityProfile,
) -> Vec<String> {
    if !matches!(
        target,
        "mp3" | "m4a" | "ogg" | "wma" | "opus" | "ac3" | "aac" | "mp2"
    ) {
        return args;
    }
    let compact = quality == QualityProfile::Compact;
    let high = quality == QualityProfile::High;
    if target == "mp3" {
        replace_option(
            &mut args,
            "-q:a",
            if compact {
                "5"
            } else if high {
                "0"
            } else {
                "2"
            },
        );
    } else if target == "ogg" {
        replace_option(
            &mut args,
            "-q:a",
            if compact {
                "3"
            } else if high {
                "7"
            } else {
                "5"
            },
        );
    } else {
        let bitrate = match (target, quality) {
            ("ac3", QualityProfile::Compact) => "192k",
            ("ac3", QualityProfile::High) => "640k",
            ("opus", QualityProfile::Compact) => "64k",
            ("opus", QualityProfile::High) => "192k",
            ("mp2", QualityProfile::Compact) => "128k",
            ("mp2", QualityProfile::High) => "256k",
            (_, QualityProfile::Compact) => "96k",
            (_, QualityProfile::High) => "256k",
            _ => return args,
        };
        replace_option(&mut args, "-b:a", bitrate);
    }
    args
}

pub(super) fn video_arguments(mut args: Vec<String>, quality: QualityProfile) -> Vec<String> {
    let compact = quality == QualityProfile::Compact;
    let high = quality == QualityProfile::High;
    if let Some(index) = args.iter().position(|arg| arg == "-crf") {
        let vp9 = args.iter().any(|arg| arg == "libvpx-vp9");
        let crf = match (vp9, quality) {
            (true, QualityProfile::Compact) => "38",
            (true, QualityProfile::Balanced) => "32",
            (true, QualityProfile::High) => "24",
            (false, QualityProfile::Compact) => "28",
            (false, QualityProfile::Balanced) => "23",
            (false, QualityProfile::High) => "18",
        };
        args[index + 1] = crf.to_string();
    }
    if quality != QualityProfile::Balanced {
        for flag in ["-b:v", "-maxrate", "-bufsize"] {
            if let Some(index) = args.iter().position(|arg| arg == flag)
                && let Some(bits) = args.get(index + 1).and_then(|value| parse_bitrate(value))
                && bits > 0
            {
                let adjusted = if compact {
                    bits / 2
                } else {
                    bits.saturating_mul(2)
                };
                args[index + 1] = adjusted.to_string();
            }
        }
        replace_option(&mut args, "-q:v", if compact { "8" } else { "2" });
    }
    replace_option(
        &mut args,
        "-b:a",
        if compact {
            "96k"
        } else if high {
            "256k"
        } else {
            "160k"
        },
    );
    args
}

fn replace_option(args: &mut [String], flag: &str, value: &str) {
    if let Some(index) = args.iter().position(|arg| arg == flag)
        && let Some(argument) = args.get_mut(index + 1)
    {
        *argument = value.to_string();
    }
}

fn parse_bitrate(value: &str) -> Option<u64> {
    if let Some(value) = value.strip_suffix('M') {
        return value.parse::<u64>().ok()?.checked_mul(1_000_000);
    }
    if let Some(value) = value.strip_suffix('k') {
        return value.parse::<u64>().ok()?.checked_mul(1_000);
    }
    value.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lossless_audio_parameters_are_unchanged_by_profiles() {
        let args = ["-vn", "-codec:a", "flac"].map(String::from).to_vec();
        assert_eq!(
            audio_arguments(args.clone(), "flac", QualityProfile::Compact),
            args
        );
    }

    #[test]
    fn vp9_quality_keeps_zero_bitrate_instead_of_inventing_a_rate_limit() {
        let args = ["-codec:v", "libvpx-vp9", "-b:v", "0", "-crf", "32"]
            .map(String::from)
            .to_vec();
        let high = video_arguments(args, QualityProfile::High);
        assert_eq!(high[3], "0");
        assert_eq!(high[5], "24");
    }
}
