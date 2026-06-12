import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const version = "9.8.7";
const expectedName = `Multi-Converter_${version}_macos-universal.dmg`;
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-macos-dmg-artifact-"));

try {
  const bundleDir = path.join(fixtureRoot, "bundle", "dmg");
  const outDir = path.join(fixtureRoot, "out");
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, "Multi-Converter_9.8.7_universal.dmg"), "fake dmg\n");
  fs.writeFileSync(path.join(outDir, "stale.txt"), "stale\n");

  runScript(["--version", version, "--bundle-dir", bundleDir, "--out-dir", outDir]);
  assert.ok(fs.existsSync(path.join(outDir, expectedName)), "prepared DMG must use the release asset name");
  assert.ok(!fs.existsSync(path.join(outDir, "stale.txt")), "output directory must be cleaned before copying");

  const directOutDir = path.join(fixtureRoot, "direct-out");
  runScript(["--version", version, "--dmg", path.join(bundleDir, "Multi-Converter_9.8.7_universal.dmg"), "--out-dir", directOutDir]);
  assert.ok(fs.existsSync(path.join(directOutDir, expectedName)), "direct --dmg input must be copied with the release asset name");

  fs.writeFileSync(path.join(bundleDir, "extra.dmg"), "extra\n");
  runScriptFails(["--version", version, "--bundle-dir", bundleDir, "--out-dir", path.join(fixtureRoot, "multi-out")], "Expected exactly one macOS DMG");

  const emptyDmg = path.join(fixtureRoot, "empty.dmg");
  fs.writeFileSync(emptyDmg, "");
  runScriptFails(["--version", version, "--dmg", emptyDmg, "--out-dir", path.join(fixtureRoot, "empty-out")], "Missing or empty source macOS DMG");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("macOS DMG artifact tests passed.");

function runScript(args) {
  const result = spawnSync(process.execPath, ["scripts/prepare-macos-dmg-artifact.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runScriptFails(args, expectedMessage) {
  const result = spawnSync(process.execPath, ["scripts/prepare-macos-dmg-artifact.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, "script unexpectedly passed");
  assert.match(`${result.stderr}\n${result.stdout}`, new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
