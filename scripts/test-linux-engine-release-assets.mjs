import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-linux-engine-release-assets-"));
const requiredAdvancedEngines = ["pdfium", "libreoffice", "pandoc", "libvips"];

try {
  const complete = createFixture("complete", requiredAdvancedEngines);
  const completeResult = runPreparer(complete);
  assert.equal(completeResult.status, 0, completeResult.stderr || completeResult.stdout);

  const embeddedManifest = JSON.parse(fs.readFileSync(complete.manifestTarget, "utf8"));
  assert.deepEqual(
    embeddedManifest.engines.map((engine) => engine.id).sort(),
    requiredAdvancedEngines.toSorted(),
    "embedded Linux manifest must contain every required advanced engine",
  );
  for (const engineId of requiredAdvancedEngines) {
    assert.equal(
      fs.readFileSync(path.join(complete.cacheDir, `${engineId}-compatible.zip`), "utf8"),
      `${engineId} archive\n`,
      `${engineId} archive must be seeded into the bundled-engine cache`,
    );
  }

  const partial = createFixture("partial", ["pdfium"]);
  const partialResult = runPreparer(partial);
  assert.notEqual(partialResult.status, 0, "partial Linux advanced-engine manifests must fail");
  assert.match(
    `${partialResult.stderr}\n${partialResult.stdout}`,
    /Missing required advanced linux-x64 engine entries: libreoffice, pandoc, libvips/,
    "partial manifest failure must name the missing engines",
  );
  assert.equal(
    fs.existsSync(partial.manifestTarget),
    false,
    "failed Linux engine staging must not write an embedded manifest",
  );

  const duplicate = createFixture("duplicate", [...requiredAdvancedEngines, "pdfium"]);
  const duplicateResult = runPreparer(duplicate);
  assert.notEqual(duplicateResult.status, 0, "duplicate Linux advanced-engine entries must fail");
  assert.match(
    `${duplicateResult.stderr}\n${duplicateResult.stdout}`,
    /Duplicate advanced linux-x64 engine entries: pdfium/,
    "duplicate manifest failure must name the duplicate engine",
  );

  const unexpected = createFixture("unexpected", [...requiredAdvancedEngines, "ghostscript"]);
  const unexpectedResult = runPreparer(unexpected);
  assert.notEqual(unexpectedResult.status, 0, "unexpected Linux advanced-engine entries must fail");
  assert.match(
    `${unexpectedResult.stderr}\n${unexpectedResult.stdout}`,
    /Unexpected advanced linux-x64 engine entries: ghostscript/,
    "unexpected manifest failure must name the unknown engine",
  );

  const baseEngine = createFixture("base-engine", requiredAdvancedEngines, { baseEngines: ["ffmpeg"] });
  const baseEngineResult = runPreparer(baseEngine);
  assert.notEqual(baseEngineResult.status, 0, "non-advanced Linux engine entries must fail");
  assert.match(
    `${baseEngineResult.stderr}\n${baseEngineResult.stdout}`,
    /Unexpected non-advanced linux-x64 engine entries: ffmpeg/,
    "non-advanced manifest failure must name the unexpected engine",
  );
  assert.equal(fs.existsSync(baseEngine.manifestTarget), false, "non-advanced entries must not write an embedded manifest");

  const badChecksum = createFixture("bad-checksum", requiredAdvancedEngines, { corruptShaFor: "libvips" });
  const badChecksumResult = runPreparer(badChecksum);
  assert.notEqual(badChecksumResult.status, 0, "Linux engine checksum mismatches must fail");
  assert.match(
    `${badChecksumResult.stderr}\n${badChecksumResult.stdout}`,
    /libvips Linux engine archive: SHA-256 mismatch/,
    "checksum failure must identify the bad engine archive",
  );
  assert.equal(fs.existsSync(badChecksum.manifestTarget), false, "checksum failures must not write an embedded manifest");
  assert.deepEqual(
    fs.readdirSync(badChecksum.cacheDir).filter((name) => name.endsWith(".zip")),
    [],
    "checksum failures must not seed a partial bundled-engine cache",
  );

  const nonLinuxBinaryPath = createFixture("non-linux-binary-path", requiredAdvancedEngines, {
    binaryPathOverrides: { pandoc: "Pandoc.app/Contents/MacOS/pandoc" },
  });
  const nonLinuxBinaryPathResult = runPreparer(nonLinuxBinaryPath);
  assert.notEqual(nonLinuxBinaryPathResult.status, 0, "Linux engine manifests must reject non-Linux binary path entries");
  assert.match(
    `${nonLinuxBinaryPathResult.stderr}\n${nonLinuxBinaryPathResult.stdout}`,
    /pandoc: Linux engine binaryPaths must not reference non-Linux files/,
    "non-Linux binary path failures must identify the affected engine",
  );
  assert.equal(fs.existsSync(nonLinuxBinaryPath.manifestTarget), false, "non-Linux binary paths must not write an embedded manifest");

  const traversingBinaryPath = createFixture("traversing-binary-path", requiredAdvancedEngines, {
    binaryPathOverrides: { libvips: "../bin/vips" },
  });
  const traversingBinaryPathResult = runPreparer(traversingBinaryPath);
  assert.notEqual(traversingBinaryPathResult.status, 0, "Linux engine manifests must reject traversing binary path entries");
  assert.match(
    `${traversingBinaryPathResult.stderr}\n${traversingBinaryPathResult.stdout}`,
    /libvips: Linux engine binaryPath must not contain empty, current or parent path segments/,
    "traversing binary path failures must identify the affected engine",
  );
  assert.equal(fs.existsSync(traversingBinaryPath.manifestTarget), false, "traversing binary paths must not write an embedded manifest");

  const extraLocalAsset = createFixture("extra-local-asset", requiredAdvancedEngines, { extraAssets: ["unexpected-engine.zip"] });
  const extraLocalAssetResult = runPreparer(extraLocalAsset);
  assert.notEqual(extraLocalAssetResult.status, 0, "unexpected local Linux engine assets must fail");
  assert.match(
    `${extraLocalAssetResult.stderr}\n${extraLocalAssetResult.stdout}`,
    /Unexpected local Linux engine assets: unexpected-engine\.zip/,
    "unexpected local asset failures must name the extra asset",
  );
  assert.equal(fs.existsSync(extraLocalAsset.manifestTarget), false, "unexpected local assets must not write an embedded manifest");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Linux staged engine release asset tests passed.");

function createFixture(name, engineIds, options = {}) {
  const assetDir = path.join(tempDir, name, "assets");
  const cacheDir = path.join(tempDir, name, "cache");
  const manifestTarget = path.join(tempDir, name, "engines-manifest.embedded.json");
  fs.mkdirSync(assetDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const engines = [
    ...engineIds.map((engineId) => engineEntry(assetDir, engineId, "advanced", options)),
    ...(options.baseEngines ?? []).map((engineId) => engineEntry(assetDir, engineId, "base", options)),
  ];
  for (const extraAsset of options.extraAssets ?? []) {
    fs.writeFileSync(path.join(assetDir, extraAsset), "unexpected asset\n");
  }

  fs.writeFileSync(path.join(assetDir, "engines-manifest.json"), `${JSON.stringify({ manifestVersion: 1, engines }, null, 2)}\n`);
  return { assetDir, cacheDir, manifestTarget };
}

function engineEntry(assetDir, engineId, mode, options) {
    const archiveName = `${engineId}-compatible-linux-x64.zip`;
    const archivePath = path.join(assetDir, archiveName);
    fs.writeFileSync(archivePath, `${engineId} archive\n`);
    return {
      id: engineId,
      displayName: engineId,
      mode,
      version: "compatible",
      platform: "linux-x64",
      archiveType: "zip",
      downloadUrl: `https://github.com/Amix29/Multi-Converter/releases/download/linux-engine-test/${archiveName}`,
      sha256: options.corruptShaFor === engineId ? "1".repeat(64) : sha256File(archivePath),
      compressedSizeBytes: fs.statSync(archivePath).size,
      installedSizeBytes: fs.statSync(archivePath).size,
      binaryPaths: [options.binaryPathOverrides?.[engineId] ?? `bin/${engineId}`],
      healthCheck: `${engineId}-health`,
      licenseName: "Test",
      licenseUrl: null,
      noticeFiles: ["licenses/THIRD_PARTY_NOTICES.txt"],
      required: true,
      dependencies: [],
    };
}

function runPreparer(fixture) {
  return spawnSync(process.execPath, [
    "scripts/prepare-linux-engine-release-assets.mjs",
    "--from-local-assets",
    "--asset-dir",
    fixture.assetDir,
    "--cache-dir",
    fixture.cacheDir,
    "--manifest",
    fixture.manifestTarget,
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
