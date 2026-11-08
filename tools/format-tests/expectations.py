"""Reviewed product coverage, independent of the registry being exercised."""

import sys
from pathlib import Path

DOCUMENTS = ["txt", "md", "html", "csv", "json", "xml", "rtf", "docx", "odt", "epub", "doc", "pdf"]
IMAGES = ["png", "jpg", "gif", "svg", "webp", "tiff", "bmp", "ico"]
VIDEO = ["mp4", "mkv", "webm", "mov", "avi", "wmv", "3gp", "mts", "mpeg2", "ogv"]
AUDIO = ["mp3", "m4a", "flac", "wav", "ogg", "wma", "opus", "aiff", "alac", "ac3", "mp2", "amr", "au", "caf"]
ALL = set(DOCUMENTS + IMAGES + VIDEO + AUDIO)
EXTENSION = {"mpeg2": "mpg", "tiff": "tif"}
FIXTURES = Path(__file__).resolve().parents[2] / "tests/fixtures/formats"


def targets(source):
    audio = set(AUDIO)
    if sys.platform == "darwin":
        audio.remove("amr")
    if source == "animated-gif":
        return set(VIDEO)
    if source == "doc":
        return {"docx", "odt", "rtf", "pdf", "html", "txt", "epub"}
    if source == "pdf":
        return {"txt", "md", "html", "csv", "json", "xml", "docx", "odt", "rtf", "png", "jpg"}
    if source in DOCUMENTS:
        return set(DOCUMENTS) - {"doc", source}
    if source in IMAGES:
        return set(IMAGES) - {"svg", source}
    if source in VIDEO:
        return (set(VIDEO) | audio) - {source}
    if source in audio:
        return audio - {source}
    return set()
