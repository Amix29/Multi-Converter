import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-bundled-platform-"));
const validator = path.join(root, "scripts", "validate-bundled-engines.mjs");

try {
  writeFixture();
  runValidator("windows-x64");
  runLinuxValidatorFailsWithNonElfSidecar();
  runLinuxValidatorFailsWithAdvancedRequirement();
  runLinuxValidatorFailsWithForeignAdvancedBinaryPath();

  const staleEngineRoot = path.join(fixtureRoot, "src-tauri", "bundled-engines", "pdfium", "compatible");
  fs.mkdirSync(staleEngineRoot, { recursive: true });
  fs.writeFileSync(path.join(staleEngineRoot, "engine.json"), JSON.stringify({ engineId: "pdfium", platform: "macos-universal" }));
  runValidatorFails("windows-x64", "moteur embarque hors plateforme");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("Bundled engine platform tests passed.");

function writeFixture() {
  const binariesDir = path.join(fixtureRoot, "src-tauri", "binaries");
  const bundledEnginesDir = path.join(fixtureRoot, "src-tauri", "bundled-engines");
  const rustSrcDir = path.join(fixtureRoot, "src-tauri", "src");
  fs.mkdirSync(binariesDir, { recursive: true });
  fs.mkdirSync(bundledEnginesDir, { recursive: true });
  fs.mkdirSync(rustSrcDir, { recursive: true });
  fs.copyFileSync(path.join(root, "src-tauri", "src", "engines.rs"), path.join(rustSrcDir, "engines.rs"));
  linkFixtureBinary("ffmpeg-x86_64-pc-windows-msvc.exe");
  linkFixtureBinary("ffprobe-x86_64-pc-windows-msvc.exe");
  fs.writeFileSync(
    path.join(fixtureRoot, "src-tauri", "engines-manifest.json"),
    `${JSON.stringify({ manifestVersion: 1, generatedAt: "2026-06-12T00:00:00.000Z", engines: [] }, null, 2)}\n`,
  );
}

function linkFixtureBinary(fileName) {
  const source = path.join(root, "src-tauri", "binaries", fileName);
  assert.ok(fs.existsSync(source), `missing source sidecar: ${source}`);
  const target = path.join(fixtureRoot, "src-tauri", "binaries", fileName);
  try {
    fs.linkSync(source, target);
  } catch {
    fs.copyFileSync(source, target);
  }
}

function runValidator(platform) {
  const result = spawnSync(process.execPath, [validator], {
    cwd: fixtureRoot,
    env: { ...process.env, MULTI_CONVERTER_ENGINE_PLATFORM: platform, MULTI_CONVERTER_SKIP_ENGINE_SMOKE: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runValidatorFails(platform, expectedMessage) {
  const result = spawnSync(process.execPath, [validator], {
    cwd: fixtureRoot,
    env: { ...process.env, MULTI_CONVERTER_ENGINE_PLATFORM: platform, MULTI_CONVERTER_SKIP_ENGINE_SMOKE: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, "validator unexpectedly passed");
  assert.match(`${result.stderr}\n${result.stdout}`, new RegExp(expectedMessage));
}

function runLinuxValidatorFailsWithAdvancedRequirement() {
  writeFixtureLinuxSidecars({ elf: true });
  const result = spawnSync(process.execPath, [validator], {
    cwd: fixtureRoot,
    env: {
      ...process.env,
      MULTI_CONVERTER_ENGINE_PLATFORM: "linux-x64",
      MULTI_CONVERTER_SKIP_ENGINE_SMOKE: "1",
      MULTI_CONVERTER_REQUIRE_ADVANCED_ENGINES: "1",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, "strict Linux validation should fail without advanced engines");
  assert.match(`${result.stderr}\n${result.stdout}`, /strict release validation requires platform-specific advanced engines/);
}

function runLinuxValidatorFailsWithForeignAdvancedBinaryPath() {
  writeFixtureLinuxSidecars({ elf: true });
  writeLinuxAdvancedEngineWithForeignBinaryPath();
  const result = spawnSync(process.execPath, [validator], {
    cwd: fixtureRoot,
    env: {
      ...process.env,
      MULTI_CONVERTER_ENGINE_PLATFORM: "linux-x64",
      MULTI_CONVERTER_SKIP_ENGINE_SMOKE: "1",
      MULTI_CONVERTER_REQUIRE_ADVANCED_ENGINES: "1",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, "Linux validation should fail for foreign advanced binary paths");
  assert.match(`${result.stderr}\n${result.stdout}`, /chemin binaire non-Linux dans le manifeste/);
}

function runLinuxValidatorFailsWithNonElfSidecar() {
  writeFixtureLinuxSidecars({ elf: false });
  const result = spawnSync(process.execPath, [validator], {
    cwd: fixtureRoot,
    env: {
      ...process.env,
      MULTI_CONVERTER_ENGINE_PLATFORM: "linux-x64",
      MULTI_CONVERTER_SKIP_ENGINE_SMOKE: "1",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, "Linux validation should fail for non-ELF sidecars");
  assert.match(`${result.stderr}\n${result.stdout}`, /fichier Linux non-ELF/);
}

function writeFixtureLinuxSidecars({ elf }) {
  const binariesDir = path.join(fixtureRoot, "src-tauri", "binaries");
  for (const fileName of ["ffmpeg-x86_64-unknown-linux-gnu", "ffprobe-x86_64-unknown-linux-gnu"]) {
    const target = path.join(binariesDir, fileName);
    fs.writeFileSync(target, elf ? fakeElf("linux fixture sidecar\n") : "linux fixture sidecar\n");
    fs.chmodSync(target, 0o755);
  }
}

function fakeElf(text) {
  const header = Buffer.alloc(20);
  header[0] = 0x7f;
  header[1] = 0x45;
  header[2] = 0x4c;
  header[3] = 0x46;
  header[4] = 0x02;
  header[5] = 0x01;
  header[18] = 0x3e;
  header[19] = 0x00;
  return Buffer.concat([header, Buffer.from(text, "utf8")]);
}

function writeLinuxAdvancedEngineWithForeignBinaryPath() {
  const engine = {
    id: "pdfium",
    displayName: "PDFium",
    mode: "advanced",
    version: "compatible",
    platform: "linux-x64",
    archiveType: "zip",
    downloadUrl: "https://github.com/Amix29/Multi-Converter/releases/download/linux-test/pdfium-compatible-linux-x64.zip",
    sha256: "a".repeat(64),
    compressedSizeBytes: 1,
    installedSizeBytes: 1,
    binaryPaths: ["bin/pdfium-render-x86_64-pc-windows-msvc.exe"],
    healthCheck: "pdfium-render",
    licenseName: "BSD-3-Clause",
    licenseUrl: null,
    noticeFiles: ["licenses/THIRD_PARTY_NOTICES.txt"],
    required: true,
    dependencies: [],
  };
  const engineRoot = path.join(fixtureRoot, "src-tauri", "bundled-engines", "pdfium", "compatible");
  fs.mkdirSync(path.join(engineRoot, "bin"), { recursive: true });
  fs.mkdirSync(path.join(engineRoot, "licenses"), { recursive: true });
  fs.writeFileSync(path.join(engineRoot, "bin", "pdfium-render-x86_64-pc-windows-msvc.exe"), fakeElf("pdfium fixture\n"));
  fs.writeFileSync(path.join(engineRoot, "licenses", "THIRD_PARTY_NOTICES.txt"), "notices\n");
  fs.writeFileSync(path.join(engineRoot, "engine.json"), `${JSON.stringify({
    packageFormatVersion: 1,
    engineId: engine.id,
    displayName: engine.displayName,
    mode: engine.mode,
    version: engine.version,
    platform: engine.platform,
    healthCheck: engine.healthCheck,
    licenseName: engine.licenseName,
    binaryPaths: engine.binaryPaths,
    licenseFiles: ["licenses/THIRD_PARTY_NOTICES.txt"],
    noticeFiles: ["licenses/THIRD_PARTY_NOTICES.txt"],
  }, null, 2)}\n`);
  fs.writeFileSync(
    path.join(fixtureRoot, "src-tauri", "engines-manifest.json"),
    `${JSON.stringify({ manifestVersion: 1, generatedAt: "2026-06-12T00:00:00.000Z", engines: [engine] }, null, 2)}\n`,
  );
}
