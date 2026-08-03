import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "mc-platform-restage-"));
const baseline = path.join(temporary, "baseline");
const replacement = path.join(temporary, "replacement");
const output = path.join(temporary, "output");

try {
  await fs.mkdir(baseline);
  await fs.mkdir(replacement);
  const baselineEntries = [];
  for (const id of ["pdfium", "libreoffice", "pandoc", "libvips"]) {
    baselineEntries.push(await writeEntry(baseline, id, `${id}-old.zip`, `old-${id}`, `\${ENGINE_DOWNLOAD_BASE}/${id}-old.zip`));
  }
  const replacementEntry = await writeEntry(
    replacement,
    "pdfium",
    "pdfium-new.zip",
    "new-pdfium",
    "https://example.invalid/engines/pdfium-new.zip",
  );
  await writeManifest(baseline, baselineEntries);
  await writeManifest(replacement, [replacementEntry]);

  const result = spawnSync(process.execPath, [
    "scripts/restage-platform-pdfium.mjs",
    "--platform", "linux-x64",
    "--baseline-dir", baseline,
    "--replacement-dir", replacement,
    "--output-dir", output,
  ], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const merged = JSON.parse(await fs.readFile(path.join(output, "engines-manifest.json"), "utf8"));
  const pdfium = merged.engines.find((entry) => entry.id === "pdfium");
  assert.equal(pdfium.downloadUrl, "${ENGINE_DOWNLOAD_BASE}/pdfium-new.zip");
  assert.equal(await fs.readFile(path.join(output, "pdfium-new.zip"), "utf8"), "new-pdfium");
  await assert.rejects(fs.stat(path.join(output, "pdfium-old.zip")));
  console.log("Platform PDFium restaging test passed with a parameterized baseline URL.");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

async function writeEntry(directory, id, name, content, downloadUrl) {
  const bytes = Buffer.from(content);
  await fs.writeFile(path.join(directory, name), bytes);
  return {
    id,
    platform: "linux-x64",
    version: id === "pdfium" ? "149.0.7825.0" : "baseline",
    downloadUrl,
    compressedSizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function writeManifest(directory, engines) {
  await fs.writeFile(path.join(directory, "engines-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2026-08-02T00:00:00.000Z",
    engines,
  }, null, 2)}\n`);
}
