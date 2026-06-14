import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const version = "9.8.7";
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-macos-release-artifacts-"));
const bundleDir = path.join(tempDir, "bundle");
const outDir = path.join(tempDir, "out");

try {
  fs.mkdirSync(path.join(bundleDir, "dmg"), { recursive: true });
  fs.mkdirSync(path.join(bundleDir, "macos"), { recursive: true });
  fs.writeFileSync(path.join(bundleDir, "dmg", "Multi-Converter_9.8.7_universal.dmg"), "fake dmg\n");
  fs.writeFileSync(path.join(bundleDir, "macos", "Multi-Converter.app.tar.gz"), "fake updater\n");
  fs.writeFileSync(path.join(bundleDir, "macos", "Multi-Converter.app.tar.gz.sig"), "fake signature\n");

  const result = spawnSync(process.execPath, [
    "scripts/prepare-macos-release-artifacts.mjs",
    "--version",
    version,
    "--bundle-dir",
    bundleDir,
    "--out-dir",
    outDir,
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const expected = [
    `Multi-Converter_${version}_macos-universal.app.tar.gz`,
    `Multi-Converter_${version}_macos-universal.app.tar.gz.sig`,
    `Multi-Converter_${version}_macos-universal.dmg`,
    "Multi-Converter_macos-universal.dmg",
  ].sort();
  const actual = fs.readdirSync(outDir).sort();
  assert.deepEqual(actual, expected);
  assert.equal(
    fs.readFileSync(path.join(outDir, `Multi-Converter_${version}_macos-universal.dmg`), "utf8"),
    fs.readFileSync(path.join(outDir, "Multi-Converter_macos-universal.dmg"), "utf8"),
    "stable DMG alias must match the versioned DMG",
  );

  const staleBundleDir = path.join(tempDir, "stale-bundle");
  const staleOutDir = path.join(tempDir, "stale-out");
  fs.mkdirSync(path.join(staleBundleDir, "dmg"), { recursive: true });
  fs.mkdirSync(path.join(staleBundleDir, "macos"), { recursive: true });
  fs.writeFileSync(path.join(staleBundleDir, "dmg", "Multi-Converter_1.0.4_universal.dmg"), "stale dmg\n");
  fs.writeFileSync(path.join(staleBundleDir, "macos", "Multi-Converter.app.tar.gz"), "fake updater\n");
  fs.writeFileSync(path.join(staleBundleDir, "macos", "Multi-Converter.app.tar.gz.sig"), "fake signature\n");
  const staleResult = spawnSync(process.execPath, [
    "scripts/prepare-macos-release-artifacts.mjs",
    "--version",
    version,
    "--bundle-dir",
    staleBundleDir,
    "--out-dir",
    staleOutDir,
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(staleResult.status, 0, "stale macOS DMG source version unexpectedly passed");
  assert.match(`${staleResult.stderr}\n${staleResult.stdout}`, /appears to be version 1\.0\.4, expected 9\.8\.7/);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("macOS release artifact preparation tests passed.");
