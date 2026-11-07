import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { filterZip, inspectFilterableZip, readZipEntry } from "./lib/filtered-zip.mjs";
import { safeResourcePath } from "./lib/direct-engine-resources.mjs";
import { filterRegistryBytes, retainOcrFile, deriveOcrManifest, validateOcrProfileMarker } from "./lib/windows-engine-profile.mjs";
import { createHash } from "node:crypto";
import { nsisBinaryExpectation } from "./lib/tauri-bundle-binary.mjs";
import { retainLibreOfficeFile } from "./lib/libreoffice-profile.mjs";

test("Engine preparation entrypoints remain valid executable ES modules", () => {
  for (const name of ["prepare-bundled-engines.mjs", "prepare-libreoffice-profile.mjs", "prepare-windows-resources.mjs", "validate-bundled-engines.mjs", "test-libreoffice-profile-native.mjs"]) {
    execFileSync(process.execPath, ["--check", path.join(import.meta.dirname, name)], { windowsHide: true });
  }
});

test("Package executable hash allows only the documented Tauri NSIS marker", () => {
  const source = Buffer.from("prefix__TAURI_BUNDLE_TYPE_VAR_UNKsuffix");
  const original = Buffer.from(source);
  const expected = nsisBinaryExpectation(source);
  const patched = Buffer.from("prefix__TAURI_BUNDLE_TYPE_VAR_NSSsuffix");
  assert.equal(expected.sha256, createHash("sha256").update(patched).digest("hex"));
  assert.deepEqual(source, original);
  patched[0] ^= 1;
  assert.notEqual(expected.sha256, createHash("sha256").update(patched).digest("hex"));
  assert.throws(() => nsisBinaryExpectation(Buffer.from("missing")), /marker/);
  assert.throws(() => nsisBinaryExpectation(Buffer.concat([source, source])), /Ambiguous/);
});

test("OCR profile preserves all inference libraries, codecs, weights and notices", async () => {
  const profile = JSON.parse(await fs.readFile(new URL("../src-tauri/windows-ocr-profile.json", import.meta.url), "utf8"));
  for (const name of ["ocr-worker.exe", "_internal/paddle/base/libpaddle.pyd", "_internal/paddle/libs/mkldnn.dll", "_internal/paddle/libs/mklml.dll", "_internal/cv2/cv2.pyd", "_internal/PIL/_avif.cp312-win_amd64.pyd", "_internal/paddle/include/COPYING"]) assert.ok(retainOcrFile(name, profile), name);
  for (const name of [...profile.omitFiles, "_internal/paddle/include/api.h"]) assert.equal(retainOcrFile(name, profile), false);
  assert.equal(profile.artifact.fileCount, 4990);
  assert.equal(profile.sourceArtifact.fileCount, 7246);
});

test("Frozen UI byte ranges reject changed input, output and overlaps", () => {
  const sha = input => createHash("sha256").update(input).digest("hex");
  const input = Buffer.from("keepUIkeep"), output = Buffer.from("keepkeep");
  const transform = { sourceSha256: sha(input), sha256: sha(output), ranges: [[4, 6]] };
  assert.deepEqual(filterRegistryBytes(input, transform), output);
  assert.throws(() => filterRegistryBytes(Buffer.from("changed"), transform), /source/);
  assert.throws(() => filterRegistryBytes(input, { ...transform, sha256: "wrong" }), /result/);
  assert.throws(() => filterRegistryBytes(input, { ...transform, ranges: [[4, 6], [5, 8]] }), /range/);
});

test("OCR derivation fails closed when origin metadata differs", () => {
  assert.throws(() => deriveOcrManifest({ fileCount: 1 }, { sourceArtifact: { fileCount: 2 } }), /origin/);
  const profile = { profileId: "known", sourceArtifact: { aggregateSha256: "origin" }, artifact: { fileCount: 2, totalBytes: 3, aggregateSha256: "approved" } };
  const marker = { distributionProfile: "known", sourceAggregateSha256: "origin", ...profile.artifact };
  validateOcrProfileMarker(marker, profile);
  assert.throws(() => validateOcrProfileMarker({ ...marker, distributionProfile: undefined }, profile), /marker/);
  assert.throws(() => validateOcrProfileMarker({ ...marker, fileCount: 99 }, profile), /metadata/);
});

test("Direct profile excludes only editing dictionaries and preserves hyphenation and notices", async () => {
  const policy = JSON.parse(await fs.readFile(new URL("../tools/engine-profiles/windows-libreoffice-v2.json", import.meta.url), "utf8"));
  assert.equal(policy.omitFiles.length, 234);
  for (const file of policy.omitFiles) {
    assert.match(file, /^share\/extensions\/dict-[^/]+\/.+\.(aff|dic|dat|idx)$/);
    assert.doesNotMatch(file, /hyph|licen[cs]e|copying|notice/i);
    safeResourcePath(file);
  }
  for (const file of ["../outside", "/absolute", "a//b", "a\\b", "C:/a", "a/./b"]) assert.throws(() => safeResourcePath(file));
});

test("Office profile preserves document language, filters, fonts and licensing", () => {
  for (const file of ["share/extensions/dict-fr/fr.dic", "share/extensions/dict-fr/hyph_fr.dic",
    "share/registry/writer.xcd", "program/mergedlo.dll", "program/resource/common/fonts/opens___.ttf",
    "program/resource/en-US/LC_MESSAGES/cui.mo", "licenses/THIRD_PARTY_NOTICES.txt", "share/config/images_colibre.zip", "help/media/icon-themes/COPYING-ICONS"]) {
    assert.ok(retainLibreOfficeFile(file), file);
  }
  for (const file of ["help/help.html", "share/gallery/apples.gif", "program/resource/fr/LC_MESSAGES/cui.mo", "share/config/images_breeze.zip"]) {
    assert.equal(retainLibreOfficeFile(file), false, file);
  }
});

test("Filtered ZIP preserves compressed payload and decodes after offset changes", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "mc-profile-test-"));
  const source = path.join(temporary, "original.zip");
  const output = path.join(temporary, "profile.zip");
  const fixture = makeZip([["help\\help.html", "excluded"], ["program\\core.dll", "native payload"], ["licenses\\LICENSE.txt", "license"]]);
  await fs.writeFile(source, fixture);
  const result = await filterZip(source, output, retainLibreOfficeFile);
  const archive = await inspectFilterableZip(output);
  assert.equal(result.fileCount, 2);
  assert.deepEqual(archive.entries.map(entry => entry.name), ["program/core.dll", "licenses/LICENSE.txt"]);
  const bytes = await fs.readFile(output);
  for (const entry of archive.entries) {
    const start = entry.start + 30 + bytes.readUInt16LE(entry.start + 26) + bytes.readUInt16LE(entry.start + 28);
    const decoded = inflateRawSync(bytes.subarray(start, start + entry.compressedBytes));
    assert.deepEqual(await readZipEntry(output, entry), decoded);
    assert.equal(crc32(decoded), entry.record.readUInt32LE(16));
    assert.equal(decoded.toString(), entry.name.startsWith("program/") ? "native payload" : "license");
  }
  assert.deepEqual(await fs.readFile(source), fixture);
  await assert.rejects(filterZip(source, output, retainLibreOfficeFile), /EEXIST/);
  for (const file of [source, output]) await fs.unlink(file);
  await fs.rmdir(temporary);
});

test("Unsafe paths and case-insensitive duplicates are refused before writing", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "mc-profile-invalid-"));
  const source = path.join(temporary, "source.zip");
  const output = path.join(temporary, "output.zip");
  for (const items of [[["..\\outside.dll", "x"]], [["A.dll", "a"], ["a.dll", "b"]]]) {
    await fs.writeFile(source, makeZip(items));
    await assert.rejects(filterZip(source, output, () => true), /Unsafe or duplicate/);
    await assert.rejects(fs.stat(output), /ENOENT/);
  }
  await fs.unlink(source);
  await fs.rmdir(temporary);
});

function makeZip(items) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, text] of items) {
    const filename = Buffer.from(name), data = Buffer.from(text), compressed = deflateRawSync(data);
    const header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc32(data), 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc32(data), 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, filename, compressed); central.push(directory, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const end = Buffer.alloc(22), directory = Buffer.concat(central);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(items.length, 8); end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
