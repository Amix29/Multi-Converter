"""Rebuild the synthetic CC0 corpus in a NEW directory. CI uses the committed bytes."""

import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw


def run(*args, input_text=None):
    subprocess.run(args, input=input_text, encoding="utf-8", check=True, timeout=90)


def generate(folder, ffmpeg, pandoc, office):
    folder.mkdir(parents=True, exist_ok=False)
    docs = ["txt", "md", "html", "csv", "json", "xml", "rtf", "docx", "odt", "epub", "doc", "pdf"]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for index, fmt in enumerate(docs):
            text = f"Café Atlas {73100 + index}"
            second = f"Budget {41900 + index}"
            content = {
                "txt": f"{text}\n{second}\n",
                "md": f"# {text}\n\n{second}\n",
                "html": f'<html><head><meta charset="utf-8"></head><body><p>{text}</p><p>{second}</p></body></html>',
                "csv": f"label,value\n{text},{second}\n",
                "json": json.dumps({"label": text, "value": second}, ensure_ascii=False),
                "xml": f"<record><label>{text}</label><value>{second}</value></record>",
            }
            target = folder / f"sample.{fmt}"
            if fmt in content:
                target.write_bytes(content[fmt].encode())
            elif fmt in ("doc", "pdf"):
                html = tmp / "sample.html"
                html.write_text(
                    f'<html><head><meta charset="utf-8"></head><body><p>{text}</p>'
                    f'<p style="page-break-before: always">{second}</p></body></html>',
                    encoding="utf-8",
                )
                source = html
                if fmt == "doc":
                    source = tmp / "sample.docx"
                    run(
                        pandoc,
                        "-f",
                        "markdown",
                        "-t",
                        "docx",
                        "-o",
                        source,
                        input_text=f"{text}\n\n{second}\n",
                    )
                run(
                    office,
                    "--headless",
                    "-env:UserInstallation=" + (tmp / "office").as_uri(),
                    "--convert-to",
                    "doc:MS Word 97" if fmt == "doc" else fmt,
                    "--outdir",
                    folder,
                    source,
                )
                assert target.is_file()
            else:
                run(
                    pandoc,
                    "--standalone",
                    "-f",
                    "markdown",
                    "-t",
                    fmt,
                    "-o",
                    target,
                    input_text=f"{text}\n\n{second}\n",
                )
    image = Image.new("RGB", (64, 64), "white")
    draw = ImageDraw.Draw(image)
    colors = ["#c02030", "#20a040", "#3040d0", "#e0c020"]
    for i, color in enumerate(colors):
        x, y = (i % 2) * 32, (i // 2) * 32
        draw.rectangle((x, y, x + 31, y + 31), fill=color)
    for ext in ("png", "jpg", "gif", "webp", "tif", "bmp", "ico"):
        image.save(folder / f"sample.{ext}")
    image.save(
        folder / "animated.gif", save_all=True, append_images=[image.rotate(180)], duration=400, loop=0
    )
    rects = "".join(
        f'<rect x="{(i % 2) * 32}" y="{(i // 2) * 32}" width="32" height="32" fill="{color}"/>'
        for i, color in enumerate(colors)
    )
    (folder / "sample.svg").write_bytes(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">{rects}</svg>'.encode()
    )
    prefix = [ffmpeg, "-nostdin", "-loglevel", "error", "-f", "lavfi"]
    audio = {
        "mp3": "libmp3lame",
        "m4a": "aac",
        "flac": "flac",
        "wav": "pcm_s16le",
        "ogg": "libvorbis",
        "wma": "wmav2",
        "opus": "libopus",
        "aiff": "pcm_s16be",
        "alac": "alac",
        "ac3": "ac3",
        "mp2": "mp2",
        "amr": "libopencore_amrnb",
        "au": "pcm_s16be",
        "caf": "pcm_s16be",
    }
    for ext, codec in audio.items():
        extra = {"alac": ["-f", "ipod"], "amr": ["-ar", "8000", "-ac", "1"]}.get(ext, [])
        run(*prefix, "-i", "sine=frequency=880:duration=0.8", "-c:a", codec, *extra, folder / f"sample.{ext}")
    video = {
        "mp4": ("libx264", "aac"),
        "mkv": ("libx264", "aac"),
        "webm": ("libvpx-vp9", "libopus"),
        "mov": ("libx264", "aac"),
        "avi": ("mpeg4", "mp3"),
        "wmv": ("wmv2", "wmav2"),
        "3gp": ("mpeg4", "aac"),
        "mts": ("libx264", "aac"),
        "mpg": ("mpeg2video", "mp2"),
        "ogv": ("libtheora", "libvorbis"),
    }
    for ext, (vcodec, acodec) in video.items():
        run(
            *prefix,
            "-i",
            "testsrc2=size=96x64:rate=25:duration=0.8",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=880:duration=0.8",
            "-c:v",
            vcodec,
            "-c:a",
            acodec,
            "-threads",
            "1",
            folder / f"sample.{ext}",
        )
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.iterdir())}
    (folder / "sha256.json").write_bytes((json.dumps(hashes, indent=2) + "\n").encode())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("out", "ffmpeg", "pandoc", "office"):
        parser.add_argument("--" + key, required=True, type=Path)
    args = parser.parse_args()
    generate(args.out.resolve(), args.ffmpeg, args.pandoc, args.office)
