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
  assert.equal(invocation.cargoTargetDir, unsignedTargetDir);
  const history = JSON.parse(fs.readFileSync(fakeLog + ".history", "utf8"));
  if (process.platform === "win32") {
    assert.deepEqual(history.map(item => item.args[0]), ["build", "bundle"]);
    assert.ok(history[0].args.includes("--no-bundle"));
    assert.deepEqual(history[0].config.bundle, { resources: [], externalBin: [], createUpdaterArtifacts: false });
    assert.equal(history[1].config.bundle.createUpdaterArtifacts, false);
    const resources = history[1].config.bundle.resources;
    assert.equal(resources["bundled-engine-profiles/windows-x64/v3/ocr/"], null);
    assert.equal(resources["bundled-engine-profiles/windows-x64/v3/libreoffice/"], null);
    assert.equal(Object.values(resources).filter(Boolean).length, 2);
    assert.ok(Object.keys(resources).filter(key => resources[key]).every(key => path.isAbsolute(key) && key.includes("mc-pack-")));
  } else {
    assert.equal(invocation.args[0], "build");
    assert.deepEqual(invocation.config, { bundle: { createUpdaterArtifacts: false } });
  }
  const preserved = fs.readdirSync(path.dirname(unsignedBundleRoot)).find(name => name.startsWith("bundle-preserved-"));
  assert.ok(preserved, "Previous installer must be preserved by move");
  assert.equal(fs.readFileSync(path.join(path.dirname(unsignedBundleRoot), preserved, "nsis/old-installer.exe"), "utf8"), "stale\n");

  if (process.platform === "win32") {
    const failed = runTauri(["build"], fakeBin, fakeLog, unsignedTargetDir, { FAKE_TAURI_FAIL_BUILD: "1" });
    assert.equal(failed.status, 17, "Compile failure must propagate");
    const failedHistory = JSON.parse(fs.readFileSync(fakeLog + ".history", "utf8"));
    assert.equal(failedHistory.length, 1, "A failed compile must never bundle a stale executable");
    assert.equal(failedHistory[0].args[0], "build");
  }

  const macosTargetDir = path.join(fixtureRoot, "macos-target");
  const macosBundleRoot = path.join(macosTargetDir, "release", "bundle");
  fs.mkdirSync(path.join(macosBundleRoot, "dmg"), { recursive: true });
  fs.writeFileSync(path.join(macosBundleRoot, "dmg", "old.dmg"), "stale\n");

  if (process.platform !== "darwin") {
    result = runTauri(
      ["build", "--target", "aarch64-apple-darwin", "--bundles", "dmg", "--config", "src-tauri/tauri.macos.conf.json"],
      fakeBin,
      fakeLog,
      macosTargetDir,
    );
    assert.notEqual(result.status, 0, "non-macOS hosts must not start a Apple Silicon macOS build");
    assert.match(result.stderr, /macOS Apple Silicon DMG builds must run on an Apple Silicon Mac/);
    assert.ok(!fs.existsSync(fakeLog), "Tauri must not be invoked after a non-macOS universal build refusal");
    assert.ok(fs.existsSync(macosBundleRoot), "refused builds must preserve existing artifacts");
    fs.mkdirSync(path.join(macosBundleRoot, "dmg"), { recursive: true });
    fs.writeFileSync(path.join(macosBundleRoot, "dmg", "old.dmg"), "stale\n");
  }

  for (const target of ["x86_64-apple-darwin", "universal-apple-darwin"]) {
    const refused = runTauri(["build", "--target", target], fakeBin, fakeLog, macosTargetDir,
      { MULTI_CONVERTER_ALLOW_NON_DARWIN_MACOS_BUILD: "1" });
    assert.notEqual(refused.status, 0, "unsupported Mac targets must fail even with host-test bypass");
    assert.match(refused.stderr, /Only Apple Silicon/);
    assert.ok(!fs.existsSync(fakeLog), "unsupported targets must not invoke Tauri");
    assert.ok(fs.existsSync(macosBundleRoot), "unsupported targets must preserve existing artifacts");
  }

  result = runTauri(
    ["build", "--target", "aarch64-apple-darwin", "--bundles", "dmg", "--config", "src-tauri/tauri.macos.conf.json"],
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
    "aarch64-apple-darwin",
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
  fs.rmSync(fakeLog + ".history", { force: true });
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
      'const args = process.argv.slice(2);',
      'const index = args.indexOf("--config");',
      'const config = index >= 0 ? JSON.parse(fs.readFileSync(args[index + 1], "utf8")) : null;',
      'const historyPath = process.env.FAKE_TAURI_LOG + ".history";',
      'const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, "utf8")) : [];',
      'history.push({ args, config });',
      'fs.writeFileSync(historyPath, JSON.stringify(history));',
      'if (process.env.FAKE_TAURI_FAIL_BUILD === "1" && args[0] === "build") process.exit(17);',
      "fs.writeFileSync(process.env.FAKE_TAURI_LOG, JSON.stringify({",
      "  args, config,",
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
