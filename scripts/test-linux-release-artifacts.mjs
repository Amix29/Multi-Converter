import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const version = "9.8.7";
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-linux-release-artifacts-"));
const bundleDir = path.join(tempDir, "bundle");
const outDir = path.join(tempDir, "out");

try {
  fs.mkdirSync(path.join(bundleDir, "appimage"), { recursive: true });
  const appImagePath = path.join(bundleDir, "appimage", "Multi-Converter_9.8.7_amd64.AppImage");
  const signaturePath = `${appImagePath}.sig`;
  const appImageBytes = fakeElf("fake appimage\n");
  fs.writeFileSync(appImagePath, appImageBytes);
  fs.writeFileSync(signaturePath, "fake appimage signature\n");

  const result = spawnSync(process.execPath, [
    "scripts/prepare-linux-release-artifacts.mjs",
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
    `Multi-Converter_${version}_linux-x64.AppImage`,
    `Multi-Converter_${version}_linux-x64.AppImage.sha256`,
    `Multi-Converter_${version}_linux-x64.AppImage.sig`,
    "Multi-Converter_linux-x64.AppImage",
  ].sort();
  const actual = fs.readdirSync(outDir).sort();
  assert.deepEqual(actual, expected);
  assert.deepEqual(
    fs.readFileSync(path.join(outDir, `Multi-Converter_${version}_linux-x64.AppImage`)),
    fs.readFileSync(path.join(outDir, "Multi-Converter_linux-x64.AppImage")),
    "stable AppImage alias must match the versioned AppImage",
  );
  assert.equal(
    fs.readFileSync(path.join(outDir, `Multi-Converter_${version}_linux-x64.AppImage.sha256`), "utf8"),
    `${sha256(appImageBytes)}  Multi-Converter_${version}_linux-x64.AppImage`,
  );

  const staleBundleDir = path.join(tempDir, "stale-bundle");
  const staleOutDir = path.join(tempDir, "stale-out");
  fs.mkdirSync(path.join(staleBundleDir, "appimage"), { recursive: true });
  const staleAppImagePath = path.join(staleBundleDir, "appimage", "Multi-Converter_1.0.4_amd64.AppImage");
  fs.writeFileSync(staleAppImagePath, fakeElf("stale appimage\n"));
  fs.writeFileSync(`${staleAppImagePath}.sig`, "stale appimage signature\n");
  const staleResult = spawnSync(process.execPath, [
    "scripts/prepare-linux-release-artifacts.mjs",
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
  assert.notEqual(staleResult.status, 0, "stale Linux AppImage source version unexpectedly passed");
  assert.match(`${staleResult.stderr}\n${staleResult.stdout}`, /appears to be version 1\.0\.4, expected 9\.8\.7/);

  const stableBundleDir = path.join(tempDir, "stable-bundle");
  const stableOutDir = path.join(tempDir, "stable-out");
  fs.mkdirSync(path.join(stableBundleDir, "appimage"), { recursive: true });
  const stableSourcePath = path.join(stableBundleDir, "appimage", "Multi-Converter_linux-x64.AppImage");
  fs.writeFileSync(stableSourcePath, fakeElf("stable appimage\n"));
  fs.writeFileSync(`${stableSourcePath}.sig`, "stable appimage signature\n");
  const stableResult = spawnSync(process.execPath, [
    "scripts/prepare-linux-release-artifacts.mjs",
    "--version",
    version,
    "--bundle-dir",
    stableBundleDir,
    "--out-dir",
    stableOutDir,
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(stableResult.status, 0, "unversioned Linux AppImage source unexpectedly passed");
  assert.match(`${stableResult.stderr}\n${stableResult.stdout}`, /filename must include version 9\.8\.7/);

  const wrongArchBundleDir = path.join(tempDir, "wrong-arch-bundle");
  const wrongArchOutDir = path.join(tempDir, "wrong-arch-out");
  fs.mkdirSync(path.join(wrongArchBundleDir, "appimage"), { recursive: true });
  const wrongArchPath = path.join(wrongArchBundleDir, "appimage", "Multi-Converter_9.8.7_amd64.AppImage");
  fs.writeFileSync(wrongArchPath, fakeElf("wrong arch appimage\n", { machine: 0xb7 }));
  fs.writeFileSync(`${wrongArchPath}.sig`, "wrong arch appimage signature\n");
  const wrongArchResult = spawnSync(process.execPath, [
    "scripts/prepare-linux-release-artifacts.mjs",
    "--version",
    version,
    "--bundle-dir",
    wrongArchBundleDir,
    "--out-dir",
    wrongArchOutDir,
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(wrongArchResult.status, 0, "non-x86_64 Linux AppImage source unexpectedly passed");
  assert.match(`${wrongArchResult.stderr}\n${wrongArchResult.stdout}`, /not an x86_64 ELF executable/);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Linux release artifact preparation tests passed.");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fakeElf(text, options = {}) {
  const header = Buffer.alloc(20);
  const machine = options.machine ?? 0x3e;
  header[0] = 0x7f;
  header[1] = 0x45;
  header[2] = 0x4c;
  header[3] = 0x46;
  header[4] = 0x02;
  header[5] = 0x01;
  header[18] = machine & 0xff;
  header[19] = (machine >> 8) & 0xff;
  return Buffer.concat([header, Buffer.from(text, "utf8")]);
}
