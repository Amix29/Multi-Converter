import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadStagedEngineAssets } from "./lib/staged-engine-assets.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "mc-staged-engine-assets-"));
const archiveName = "pdfium-compatible-windows-x64.zip";
const archive = Buffer.from("deterministic staged PDFium fixture");
const sha256 = createHash("sha256").update(archive).digest("hex");
const embedded = baseEntry({
  downloadUrl: "https://example.invalid/old.zip",
  sha256: "a".repeat(64),
  compressedSizeBytes: 1,
  installedSizeBytes: 1,
});

try {
  await fs.writeFile(path.join(root, archiveName), archive);
  await writeManifest(baseEntry({
    downloadUrl: `\${ENGINE_DOWNLOAD_BASE}/${archiveName}`,
    sha256,
    compressedSizeBytes: archive.length,
    installedSizeBytes: 42,
  }));

  const assets = await loadStagedEngineAssets({
    assetDir: root,
    platform: "windows-x64",
    embeddedEngines: [embedded],
  });
  assert(assets.get("pdfium")?.archivePath === path.join(root, archiveName), "staged PDFium archive was not selected");

  await expectFailure(
    () => writeAndLoad(baseEntry({
      downloadUrl: `\${ENGINE_DOWNLOAD_BASE}/${archiveName}`,
      sha256,
      compressedSizeBytes: archive.length,
      binaryPaths: ["bin/not-pdfium.exe"],
    })),
    /protected field binaryPaths/,
  );
  await expectFailure(
    () => writeAndLoad(baseEntry({
      downloadUrl: `\${ENGINE_DOWNLOAD_BASE}/${archiveName}`,
      sha256,
      compressedSizeBytes: archive.length,
      archiveType: "tar",
    })),
    /protected field archiveType/,
  );
  await expectFailure(
    () => writeAndLoad(baseEntry({
      downloadUrl: `\${ENGINE_DOWNLOAD_BASE}/${archiveName}`,
      sha256: "b".repeat(64),
      compressedSizeBytes: archive.length,
    })),
    /SHA-256 mismatch/,
  );
  await expectFailure(
    () => writeAndLoad(baseEntry({
      downloadUrl: "${ENGINE_DOWNLOAD_BASE}/%2e%2e%2fescape.zip",
      sha256,
      compressedSizeBytes: archive.length,
    })),
    /Unsafe staged engine archive name/,
  );
  await expectFailure(
    () => loadStagedEngineAssets({
      assetDir: root,
      platform: "linux-x64",
      embeddedEngines: [],
    }),
    /contains no linux-x64 engine/,
  );

  console.log("Staged engine asset tests passed: local candidates are integrity-checked without changing the embedded manifest.");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

async function writeAndLoad(entry) {
  await writeManifest(entry);
  return loadStagedEngineAssets({
    assetDir: root,
    platform: "windows-x64",
    embeddedEngines: [embedded],
  });
}

async function writeManifest(entry) {
  await fs.writeFile(
    path.join(root, "engines-manifest.json"),
    `${JSON.stringify({ manifestVersion: 1, engines: [entry] }, null, 2)}\n`,
  );
}

function baseEntry(overrides = {}) {
  return {
    id: "pdfium",
    displayName: "PDFium",
    mode: "advanced",
    version: "compatible",
    platform: "windows-x64",
    archiveType: "zip",
    downloadUrl: "https://example.invalid/pdfium.zip",
    sha256: "a".repeat(64),
    compressedSizeBytes: 1,
    installedSizeBytes: 1,
    binaryPaths: ["bin/pdfium.dll", "bin/pdfium-render-x86_64-pc-windows-msvc.exe"],
    healthCheck: "pdfium-render",
    licenseName: "BSD-3-Clause",
    licenseUrl: "https://example.invalid/license",
    noticeFiles: ["licenses/THIRD_PARTY_NOTICES.txt"],
    required: true,
    dependencies: [],
    ...overrides,
  };
}

async function expectFailure(action, pattern) {
  try {
    await action();
  } catch (error) {
    assert(pattern.test(error.message), `unexpected failure: ${error.message}`);
    return;
  }
  throw new Error(`expected failure matching ${pattern}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
