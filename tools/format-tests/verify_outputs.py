"""Decode actual conversion outputs with independent readers and known fixture content."""

import csv
import io
import itertools
import json
import os
import re
import subprocess
import sys
import tempfile
from array import array
from functools import cache
from hashlib import sha256
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

from expectations import AUDIO, DOCUMENTS, EXTENSION, FIXTURES, IMAGES

# Demuxer and decoded stream names reported by ffprobe (including FFmpeg aliases).
AUDIO_TYPES = {
    "mp3": ("mp3", "mp3"),
    "m4a": ("mov", "aac"),
    "flac": ("flac", "flac"),
    "wav": ("wav", "pcm_s16le"),
    "ogg": ("ogg", "vorbis"),
    "wma": ("asf", "wmav2"),
    "opus": ("ogg", "opus"),
    "aiff": ("aiff", "pcm_s16be"),
    "alac": ("mov", "alac"),
    "ac3": ("ac3", "ac3"),
    "mp2": ("mp3", "mp2"),
    "amr": ("amr", "amr_nb"),
    "au": ("au", "pcm_s16be"),
    "caf": ("caf", "pcm_s16be"),
}
VIDEO_TYPES = {
    "mp4": ("mov", "h264", "aac"),
    "mkv": ("matroska", "h264", "aac"),
    "webm": ("webm", "vp9", "opus"),
    "mov": ("mov", "h264", "aac"),
    "avi": ("avi", "mpeg4", "mp3"),
    "wmv": ("asf", "wmv2", "wmav2"),
    "3gp": ("3gp", "mpeg4", "aac"),
    "mts": ("mpegts", "h264", "aac"),
    "mpeg2": ("mpeg", "mpeg2video", "mp2"),
    "ogv": ("ogg", "theora", "vorbis"),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run(*args):
    env = os.environ.copy()
    if sys.platform == "linux":
        lib = Path(args[0]).resolve().parent.parent / "lib"
        if lib.is_dir():
            env["LD_LIBRARY_PATH"] = os.pathsep.join(filter(None, (str(lib), env.get("LD_LIBRARY_PATH"))))
    result = subprocess.run(args, capture_output=True, timeout=60, env=env, check=False)
    require(
        result.returncode == 0, f"{Path(args[0]).name} exited {result.returncode}: {result.stderr[-600:]!r}"
    )
    return result.stdout


def probe(path, tools):
    return json.loads(
        run(
            tools["ffprobe"],
            "-v",
            "error",
            "-count_frames",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            path,
        )
    )


def decoded_sound(path, tools):
    raw = run(
        tools["ffmpeg"],
        "-nostdin",
        "-v",
        "error",
        "-xerror",
        "-i",
        path,
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "8000",
        "-f",
        "s16le",
        "-",
    )
    samples = array("h", raw)
    if sys.byteorder != "little":
        samples.byteswap()
    require(4000 <= len(samples) <= 10000, f"unexpected decoded audio length: {len(samples)}")
    middle = samples[1600:3200]
    require(max(middle) - min(middle) > 300, "lost audio signal")
    crossings = sum(a <= 0 < b for a, b in itertools.pairwise(middle))
    require(155 <= crossings <= 195, f"lost 880 Hz tone: {crossings} positive crossings in 0.2 seconds")


def video_frames(path, ffmpeg):
    frames = run(
        ffmpeg,
        "-nostdin",
        "-v",
        "error",
        "-xerror",
        "-i",
        path,
        "-an",
        "-vf",
        "fps=5,scale=16:16",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
    )
    size = 16 * 16 * 3
    require(len(frames) >= 2 * size and frames[:size] != frames[-size:], "lost video motion")
    return frames[:size], frames[-size:]


@cache
def reference_frames(source, ffmpeg):
    name = "animated.gif" if source == "animated-gif" else "sample." + EXTENSION.get(source, source)
    return video_frames(FIXTURES / name, ffmpeg)


def verify_video_content(path, source, ffmpeg):
    actual = video_frames(path, ffmpeg)
    reference = reference_frames(source, ffmpeg)
    for frame, expected in zip(actual, reference, strict=True):
        # Lossy codecs and chroma subsampling change individual color samples.
        error = sum(abs(a - b) for a, b in zip(frame, expected, strict=True)) / len(frame)
        require(error < 24, f"wrong video content: mean RGB error {error:.1f}/255")


def verify_media(path, source, target, tools):
    metadata = probe(path, tools)
    streams = metadata["streams"]
    audio = [s for s in streams if s["codec_type"] == "audio"]
    video = [s for s in streams if s["codec_type"] == "video"]
    if target in AUDIO:
        container, acodec = AUDIO_TYPES[target]
        require(not video, "audio export contains video")
    else:
        container, vcodec, acodec = VIDEO_TYPES[target]
        require(len(video) == 1 and video[0]["codec_name"] == vcodec, f"wrong video track: {target}")
        require(int(video[0]["nb_read_frames"]) >= 2, "lost video frames")
        verify_video_content(path, source, tools["ffmpeg"])
    require(
        container in metadata["format"]["format_name"].split(","),
        f"wrong container: {metadata['format']['format_name']}",
    )
    brand = metadata["format"].get("tags", {}).get("major_brand", "").strip()
    if target in ("mov", "mp4", "3gp"):
        require(
            {"mov": brand == "qt", "mp4": brand in ("isom", "mp41", "mp42"), "3gp": brand.startswith("3g")}[
                target
            ],
            f"wrong ISO media brand: {brand}",
        )
    if source == "animated-gif":
        require(not audio, "unexpected GIF audio")
    else:
        require(
            len(audio) == 1 and audio[0]["codec_name"] == acodec and int(audio[0]["nb_read_frames"]) > 0,
            f"wrong audio track: {target}",
        )
        decoded_sound(path, tools)


def image_signature(data, target):
    magic = {
        "jpg": (b"\xff\xd8\xff",),
        "png": (b"\x89PNG\r\n\x1a\n",),
        "gif": (b"GIF87a", b"GIF89a"),
        "tiff": (b"II*\0", b"MM\0*"),
        "ico": (b"\0\0\1\0",),
        "bmp": (b"BM",),
        "webp": (b"RIFF",),
    }
    require(
        data.startswith(magic[target]) and (target != "webp" or data[8:12] == b"WEBP"),
        f"wrong image format: {target}",
    )


def verify_image(path, target, tools):
    image_signature(path.read_bytes(), target)
    raw = run(
        tools["ffmpeg"],
        "-v",
        "error",
        "-i",
        path,
        "-vf",
        "scale=8:8",
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
    )
    for (x, y), color in zip(
        [(1, 1), (6, 1), (1, 6), (6, 6)], [(192, 32, 48), (32, 160, 64), (48, 64, 208), (224, 192, 32)]
    ):
        pixel = raw[(8 * y + x) * 3 : (8 * y + x) * 3 + 3]
        require(
            len(pixel) == 3 and max(abs(a - b) for a, b in zip(pixel, color)) <= 35,
            f"wrong image quadrant {x},{y}: {list(pixel)}",
        )


def verify_pdf_pages(path, target, tools):
    with ZipFile(path) as archive, tempfile.TemporaryDirectory() as tmp:
        entries = archive.infolist()
        require(len(entries) == 2, f"wrong PDF page count: {len(entries)}")
        digests = set()
        text_widths = []
        for number, entry in enumerate(entries, 1):
            require(
                re.fullmatch(r"[^/\\]+-page-0*" + str(number) + r"\." + target, entry.filename),
                "wrong PDF page name or order",
            )
            data = archive.read(entry)
            image_signature(data, target)
            page = Path(tmp) / f"page.{target}"
            page.write_bytes(data)
            pixels = run(
                tools["ffmpeg"],
                "-v",
                "error",
                "-i",
                page,
                "-vf",
                "scale=512:-1",
                "-frames:v",
                "1",
                "-pix_fmt",
                "gray",
                "-f",
                "rawvideo",
                "-",
            )
            require(min(pixels) < 150, "blank rendered PDF page")
            columns = {index % 512 for index, gray in enumerate(pixels) if gray < 190}
            text_widths.append(max(columns) - min(columns) + 1)
            digests.add(sha256(pixels).digest())
        require(len(digests) == 2, "duplicated PDF page")
        # The committed PDF has a wider text block on its first page.
        require(text_widths[0] > text_widths[1] + 5, "reversed or incorrect PDF page content")


def verify_document(path, source, target, tools):
    if target == "pdf":
        require(path.read_bytes().startswith(b"%PDF-"), "wrong PDF signature")
        with tempfile.TemporaryDirectory() as tmp:
            inspection = Path(tmp) / "text.json"
            run(tools["pdfium"], "--inspect-text", path, inspection)
            text = " ".join(p["text"] for p in json.loads(inspection.read_bytes())["pages"])
    elif target in ("docx", "epub", "odt", "rtf", "html", "md"):
        if target in ("docx", "epub", "odt"):
            with ZipFile(path) as z:
                required = {
                    "docx": "word/document.xml",
                    "epub": "META-INF/container.xml",
                    "odt": "content.xml",
                }[target]
                require(required in z.namelist(), f"wrong {target} package")
                for part in z.namelist():
                    if part.endswith((".xml", ".rels", ".xhtml", ".opf")):
                        ElementTree.fromstring(z.read(part))
        if target == "rtf":
            require(path.read_bytes().startswith(b"{\\rtf"), "wrong RTF signature")
        if target == "html":
            require(b"<" in path.read_bytes(), "missing HTML markup")
        text = run(
            tools["pandoc"], "-f", "markdown" if target == "md" else target, "-t", "plain", path
        ).decode("utf-8")
    else:
        text = path.read_text(encoding="utf-8-sig")
        if target == "json":
            text = json.dumps(json.loads(text), ensure_ascii=False)
        elif target == "xml":
            text = " ".join(ElementTree.fromstring(text).itertext())
        elif target == "csv":
            text = " ".join(field for row in csv.reader(io.StringIO(text), strict=True) for field in row)
    index = DOCUMENTS.index(source)
    for token in ("Café", "Atlas", str(73100 + index), "Budget", str(41900 + index)):
        require(token in text, f"{source}->{target} lost {token!r}: {text[:220]!r}")
    if source == "pdf":
        require("Conversion locale" in text and "Total" in text, f"pdf->{target} lost a secondary line")


def verify(path, source, target, tools):
    if source == "pdf" and target in ("png", "jpg"):
        verify_pdf_pages(path, target, tools)
    elif target in DOCUMENTS:
        verify_document(path, source, target, tools)
    elif target in IMAGES:
        verify_image(path, target, tools)
    else:
        verify_media(path, source, target, tools)
