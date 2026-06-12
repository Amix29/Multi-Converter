import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-run-tauri-"));

try {
  const fakeBin = path.join(fixtureRoot, "bin");
  const fakeLog = path.join(fixtureRoot, "fake-tauri-log.json");
  writeFakeTauri(fakeBin, fakeLog);

  const unsignedTargetDir = path.join(fixtureRoot, "unsigned-target");
  const unsignedBundleRoot = path.join(unsignedTargetDir, "release", "bundle");
  fs.mkdirSync(path.join(unsignedBundleRoot, "nsis"), { recursive: true });
  fs.writeFileSync(path.join(unsignedBundleRoot, "nsis", "old-installer.exe"), "stale\n");

  let result = runTauri(["build"], fakeBin, fakeLog, unsignedTargetDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(!fs.existsSync(unsignedBundleRoot), "build must clean stale bundle artifacts before invoking Tauri");

  let invocation = readInvocation(fakeLog);
  assert.equal(invocation.cargoTargetDir, unsignedTargetDir, "run-tauri must pass the selected CARGO_TARGET_DIR to Tauri");
  assert.equal(invocation.args[0], "build");
  assert.ok(invocation.args.includes("--config"), "unsigned Windows builds must disable updater artifacts through a temporary config");
  const unsignedConfigPath = invocation.args[invocation.args.indexOf("--config") + 1];
  assert.deepEqual(JSON.parse(fs.readFileSync(unsignedConfigPath, "utf8")), {
    bundle: { createUpdaterArtifacts: false },
  });

  const macosTargetDir = path.join(fixtureRoot, "macos-target");
  const macosBundleRoot = path.join(macosTargetDir, "release", "bundle");
  fs.mkdirSync(path.join(macosBundleRoot, "dmg"), { recursive: true });
  fs.writeFileSync(path.join(macosBundleRoot, "dmg", "old.dmg"), "stale\n");

  if (process.platform !== "darwin") {
    result = runTauri(
      ["build", "--target", "universal-apple-darwin", "--bundles", "dmg", "--config", "src-tauri/tauri.macos.conf.json"],
      fakeBin,
      fakeLog,
      macosTargetDir,
    );
    assert.notEqual(result.status, 0, "non-macOS hosts must not start a universal macOS build");
    assert.match(result.stderr, /macOS universal DMG builds must run on macOS/);
    assert.ok(!fs.existsSync(fakeLog), "Tauri must not be invoked after a non-macOS universal build refusal");
    assert.ok(!fs.existsSync(macosBundleRoot), "refused macOS builds should still clean stale bundle artifacts");
    fs.mkdirSync(path.join(macosBundleRoot, "dmg"), { recursive: true });
    fs.writeFileSync(path.join(macosBundleRoot, "dmg", "old.dmg"), "stale\n");
  }

  result = runTauri(
    ["build", "--target", "universal-apple-darwin", "--bundles", "dmg", "--config", "src-tauri/tauri.macos.conf.json"],
    fakeBin,
    fakeLog,
    macosTargetDir,
    { MULTI_CONVERTER_ALLOW_NON_DARWIN_MACOS_BUILD: "1" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(!fs.existsSync(macosBundleRoot), "macOS builds must also clean stale bundle artifacts before invoking Tauri");

  invocation = readInvocation(fakeLog);
  assert.deepEqual(invocation.args, [
    "build",
    "--target",
    "universal-apple-darwin",
    "--bundles",
    "dmg",
    "--config",
    "src-tauri/tauri.macos.conf.json",
  ]);
  assert.equal(
    invocation.args.filter((arg) => arg === "--config").length,
    1,
    "builds with an explicit config must not receive a second unsigned-build config",
  );
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("Tauri wrapper tests passed.");

function runTauri(args, fakeBin, fakeLog, targetDir, extraEnv = {}) {
  fs.rmSync(fakeLog, { force: true });
  return spawnSync(process.execPath, ["scripts/run-tauri.mjs", ...args], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
      CARGO_TARGET_DIR: targetDir,
      FAKE_TAURI_LOG: fakeLog,
      TAURI_SIGNING_PRIVATE_KEY: "",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
      ...extraEnv,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function readInvocation(fakeLog) {
  assert.ok(fs.existsSync(fakeLog), "fake Tauri command was not invoked");
  return JSON.parse(fs.readFileSync(fakeLog, "utf8"));
}

function writeFakeTauri(fakeBin, fakeLog) {
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeScript = path.join(fakeBin, "fake-tauri.mjs");
  fs.writeFileSync(
    fakeScript,
    [
      'import fs from "node:fs";',
      "fs.writeFileSync(process.env.FAKE_TAURI_LOG, JSON.stringify({",
      "  args: process.argv.slice(2),",
      "  cargoTargetDir: process.env.CARGO_TARGET_DIR,",
      "}, null, 2));",
    ].join("\n"),
  );

  if (process.platform === "win32") {
    fs.writeFileSync(path.join(fakeBin, "tauri.cmd"), `@"${process.execPath}" "${fakeScript}" %*\r\nexit /b %ERRORLEVEL%\r\n`);
  } else {
    const shim = path.join(fakeBin, "tauri");
    fs.writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${fakeScript}" "$@"\n`);
    fs.chmodSync(shim, 0o755);
  }

  assert.ok(fs.existsSync(fakeLog) === false, `unexpected fake log already exists: ${fakeLog}`);
}
