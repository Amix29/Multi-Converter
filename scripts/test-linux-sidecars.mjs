import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const script = path.join(root, "scripts", "prepare-linux-sidecars.mjs");
const requiredAssets = [
  "ffmpeg-x86_64-unknown-linux-gnu",
  "ffprobe-x86_64-unknown-linux-gnu",
];

testValidAssets();
testChecksumMismatch();
testPlaceholderRejected();
testNonElfRejected();
testWrongArchitectureRejected();
testUnexpectedAssetRejected();

console.log("Linux sidecar staging tests passed.");

function testValidAssets() {
  const fixture = createFixture("valid");
  try {
    for (const asset of requiredAssets) {
      writeAsset(fixture.assetDir, asset, fakeElf(`${asset} fixture\n`));
    }

    const result = runPrepare(fixture.assetDir, fixture.outDir, "--skip-smoke", "1");
    assert.equal(result.status, 0, result.stderr || result.stdout);

    for (const asset of requiredAssets) {
      const staged = path.join(fixture.outDir, asset);
      assert.equal(fs.existsSync(staged), true, `${asset} should be staged`);
      assert.deepEqual(fs.readFileSync(staged), fakeElf(`${asset} fixture\n`));
      if (process.platform !== "win32") {
        assert.notEqual(fs.statSync(staged).mode & 0o111, 0, `${asset} should be executable`);
      }
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function testChecksumMismatch() {
  const fixture = createFixture("checksum");
  try {
    for (const asset of requiredAssets) {
      writeAsset(fixture.assetDir, asset, fakeElf(`${asset} fixture\n`));
    }
    fs.writeFileSync(path.join(fixture.assetDir, `${requiredAssets[0]}.sha256`), `${"0".repeat(64)}  ${requiredAssets[0]}\n`);

    const result = runPrepare(fixture.assetDir, fixture.outDir, "--skip-smoke", "1");
    assert.notEqual(result.status, 0, "checksum mismatch should fail");
    assert.match(result.stderr, /SHA-256 mismatch/, "checksum mismatch should explain the failure");
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function testPlaceholderRejected() {
  const fixture = createFixture("placeholder");
  try {
    writeAsset(fixture.assetDir, requiredAssets[0], "CI placeholder sidecar\n");
    writeAsset(fixture.assetDir, requiredAssets[1], fakeElf("ffprobe fixture\n"));

    const result = runPrepare(fixture.assetDir, fixture.outDir, "--skip-smoke", "1");
    assert.notEqual(result.status, 0, "placeholder sidecar should fail");
    assert.match(result.stderr, /placeholder sidecar rejected/, "placeholder failure should be explicit");
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function testNonElfRejected() {
  const fixture = createFixture("non-elf");
  try {
    writeAsset(fixture.assetDir, requiredAssets[0], "not an elf binary\n");
    writeAsset(fixture.assetDir, requiredAssets[1], fakeElf("ffprobe fixture\n"));

    const result = runPrepare(fixture.assetDir, fixture.outDir, "--skip-smoke", "1");
    assert.notEqual(result.status, 0, "non-ELF sidecar should fail");
    assert.match(result.stderr, /not an ELF executable/, "non-ELF failure should be explicit");
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function testWrongArchitectureRejected() {
  const fixture = createFixture("wrong-arch");
  try {
    writeAsset(fixture.assetDir, requiredAssets[0], fakeElf("ffmpeg fixture\n", { machine: 0xb7 }));
    writeAsset(fixture.assetDir, requiredAssets[1], fakeElf("ffprobe fixture\n"));

    const result = runPrepare(fixture.assetDir, fixture.outDir, "--skip-smoke", "1");
    assert.notEqual(result.status, 0, "non-x86_64 ELF sidecar should fail");
    assert.match(result.stderr, /not an x86_64 ELF executable/, "non-x86_64 failure should be explicit");
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function testUnexpectedAssetRejected() {
  const fixture = createFixture("unexpected");
  try {
    for (const asset of requiredAssets) {
      writeAsset(fixture.assetDir, asset, fakeElf(`${asset} fixture\n`));
    }
    fs.writeFileSync(path.join(fixture.assetDir, "ffmpeg-x86_64-unknown-linux-gnu.bak"), "unexpected backup\n");

    const result = runPrepare(fixture.assetDir, fixture.outDir, "--skip-smoke", "1");
    assert.notEqual(result.status, 0, "unexpected sidecar assets should fail");
    assert.match(result.stderr, /Unexpected Linux sidecar assets: ffmpeg-x86_64-unknown-linux-gnu\.bak/, "unexpected asset failure should name the extra file");
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function createFixture(name) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `mc-linux-sidecars-${name}-`));
  const assetDir = path.join(fixtureRoot, "assets");
  const outDir = path.join(fixtureRoot, "out");
  fs.mkdirSync(assetDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  return { root: fixtureRoot, assetDir, outDir };
}

function writeAsset(assetDir, name, content) {
  const filePath = path.join(assetDir, name);
  fs.writeFileSync(filePath, content);
  const checksum = createHash("sha256").update(content).digest("hex");
  fs.writeFileSync(path.join(assetDir, `${name}.sha256`), `${checksum}  ${name}\n`);
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

function runPrepare(assetDir, outDir, ...extraArgs) {
  return spawnSync(process.execPath, [script, "--asset-dir", assetDir, "--out-dir", outDir, ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}
