"""Exercise advertised format pairs through the desktop conversion command."""

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from csv import Error as CsvError
from functools import partial
from pathlib import Path
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile

from expectations import ALL, DOCUMENTS, EXTENSION, FIXTURES, targets
from verify_outputs import require, run, verify

ROOT = Path(__file__).resolve().parents[2]


@contextmanager
def driver():
    command = [
        "node",
        "scripts/cargo-test-temp.mjs",
        "test",
        "--locked",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--features",
        "native-format-tests",
        "--test",
        "format_matrix_driver",
    ]
    # On a headless Linux runner GTK still needs a display to initialize Tauri.
    if sys.platform.startswith("linux") and not os.environ.get("DISPLAY"):
        command = ["xvfb-run", "-a", *command]
    child = subprocess.Popen(
        command,
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        encoding="utf-8",
        env={**os.environ, "CARGO_TERM_COLOR": "never"},
    )

    def call(op, **fields):
        child.stdin.write(json.dumps({"op": op, **fields}) + "\n")
        child.stdin.flush()
        for line in child.stdout:
            if line.startswith("MC_FORMAT_REPLY "):
                reply = json.loads(line.removeprefix("MC_FORMAT_REPLY "))
                break
            print(line, end="", file=sys.stderr)
        else:
            raise RuntimeError(f"native driver stopped (status {child.poll()})")
        if "error" in reply:
            raise ValueError(reply["error"])
        return reply["ok"]

    try:
        yield call
    finally:
        try:
            child.stdin.close()
        except OSError:
            if child.poll() is None:
                raise
        try:
            status = child.wait(timeout=30)
        finally:
            child.stdout.close()
        require(status == 0, f"driver exit {status}")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_set(actual, expected, context):
    actual = list(actual)
    missing = expected - set(actual)
    extra = set(actual) - expected
    require(
        not missing and not extra and len(actual) == len(expected),
        f"{context}: missing={sorted(missing)}, extra={sorted(extra)}, entries={len(actual)}",
    )


def rejected(label, check, report, reason):
    try:
        check()
    except ValueError as error:
        require(reason in str(error), f"{label}: unexpected failure: {error}")
        report["negativeControls"].append(label)
    else:
        raise ValueError(f"negative control escaped detection: {label}")


def controls(tools, folder, report):
    rejected(
        "missing advertised pair",
        lambda: check_set(["png"], {"png", "jpg"}, "mutant"),
        report,
        "missing=['jpg']",
    )
    impostor = folder / "impostor.webp"
    shutil.copyfile(FIXTURES / "sample.png", impostor)
    rejected(
        "PNG renamed to WebP", lambda: verify(impostor, "png", "webp", tools), report, "wrong image format"
    )
    empty = folder / "data.json"
    empty.write_text('{"value":"unrelated"}', encoding="utf-8")
    rejected(
        "valid JSON missing the source text",
        lambda: verify(empty, "txt", "json", tools),
        report,
        "lost 'Café'",
    )
    silent = folder / "silent.wav"
    run(tools["ffmpeg"], "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", "0.8", silent)
    rejected(
        "valid WAV with a silent track",
        lambda: verify(silent, "mp3", "wav", tools),
        report,
        "lost audio signal",
    )
    frozen = folder / "frozen.mp4"
    run(
        tools["ffmpeg"],
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=black:s=64x64:r=25",
        "-t",
        "0.8",
        "-c:v",
        "libx264",
        frozen,
    )
    rejected(
        "playable video frozen on one frame",
        lambda: verify(frozen, "animated-gif", "mp4", tools),
        report,
        "lost video motion",
    )
    replaced = folder / "wrong-colors.mp4"
    run(
        tools["ffmpeg"],
        "-v",
        "error",
        "-i",
        FIXTURES / "sample.mkv",
        "-vf",
        "negate",
        "-c:v",
        "libx264",
        "-c:a",
        "copy",
        replaced,
    )
    rejected(
        "moving video with wrong pixels and intact audio",
        lambda: verify(replaced, "mkv", "mp4", tools),
        report,
        "wrong video content",
    )


def reject_invalid_jobs(call, root, report):
    for name, source, target, reason in [
        ("still GIF as video", "sample.gif", "mp4", "GIF est statique"),
        ("animated GIF as image", "animated.gif", "png", "GIF est animé"),
        ("legacy DOC output", "sample.txt", "doc", "DOC historique"),
    ]:
        path = root / source
        shutil.copyfile(FIXTURES / source, path)
        before = digest(path)
        job = {"id": "invalid", "inputPath": str(path), "outputDir": str(root), "targetFormat": target}
        rejected(name, partial(call, "convert", job=job), report, reason)
        require(digest(path) == before and not list((root / "invalid").glob("*")), "failed job damaged files")


def exercise(call, report, selected, root):
    hashes = json.loads((FIXTURES / "sha256.json").read_bytes())
    catalog = call("catalog")
    check_set((fmt["id"] for fmt in catalog), ALL, "registered source formats")
    tools = call("tools")
    report["tools"] = {name: Path(path).name for name, path in tools.items()}
    controls(tools, root, report)
    reject_invalid_jobs(call, root, report)
    for source in selected:
        fmt = "gif" if source == "animated-gif" else source
        ext = EXTENSION.get(fmt, fmt)
        filename = "animated.gif" if source == "animated-gif" else "sample." + ext
        expected = targets(source)
        source_path = root / ("entrée " + filename)
        shutil.copyfile(FIXTURES / filename, source_path)
        require(digest(source_path) == hashes[filename], f"fixture checksum: {filename}")
        desc = call("describe", input=str(source_path))
        require(desc["sourceFormat"] == fmt, f"wrong imported format: {source}")
        check_set((t["format"] for t in desc["targets"]), expected, source)
        for t in desc["targets"]:
            target = t["format"]
            pair = source + "-" + target
            row = {"source": source, "target": target, "offeredEngine": t["engine"]}
            report["pairs"].append(row)
            try:
                require(t["engineAvailable"], f"unavailable engine {t['engine']}")
                job = {
                    "id": pair,
                    "inputPath": str(source_path),
                    "outputDir": str(root),
                    "targetFormat": target,
                }
                result = call("convert", job=job)
                output = Path(result["outputPath"]).resolve()
                require(
                    output.parent == root / pair and output.suffix == "." + t["extension"],
                    "wrong output destination",
                )
                require(
                    result["inputBytes"] == source_path.stat().st_size
                    and result["outputBytes"] == output.stat().st_size > 0,
                    "invalid byte counts",
                )
                row["engine"] = result["engine"]
                row["warnings"] = [w["code"] for w in result["warnings"]]
                verify(output, source, target, tools)
                row["status"] = "pass"
            except (ValueError, BadZipFile, ParseError, CsvError, subprocess.TimeoutExpired) as error:
                row.update(status="fail", error=str(error))
                print(f"FAIL {pair}: {error}", flush=True)
            if digest(source_path) != hashes[filename]:
                row.update(status="fail", error="source was modified")
                raise ValueError(f"{pair} modified its input")
        passed = sum(r["status"] == "pass" for r in report["pairs"] if r["source"] == source)
        print(f"{source}: {passed}/{len(expected)}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", choices=sorted(ALL | {"animated-gif"}))
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    selected = sorted(set(args.source or ALL | {"animated-gif"}), key=lambda s: (s not in DOCUMENTS, s))
    expected = sum(len(targets(source)) for source in selected)
    host = {"win32": "windows-x64", "darwin": "macos-aarch64", "linux": "linux-x64"}[sys.platform]
    architecture = platform.machine().lower()
    require(
        architecture in (("arm64", "aarch64") if sys.platform == "darwin" else ("amd64", "x86_64")),
        "unexpected host architecture",
    )
    output = args.report or ROOT / "test-results/native-formats" / (
        host + ("-partial" if args.source else "") + ".json"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "host": host,
        "partial": bool(args.source),
        "expectedPairs": expected,
        "negativeControls": [],
        "pairs": [],
        "passed": False,
    }
    started = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix="mc-native-formats-") as tmp, driver() as call:
            exercise(call, report, selected, Path(tmp).resolve())
        check_set(
            (r["source"] + "-" + r["target"] for r in report["pairs"]),
            {s + "-" + t for s in selected for t in targets(s)},
            "executed pairs",
        )
        failures = [r for r in report["pairs"] if r["status"] != "pass"]
        require(not failures, f"{len(failures)} failed pairs, see {output}")
        report["passed"] = True
    except Exception as error:
        report["error"] = str(error)
        raise
    finally:
        report["seconds"] = round(time.monotonic() - started, 2)
        output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"PASS {expected}/{expected} format pairs on {host}. Report: {output}")


if __name__ == "__main__":
    main()
