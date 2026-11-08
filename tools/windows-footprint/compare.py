"""Compare native Windows engines from two unpacked/installed copies on the same host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import statistics
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument("--baseline", required=True, type=Path)
parser.add_argument("--installed", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--pairs", type=int, default=8)
args = parser.parse_args()
if args.pairs < 1:
    parser.error("--pairs must be positive")
args.output.mkdir(parents=True, exist_ok=False)
fixtures = Path(__file__).resolve().parents[2] / "tests/fixtures/ocr/phase-6"
sides = {"baseline": args.baseline.resolve(), "installed": args.installed.resolve()}
source = args.output / "sample.html"
source.write_text("<meta charset=utf-8><h1>Été à Tokyo</h1><p>Document de comparaison.</p>", encoding="utf8")
timings = {}
checks = {}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def exercise(side, round_id):
    root = sides[side]
    out = args.output / f"{side}-{round_id}"
    out.mkdir()
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    pdfium = next((root / "engines/pdfium/compatible/bin").glob("pdfium-render*.exe"))
    image = fixtures / "clean-fr.png"

    def run(label, command, payload=None):
        started = time.perf_counter_ns()
        result = subprocess.run(command, input=payload, capture_output=True, check=True,
                                env=env, timeout=120, creationflags=subprocess.CREATE_NO_WINDOW)
        if label:
            elapsed = (time.perf_counter_ns() - started) / 1e6
            timings.setdefault(label, {}).setdefault(side, []).append(elapsed)
        return result.stdout

    def record(label, data):
        value = digest(data)
        if label in checks and checks[label] != value:
            raise ValueError(f"{side} {round_id}: {label} output changed")
        checks[label] = value

    media = out / "media.flac"
    run("ffmpeg-audio", [root / "ffmpeg.exe", "-v", "error", "-f", "lavfi", "-i",
                         "sine=frequency=853:duration=8", "-c:a", "flac", media])
    record("flac", media.read_bytes())
    record("ffprobe", run("ffprobe", [root / "ffprobe.exe", "-v", "error", "-show_streams",
                                      "-of", "json", media]))
    record("pandoc", run("pandoc", [root / "engines/pandoc/compatible/bin/pandoc.exe",
                                    "-f", "html", "-t", "gfm", source]))
    raster = out / "image.png"
    run("libvips", [root / "engines/libvips/compatible/bin/vips.exe", "resize", image, raster, "0.75"])
    record("resized-png", raster.read_bytes())
    inspection = out / "inspection.json"
    run("pdfium", [pdfium, "--inspect-text", fixtures / "pdf-native.pdf", inspection])
    record("pdf-text", inspection.read_bytes())
    profile = (args.output / f"office-{side}").resolve().as_uri()
    run("libreoffice", [root / "engines/libreoffice/compatible/program/soffice.com",
                        f"-env:UserInstallation={profile}", "--headless", "--convert-to", "pdf",
                        "--outdir", out, source])
    rendered = out / "page.png"
    run(None, [pdfium, "--render", out / "sample.pdf", rendered, "--page", "1",
               "--format", "png", "--dpi", "150"])
    record("office-rendered-page", rendered.read_bytes())
    ocr = out / "ocr.json"
    request = {"schemaVersion": 1, "jobId": "benchmark", "input": str(image), "output": str(ocr.resolve())}
    ocr_root = root / "ocr/native-v1" if (root / "ocr/native-v1").is_dir() else root / "ocr"
    output = run("ocr-start-and-recognize", [ocr_root / "runtime/windows-x64/ocr-worker.exe",
                 "--serve", "--models", ocr_root / "models", "--provider", "cpu"],
                 (json.dumps(request) + "\n").encode())
    replies = [json.loads(line) for line in output.splitlines()]
    if [entry["type"] for entry in replies] != ["ready", "completed"]:
        raise ValueError(replies)
    text = json.loads(ocr.read_text(encoding="utf8"))["text"].strip()
    if not text:
        raise ValueError("Empty recognition")
    record("recognized-text", text.encode())

for side in sides:
    exercise(side, "warmup")
warmup = dict(timings)
timings.clear()
for iteration in range(args.pairs):
    for side in (["baseline", "installed"] if iteration % 2 == 0 else ["installed", "baseline"]):
        exercise(side, iteration)
    print(f"Pair {iteration + 1} complete", flush=True)

summary = {}
for name, values in timings.items():
    medians = {s: round(statistics.median(v), 2) for s, v in values.items()}
    medians["deltaMs"] = round(medians["installed"] - medians["baseline"], 2)
    medians["deltaPercent"] = round(100 * medians["deltaMs"] / medians["baseline"], 2)
    summary[name] = medians
report = {"method": "Alternating fresh engine processes, shared OS cache, elapsed milliseconds",
          "pairs": args.pairs, "outputSha256": checks, "warmupMs": warmup,
          "rawMs": timings, "medianMs": summary}
(args.output / "comparison.json").write_text(json.dumps(report, indent=2), encoding="utf8")
print(json.dumps(summary, indent=2))
