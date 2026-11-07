"""Check approved UI-only XML ranges independently of the Node preparer.

Reads the pinned source ZIP without extracting an engine tree. The application
and its normal build do not depend on Python or this audit command.
"""
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
POLICY = json.loads((ROOT / "tools/engine-profiles/windows-libreoffice-v3.json").read_text(encoding="utf-8"))
SOURCE = ROOT / "src-tauri/bundled-engine-archives/windows-x64/libreoffice.zip"
PREPARED = ROOT / "src-tauri/bundled-engine-profiles/windows-x64/v3/libreoffice"
OOR = "{http://openoffice.org/2001/registry}"
with SOURCE.open("rb") as stream:
    assert hashlib.file_digest(stream, "sha256").hexdigest() == POLICY["sourceArchiveSha256"]

removed, retained = 0, 0
names = set()
with ZipFile(SOURCE) as archive:
    entries = {item.filename.replace("\\", "/"): item for item in archive.infolist()}
    for transform in POLICY["uiRegistryTransforms"]:
        data = archive.read(entries[transform["path"]])
        assert hashlib.sha256(data).hexdigest() == transform["sourceSha256"]
        blocks, cursor = [], 0
        for start, end in transform["ranges"]:
            assert cursor <= start < end <= len(data)
            blocks.append(data[cursor:start])
            cursor = end
        result = b"".join([*blocks, data[cursor:]])
        assert hashlib.sha256(result).hexdigest() == transform["sha256"]
        original, actual = ET.fromstring(data), ET.fromstring(result)
        protected = []
        for node in original:
            if node.tag == OOR + "component-data" and node.get(OOR + "package") == "org.openoffice.Office.UI":
                removed += 1
                names.add(node.get(OOR + "name"))
            else:
                node.tail = None
                protected.append(ET.tostring(node))
                retained += 1
        observed = []
        for node in actual:
            node.tail = None
            observed.append(ET.tostring(node))
        assert original.tag == actual.tag and original.attrib == actual.attrib
        assert protected == observed, transform["path"]
        if PREPARED.is_dir():
            assert (PREPARED / transform["path"]).read_bytes() == result

print(json.dumps({"filesAudited": len(POLICY["uiRegistryTransforms"]),
                  "removedUiComponentNodes": removed, "preservedNonUiComponentNodes": retained,
                  "removedUiComponentNames": sorted(names),
                  "preparedViewChecked": PREPARED.is_dir(),
                  "assertion": "Every non-UI component and root attribute is unchanged"}, indent=2))
