"""Read existing bundled ARM engines; write synthetic fixtures only into --output-dir."""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import platform
import plistlib
import shutil
import subprocess
import threading
import time
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--signed-copy", action="store_true")
    args = parser.parse_args()
    root = Path(args.output_dir).resolve()
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError("This probe requires a native Apple Silicon Mac")
    if not str(root).startswith("/private/tmp/multi-converter-audit."):
        raise RuntimeError("Only the dedicated temporary audit directory is allowed")
    root.mkdir(exist_ok=True)
    bundle = Path(args.bundle).resolve()
    resources = bundle / "Contents/Resources/engines"
    ffmpeg = bundle / "Contents/MacOS/ffmpeg"
    ffprobe = bundle / "Contents/MacOS/ffprobe"
    report = {"schemaVersion": 1, "platform": "macos-aarch64",
              "osVersion": platform.mac_ver()[0], "proof": "existing-bundle-engine-fixtures",
              "notProven": ["current-1.0.7-application", "OCR", "DMG", "installed-UI"],
              "cases": [], "engines": {}}
    with (bundle / "Contents/Info.plist").open("rb") as stream:
        report["existingBundleVersion"] = plistlib.load(stream)["CFBundleShortVersionString"]

    def run(command, success=True, timeout=90):
        env = dict(os.environ, HOME=str(root), TMPDIR=str(root), XDG_CACHE_HOME=str(root / "cache"))
        result = subprocess.run([str(value) for value in command], cwd=root, env=env,
                                capture_output=True, timeout=timeout)
        if success and result.returncode != 0:
            raise RuntimeError("engine exited " + str(result.returncode) + ": "
                               + result.stderr.decode(errors="replace")[-1200:].replace(str(root), "<temporary>"))
        return result

    def case(name, action):
        started = time.monotonic()
        try:
            detail = action()
            entry = {"id": name, "status": "pass", "detail": detail}
        except Exception as error:
            entry = {"id": name, "status": "fail", "error": str(error).replace(str(bundle), "<existing-bundle>")}
        entry["durationMs"] = round((time.monotonic() - started) * 1000)
        report["cases"].append(entry)
        (root / "receipt.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    def tool_version(tool, flag):
        return run([tool, flag]).stdout.decode(errors="replace").splitlines()[0]

    report["engines"]["ffmpeg"] = {"version": tool_version(ffmpeg, "-version"),
                                  "sha256": hashlib.sha256(ffmpeg.read_bytes()).hexdigest()}
    report["engines"]["ffprobe"] = {"version": tool_version(ffprobe, "-version"),
                                   "sha256": hashlib.sha256(ffprobe.read_bytes()).hexdigest()}

    def media():
        subtitle = root / "captions.srt"
        subtitle.write_text("1\n00:00:00,000 --> 00:00:00,300\nSynthetic subtitle\n")
        source = root / "source.mkv"
        run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "color=size=96x64:duration=0.5",
             "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5",
             "-f", "lavfi", "-i", "sine=frequency=880:duration=0.5", "-i", subtitle,
             "-map", "0:v", "-map", "1:a", "-map", "2:a", "-map", "3:s",
             "-c:v", "libx264", "-c:a", "aac", "-c:s", "srt",
             "-metadata:s:a:0", "language=fra", "-metadata:s:a:1", "language=eng", source])
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        destination = root / "copy.mkv"
        run([ffmpeg, "-y", "-v", "error", "-protocol_whitelist", "file,pipe", "-i", source,
             "-map", "0", "-map_metadata", "0", "-map_chapters", "0", "-codec", "copy", destination])
        def probe(path):
            return json.loads(run([ffprobe, "-v", "error", "-protocol_whitelist", "file,pipe",
                                   "-show_streams", "-show_packets", "-show_data_hash", "sha256",
                                   "-of", "json", path]).stdout)
        original, copied = probe(source), probe(destination)
        assert len(copied["streams"]) == 4
        assert [s.get("tags", {}).get("language") for s in copied["streams"] if s["codec_type"] == "audio"] == ["fra", "eng"]
        for index in range(4):
            assert [p["data_hash"] for p in original["packets"] if p["stream_index"] == index] == [
                p["data_hash"] for p in copied["packets"] if p["stream_index"] == index]
        assert before == hashlib.sha256(source.read_bytes()).hexdigest()
        report["mediaSourceSha256"] = before
        return {"streams": 4, "packetPayloadsIdentical": True, "sourceUnchanged": True}
    case("media.copy-multilingual-subtitles", media)

    def offline():
        requests = []
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(self.path)
                self.send_response(200)
                self.end_headers()
                self.wfile.write((root / "segment.ts").read_bytes())
            def log_message(self, *_):
                pass
        run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "color=size=96x64:duration=0.3",
             "-c:v", "libx264", "-f", "mpegts", root / "segment.ts"])
        server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        playlist = root / "local.m3u8"
        playlist.write_text("#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:0.3,\nhttp://127.0.0.1:"
                            + str(server.server_port) + "/segment.ts\n#EXT-X-ENDLIST\n")
        try:
            run([ffmpeg, "-v", "error", "-protocol_whitelist", "file,http,tcp", "-i", playlist,
                 "-f", "null", "-"])
            control = len(requests)
            assert control > 0
            requests.clear()
            for tool in (ffmpeg, ffprobe):
                command = [tool, "-v", "error", "-protocol_whitelist", "file,pipe"]
                command += ["-i", playlist, "-f", "null", "-"] if tool == ffmpeg else [playlist]
                assert run(command, success=False).returncode != 0
                assert not requests
            return {"controlHttpRequests": control, "restrictedHttpRequests": 0}
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
    case("media.local-protocol-restriction", offline)

    def vips():
        from PIL import Image
        candidates = sorted(resources.glob("libvips/*/aarch64/bin/vips"))
        tool = candidates[0]
        if args.signed_copy:
            source_root = tool.parent.parent
            size = sum(item.stat().st_size for item in source_root.rglob("*") if item.is_file())
            if size > 256 * 1024 * 1024:
                raise RuntimeError("Existing runtime exceeds the 256 MiB temporary-copy budget")
            destination = root / "signed-vips"
            shutil.copytree(source_root, destination, symlinks=True)
            files = []
            magic = [b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xca\xfe\xba\xbe"]
            for item in destination.rglob("*"):
                if not item.is_file():
                    continue
                if not item.resolve().is_relative_to(root):
                    raise RuntimeError("Temporary runtime symlink escapes the owned directory")
                with item.open("rb") as stream:
                    if stream.read(4) in magic:
                        files.append(str(item))
            run(["node", root / "sign-runtime.mjs", json.dumps(files)], timeout=120)
            tool = destination / "bin/vips"
            report["temporaryAdHocCopy"] = {"files": len(files), "bytes": size}
        report["engines"]["libvips"] = {"version": tool_version(tool, "--version")}
        original = root / "orientation.jpg"
        exif = Image.Exif()
        exif[274] = 6
        Image.new("RGB", (16, 32), "red").save(original, exif=exif)
        before = hashlib.sha256(original.read_bytes()).hexdigest()
        run([tool, "autorot", original, root / "oriented.png"])
        assert Image.open(root / "oriented.png").size == (32, 16)
        alpha = root / "alpha.png"
        Image.new("RGBA", (16, 16), (255, 0, 0, 0)).save(alpha)
        run([tool, "jpegsave", alpha, root / "white.jpg", "--Q", "85", "--background", "255"])
        assert min(Image.open(root / "white.jpg").convert("RGB").getpixel((8, 8))) >= 250
        assert before == hashlib.sha256(original.read_bytes()).hexdigest()
        return {"orientation": "32x16", "whiteMatte": True, "sourceUnchanged": True}
    case("image.orientation-white-matte", vips)

    def documents():
        pandoc = sorted(item for item in resources.glob("pandoc/**/pandoc*") if item.is_file() and os.access(item, os.X_OK))[0]
        soffice = sorted(resources.glob("libreoffice/*/aarch64/LibreOffice.app/Contents/MacOS/soffice"))[0]
        report["engines"]["pandoc"] = {"version": tool_version(pandoc, "--version")}
        text = root / "fixture.md"
        text.write_text("# Synthétique\n\nRésumé français, façade et été.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n")
        run([pandoc, "--sandbox", "--fail-if-warnings", text, "-o", root / "fixture.odt"])
        profile = root / "office-profile"
        (profile / "user").mkdir(parents=True)
        (profile / "user/registrymodifications.xcu").write_text(
            '<oor:items xmlns:oor="http://openoffice.org/2001/registry">'
            '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
            '<prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop>'
            '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>')
        output = root / "office-output"
        output.mkdir()
        run([soffice, "--headless", "--invisible", "--nologo", "--nodefault", "--nolockcheck",
             "--norestore", "--nofirststartwizard", "-env:UserInstallation=" + profile.as_uri(),
             "--convert-to", "pdf", "--outdir", output, root / "fixture.odt"], timeout=120)
        pdf = output / "fixture.pdf"
        assert pdf.read_bytes().startswith(b"%PDF-")
        with zipfile.ZipFile(root / "fixture.odt") as archive:
            assert "façade" in archive.read("content.xml").decode()
        return {"pandocOdtWithFrenchTable": True, "libreofficePdfBytes": pdf.stat().st_size,
                "privateTemporaryProfile": True}
    case("document.pandoc-office-basic", documents)
    print((root / "receipt.json").read_text())
    if any(entry["status"] != "pass" for entry in report["cases"]):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
