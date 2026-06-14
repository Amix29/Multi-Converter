import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const script = path.join(root, "scripts", "prepare-linux-sidecar-release-assets.mjs");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-linux-sidecar-release-assets-"));

try {
  testValidSidecars();
  testChecksumMismatch();
  testNonElfRejected();
  testWrongArchitectureRejected();
  testTarGzArchiveSourceAccepted();
  testTarXzArchiveSourceAccepted();
  testAppImageSourceRejected();
  testSourceInsideOutputRejected();
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Linux sidecar release asset tests passed.");

function testValidSidecars() {
  const fixture = createFixture("valid");
  const ffmpeg = writeFixture(fixture, "ffmpeg", fakeElf("ffmpeg fixture\n"));
  const ffprobe = writeFixture(fixture, "ffprobe", fakeElf("ffprobe fixture\n"));
  const result = runPrepare(fixture.outDir, ffmpeg, sha256File(ffmpeg), ffprobe, sha256File(ffprobe));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const name of [
    "ffmpeg-x86_64-unknown-linux-gnu",
    "ffmpeg-x86_64-unknown-linux-gnu.sha256",
    "ffprobe-x86_64-unknown-linux-gnu",
    "ffprobe-x86_64-unknown-linux-gnu.sha256",
  ]) {
    assert.equal(fs.existsSync(path.join(fixture.outDir, name)), true, `${name} should be generated`);
  }
}

function testChecksumMismatch() {
  const fixture = createFixture("checksum");
  const ffmpeg = writeFixture(fixture, "ffmpeg", fakeElf("ffmpeg fixture\n"));
  const ffprobe = writeFixture(fixture, "ffprobe", fakeElf("ffprobe fixture\n"));
  const result = runPrepare(fixture.outDir, ffmpeg, "0".repeat(64), ffprobe, sha256File(ffprobe));

  assert.notEqual(result.status, 0, "checksum mismatch should fail");
  assert.match(result.stderr, /SHA-256 mismatch/);
}

function testNonElfRejected() {
  const fixture = createFixture("non-elf");
  const ffmpeg = writeFixture(fixture, "ffmpeg", "not an elf\n");
  const ffprobe = writeFixture(fixture, "ffprobe", fakeElf("ffprobe fixture\n"));
  const result = runPrepare(fixture.outDir, ffmpeg, sha256File(ffmpeg), ffprobe, sha256File(ffprobe));

  assert.notEqual(result.status, 0, "non-ELF sidecar should fail");
  assert.match(result.stderr, /not an ELF executable/);
}

function testWrongArchitectureRejected() {
  const fixture = createFixture("wrong-arch");
  const ffmpeg = writeFixture(fixture, "ffmpeg", fakeElf("ffmpeg fixture\n", { machine: 0xb7 }));
  const ffprobe = writeFixture(fixture, "ffprobe", fakeElf("ffprobe fixture\n"));
  const result = runPrepare(fixture.outDir, ffmpeg, sha256File(ffmpeg), ffprobe, sha256File(ffprobe));

  assert.notEqual(result.status, 0, "non-x86_64 sidecar should fail");
  assert.match(result.stderr, /not an x86_64 ELF executable/);
}

function testTarGzArchiveSourceAccepted() {
  const fixture = createFixture("tar-gz-archive-source");
  const ffmpeg = writeArchiveFixture(fixture, "ffmpeg", fakeElf("ffmpeg fixture\n"), ".tar.gz");
  const ffprobe = writeFixture(fixture, "ffprobe", fakeElf("ffprobe fixture\n"));
  const result = runPrepare(fixture.outDir, ffmpeg, sha256File(ffmpeg), ffprobe, sha256File(ffprobe));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(fixture.outDir, "ffmpeg-x86_64-unknown-linux-gnu")), true, ".tar.gz sidecar source should be extracted and staged");
}

function testTarXzArchiveSourceAccepted() {
  const fixture = createFixture("tar-xz-archive-source");
  const ffmpeg = writeArchiveFixture(fixture, "ffmpeg", fakeElf("ffmpeg fixture\n"), ".tar.xz");
  const ffprobe = writeFixture(fixture, "ffprobe", fakeElf("ffprobe fixture\n"));
  const result = runPrepare(fixture.outDir, ffmpeg, sha256File(ffmpeg), ffprobe, sha256File(ffprobe));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(fixture.outDir, "ffmpeg-x86_64-unknown-linux-gnu")), true, ".tar.xz sidecar source should be extracted and staged");
}

function testAppImageSourceRejected() {
  const fixture = createFixture("appimage-source");
  const ffmpeg = writeFixture(fixture, "ffmpeg.AppImage", fakeElf("ffmpeg fixture\n"));
  const ffprobe = writeFixture(fixture, "ffprobe", fakeElf("ffprobe fixture\n"));
  const result = runPrepare(fixture.outDir, ffmpeg, sha256File(ffmpeg), ffprobe, sha256File(ffprobe));

  assert.notEqual(result.status, 0, "AppImage sidecar source should fail");
  assert.match(result.stderr, /not an AppImage/);
}

function testSourceInsideOutputRejected() {
  const fixture = createFixture("source-inside-output");
  fs.mkdirSync(fixture.outDir, { recursive: true });
  const ffmpeg = path.join(fixture.outDir, "ffmpeg");
  fs.writeFileSync(ffmpeg, fakeElf("ffmpeg fixture\n"));
  const ffprobe = writeFixture(fixture, "ffprobe", fakeElf("ffprobe fixture\n"));
  const result = runPrepare(fixture.outDir, ffmpeg, sha256File(ffmpeg), ffprobe, sha256File(ffprobe));

  assert.notEqual(result.status, 0, "sidecar source inside output directory should fail before cleanup");
  assert.match(result.stderr, /source must not be inside the output directory/);
}

function createFixture(name) {
  const fixtureRoot = path.join(tempDir, name);
  const inputDir = path.join(fixtureRoot, "input");
  const outDir = path.join(fixtureRoot, "out");
  fs.mkdirSync(inputDir, { recursive: true });
  return { inputDir, outDir };
}

function writeFixture(fixture, name, content) {
  const filePath = path.join(fixture.inputDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function writeArchiveFixture(fixture, executableName, content, extension) {
  const archiveRoot = path.join(fixture.inputDir, `${executableName}-archive-root`);
  fs.mkdirSync(archiveRoot, { recursive: true });
  fs.writeFileSync(path.join(archiveRoot, executableName), content);
  const archivePath = path.join(fixture.inputDir, `${executableName}${extension}`);
  const tarFlag = extension === ".tar.xz" ? "-cJf" : "-czf";
  const result = spawnSync("tar", [tarFlag, archivePath, "-C", archiveRoot, "."], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return archivePath;
}

function runPrepare(outDir, ffmpeg, ffmpegSha256, ffprobe, ffprobeSha256) {
  return spawnSync(process.execPath, [
    script,
    "--ffmpeg",
    ffmpeg,
    "--ffmpeg-sha256",
    ffmpegSha256,
    "--ffprobe",
    ffprobe,
    "--ffprobe-sha256",
    ffprobeSha256,
    "--out-dir",
    outDir,
    "--skip-smoke",
    "1",
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
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

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
