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
  fs.mkdirSync(binariesDir, { recursive: true });
  fs.mkdirSync(bundledEnginesDir, { recursive: true });
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
    env: { ...process.env, MULTI_CONVERTER_ENGINE_PLATFORM: platform },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runValidatorFails(platform, expectedMessage) {
  const result = spawnSync(process.execPath, [validator], {
    cwd: fixtureRoot,
    env: { ...process.env, MULTI_CONVERTER_ENGINE_PLATFORM: platform },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, "validator unexpectedly passed");
  assert.match(`${result.stderr}\n${result.stdout}`, new RegExp(expectedMessage));
}
