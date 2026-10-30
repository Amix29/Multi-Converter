"""Bounded synthetic CPU/VideoToolbox comparison; no hardware-selection policy."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument("--ffmpeg", required=True)
parser.add_argument("--output-dir", required=True)
args = parser.parse_args()
root = Path(args.output_dir).resolve()
root.mkdir(exist_ok=True)
for name in ["quality-source.mkv", "libx264.mp4", "h264_videotoolbox.mp4", "video-quality.json"]:
    if (root / name).exists():
        raise RuntimeError("Refusing to overwrite an existing benchmark artifact")


def run(arguments):
    started = time.monotonic()
    result = subprocess.run([args.ffmpeg, "-v", "info", "-y"] + [str(arg) for arg in arguments],
                            cwd=root, capture_output=True, timeout=120)
    return result, round((time.monotonic() - started) * 1000)


source = root / "quality-source.mkv"
result, _ = run(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=4",
                 "-c:v", "ffv1", source])
assert result.returncode == 0
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
report = {"fixture": "synthetic-testsrc2-1080p30-4s", "sourceSha256": source_hash, "runs": [],
          "scope": "one synthetic host fixture; no universal quality/speed parity"}
for encoder, options in [
    ("libx264", ["-preset", "veryfast", "-crf", "23"]),
    ("h264_videotoolbox", ["-allow_sw", "0", "-b:v", "8M", "-maxrate", "12M", "-bufsize", "16M"]),
]:
    output = root / (encoder + ".mp4")
    result, elapsed = run(["-protocol_whitelist", "file,pipe", "-i", source, "-c:v", encoder] + options + [output])
    row = {"encoder": encoder, "durationMs": elapsed, "available": result.returncode == 0}
    if result.returncode == 0:
        row["bytes"] = output.stat().st_size
        comparison, _ = run(["-i", source, "-i", output, "-lavfi", "ssim", "-f", "null", "-"])
        assert comparison.returncode == 0
        row["ssim"] = next(line.strip().split("]")[-1].strip() for line in comparison.stderr.decode().splitlines() if "SSIM Y:" in line)
    else:
        row["error"] = "Encoder probe failed; inspect locally before enabling."
    report["runs"].append(row)
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
report["sourceUnchanged"] = True
(root / "video-quality.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
