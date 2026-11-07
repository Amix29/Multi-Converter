"""Independent semantic audit of the frozen conversion-only Office overlays.

Uses Python's standard XML parser; not required by application/build runtime.
No engine files are extracted, copied, changed or executed.
"""
import hashlib
import json
import posixpath
from pathlib import Path
from urllib.parse import unquote
from xml.dom import Node, minidom
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
POLICIES = ROOT / "tools/engine-profiles"
POLICY = json.loads((POLICIES / "windows-libreoffice-v2.json").read_text())
SOURCE = ROOT / "src-tauri/bundled-engine-archives/windows-x64/libreoffice.zip"
OOR = "http://openoffice.org/2001/registry"


def prop(node, name):
    for child in node.childNodes:
        if (child.nodeType == Node.ELEMENT_NODE and child.localName == "prop"
                and child.getAttributeNS(OOR, "name") == name):
            return "".join(text.data for value in child.getElementsByTagName("value")
                           for text in value.childNodes if text.nodeType == Node.TEXT_NODE).strip()
    return ""


def semantic(node):
    if node.nodeType in (Node.TEXT_NODE, Node.CDATA_SECTION_NODE):
        return node.data.strip() or None
    if node.nodeType != Node.ELEMENT_NODE:
        return None
    attributes = sorted((item.namespaceURI, item.localName, item.value)
                        for item in node.attributes.values())
    children = [value for child in node.childNodes if (value := semantic(child)) is not None]
    return node.namespaceURI, node.localName, attributes, children


with SOURCE.open("rb") as stream:
    assert hashlib.file_digest(stream, "sha256").hexdigest() == POLICY["sourceArchiveSha256"]

removed_files, protected_files = set(), set()
removed_nodes, retained_hyphenators = 0, 0
with ZipFile(SOURCE) as archive:
    entries = {item.filename.replace("\\", "/"): item for item in archive.infolist()}
    for overlay in POLICY["replacements"]:
        original = archive.read(entries[overlay["path"]])
        replacement = (POLICIES / overlay["file"]).read_bytes()
        assert hashlib.sha256(original).hexdigest() == overlay["sourceSha256"]
        assert hashlib.sha256(replacement).hexdigest() == overlay["sha256"]
        document = minidom.parseString(original)
        for node in list(document.getElementsByTagName("node")):
            kind = prop(node, "Format")
            if not kind:
                continue
            targets = []
            for location in prop(node, "Locations").split():
                assert location.startswith("%origin%/")
                relative = unquote(location[len("%origin%/"):])
                targets.append(posixpath.normpath(posixpath.join(posixpath.dirname(overlay["path"]), relative)))
            if kind in ("DICT_SPELL", "DICT_THES"):
                removed_nodes += 1
                for target in targets:
                    removed_files.add(target)
                    companion = target[:-4] + (".aff" if kind == "DICT_SPELL" else ".idx")
                    if companion in entries:
                        removed_files.add(companion)
                node.parentNode.removeChild(node)
            else:
                protected_files.update(targets)
                retained_hyphenators += kind == "DICT_HYPH"
        assert semantic(document.documentElement) == semantic(minidom.parseString(replacement).documentElement), overlay["path"]
    assert removed_files - protected_files == set(POLICY["omitFiles"])
    assert not any("hyph" in name.lower() for name in POLICY["omitFiles"])
    all_hyphenation = [name for name in entries if posixpath.basename(name).startswith("hyph") and name.endswith(".dic")]
    assert all(name not in POLICY["omitFiles"] for name in all_hyphenation)
    report = {"removedEditingDictionaryNodes": removed_nodes,
              "removedEditingDataFiles": len(POLICY["omitFiles"]),
              "retainedRegisteredHyphenators": retained_hyphenators,
              "retainedHyphenationDataFiles": len(all_hyphenation),
              "registrySemantics": "Only DICT_SPELL and DICT_THES nodes removed; all other XML semantics identical"}
    print(json.dumps(report, indent=2))
