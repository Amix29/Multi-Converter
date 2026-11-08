"""Audit an installed candidate, a baseline installation, and an isolated first-use cache."""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import msvcrt
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--baseline", type=Path, required=True)
parser.add_argument("--installed", type=Path, required=True)
parser.add_argument("--cache", type=Path, action="append", default=[])
parser.add_argument("--report", type=Path, required=True)
args = parser.parse_args()
kernel = ctypes.WinDLL("kernel32", use_last_error=True)
compressed_size = kernel.GetCompressedFileSizeW
compressed_size.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD)]
compressed_size.restype = wintypes.DWORD
class StandardInfo(ctypes.Structure):
    _fields_ = [("allocation", ctypes.c_int64), ("end", ctypes.c_int64),
                ("links", wintypes.DWORD), ("pending", ctypes.c_ubyte), ("directory", ctypes.c_ubyte)]

file_info = kernel.GetFileInformationByHandleEx
file_info.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]

def inventory(root):
    root = root.resolve(strict=True)
    volume = ctypes.create_unicode_buffer(32768)
    if not kernel.GetVolumePathNameW(str(root), volume, len(volume)):
        raise ctypes.WinError(ctypes.get_last_error())
    cluster = wintypes.DWORD()
    sectors = wintypes.DWORD()
    if not kernel.GetDiskFreeSpaceW(volume.value, ctypes.byref(sectors), ctypes.byref(cluster), None, None):
        raise ctypes.WinError(ctypes.get_last_error())
    unit = sectors.value * cluster.value
    files = {}
    latency_sensitive = {}
    logical = allocated = reported = 0
    for p in root.rglob("*"):
        if p.is_symlink() or p.is_junction():
            raise ValueError(f"Unexpected link in measured tree: {p}")
        if not p.is_file():
            continue
        high = wintypes.DWORD()
        ctypes.set_last_error(0)
        low = compressed_size(str(p), ctypes.byref(high))
        if low == 0xffffffff and ctypes.get_last_error():
            raise ctypes.WinError(ctypes.get_last_error())
        size = (high.value << 32) + low
        allocated += (size + unit - 1) // unit * unit
        with p.open("rb") as stream:
            info = StandardInfo()
            if not file_info(msvcrt.get_osfhandle(stream.fileno()), 1, ctypes.byref(info), ctypes.sizeof(info)):
                raise ctypes.WinError(ctypes.get_last_error())
            reported += info.allocation
        logical += p.stat().st_size
        name = p.relative_to(root).as_posix()
        files[name] = p
        if name == "multi-converter.exe" or name.startswith(("ocr/", "engines/libvips/")):
            latency_sensitive[name] = info.allocation
    return files, {"files": len(files), "logicalBytes": logical, "clusterBytes": unit,
                   "windowsFileAllocationBytes": reported, "clusterRoundedStoredBytes": allocated}, latency_sensitive

def digest(p):
    with p.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()

before, base_size, base_sensitive = inventory(args.baseline)
after, install_size, installed_sensitive = inventory(args.installed)
if before.keys() != after.keys():
    raise ValueError(f"Installed file membership differs: {before.keys() ^ after.keys()}")
aggregate = hashlib.sha256()
notice_line_endings = {}
for name in sorted(after.keys() - {"uninstall.exe"}):
    actual = digest(after[name])
    original = digest(before[name])
    if actual != original:
        if name not in {"licenses/LICENSE.txt", "licenses/NOTICE.txt"}:
            raise ValueError(f"Installed bytes differ: {name}")
        old_text = before[name].read_bytes().replace(b"\r\n", b"\n")
        new_text = after[name].read_bytes().replace(b"\r\n", b"\n")
        if new_text != old_text:
            raise ValueError(f"Installed notice text differs: {name}")
        notice_line_endings[name] = {"beforeSha256": original, "afterSha256": actual}
    aggregate.update(f"{name}\0{actual}\n".encode())

locks = Path(__file__).resolve().parents[1] / "ocr-runtime/native-worker/model-sources.json"
models = {}
for model in json.loads(locks.read_text(encoding="utf8")):
    expected = next(f for f in model["files"] if f["rfilename"] == "inference.onnx")
    model_dir = "ocr/native-v1/models" if (args.installed / "ocr/native-v1").is_dir() else "ocr/models"
    encoded = after[f"{model_dir}/{model['id']}/inference.onnx"].read_bytes()
    n = expected["size"]
    if encoded[:8] != b"MCOSHF01" or len(encoded) != n + 16 or int.from_bytes(encoded[8:16], "little") != n:
        raise ValueError("Invalid lossless model container")
    restored = bytearray(n)
    width = n // 4
    for plane in range(4):
        restored[plane:width*4:4] = encoded[16+plane*width:16+(plane+1)*width]
    restored[width*4:] = encoded[16+width*4:]
    actual = hashlib.sha256(restored).hexdigest()
    if actual != expected["lfs"]["sha256"]:
        raise ValueError(f"Original model SHA mismatch: {model['id']}")
    models[model["id"]] = actual

caches = [inventory(p)[1] for p in args.cache]
total = install_size["clusterRoundedStoredBytes"] + sum(c["clusterRoundedStoredBytes"] for c in caches)
report = {"baseline": base_size, "installed": install_size, "measuredData": caches,
          "appOcrVipsFilesMeasured": len(installed_sensitive),
          "appOcrVipsFilesWithSameAllocation": sum(base_sensitive.get(name) == n for name, n in installed_sensitive.items()),
          "windowsAllocationWithCaches": install_size["windowsFileAllocationBytes"] + sum(c["windowsFileAllocationBytes"] for c in caches),
          "installedAndCacheBytes": total, "limitBytes": 750_000_000,
          "byteIdenticalFiles": len(after)-1-len(notice_line_endings),
          "noticeLineEndingsOnly": notice_line_endings, "candidateTreeSha256": aggregate.hexdigest(),
          "restoredOfficialModelSha256": models,
          "method": "FileStandardInfo.AllocationSize from Windows on every file; independently GetCompressedFileSizeW rounded up to a volume cluster per file. Includes uninstaller, excludes filesystem metadata. Every application payload compared by content; uninstaller generated separately by NSIS."}
args.report.write_text(json.dumps(report, indent=2), encoding="utf8")
print(json.dumps(report, indent=2))
if max(total, report["windowsAllocationWithCaches"]) >= report["limitBytes"]:
    raise SystemExit("Installed footprint exceeds the requested ceiling")
