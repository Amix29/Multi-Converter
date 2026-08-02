import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function createReleaseAssetTestTools({
  linuxAppImage,
  linuxAppImageSignature,
  macosDmg,
  macosUpdaterArchive,
  macosUpdaterSignature,
  root,
  signing,
  signingDir,
  stableInstaller,
  stableLinuxAppImage,
  stableMacosDmg,
  tag,
  version,
  versionedInstaller,
  windowsNotes,
}) {
  function writeWindowsAssets(dir, releaseNotes = windowsNotes, options = {}) {
    const installerBytes = Buffer.from("fake installer\n", "utf8");
    const installerPath = path.join(dir, versionedInstaller);
    const signaturePath = path.join(dir, `${versionedInstaller}.sig`);
    fs.writeFileSync(installerPath, installerBytes);
    fs.writeFileSync(path.join(dir, stableInstaller), installerBytes);
    signUpdaterFixture(installerPath, signaturePath);
    const signature = fs.readFileSync(signaturePath, "utf8").trim();
    const platforms = {
      "windows-x86_64": {
        signature,
        url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${versionedInstaller}`,
      },
      "windows-x86_64-nsis": {
        signature,
        url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${versionedInstaller}`,
      },
    };
    if (options.includeDarwinUpdater) {
      platforms["darwin-universal"] = {
        signature,
        url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/Multi-Converter_${version}_macos-universal.dmg`,
      };
    }
    if (options.includeMacosUpdater) {
      const macosSignature = fs.readFileSync(path.join(dir, macosUpdaterSignature), "utf8").trim();
      const macosUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${macosUpdaterArchive}`;
      platforms["darwin-aarch64"] = {
        signature: macosSignature,
        url: macosUrl,
      };
      platforms["darwin-x86_64"] = {
        signature: macosSignature,
        url: macosUrl,
      };
    }
    if (options.includeLinuxUpdater) {
      const linuxSignature = fs.readFileSync(path.join(dir, linuxAppImageSignature), "utf8").trim();
      platforms["linux-x86_64"] = {
        signature: linuxSignature,
        url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${linuxAppImage}`,
      };
    }
    fs.writeFileSync(path.join(dir, `${versionedInstaller}.sha256`), `${sha256(installerBytes)}  ${versionedInstaller}`);
    fs.writeFileSync(
      path.join(dir, "latest.json"),
      `${JSON.stringify(
        {
          version,
          notes: releaseNotes,
          pub_date: "2026-06-11T00:00:00.000Z",
          platforms,
        },
        null,
        2,
      )}\n`,
    );
  }

  function writeMacosAssets(dir) {
    const dmgBytes = Buffer.from("fake dmg\n", "utf8");
    const updaterBytes = Buffer.from("fake macos updater archive\n", "utf8");
    fs.writeFileSync(path.join(dir, macosDmg), dmgBytes);
    fs.writeFileSync(path.join(dir, stableMacosDmg), dmgBytes);
    const updaterPath = path.join(dir, macosUpdaterArchive);
    fs.writeFileSync(updaterPath, updaterBytes);
    signUpdaterFixture(updaterPath, path.join(dir, macosUpdaterSignature));
  }

  function writeLinuxAssets(dir) {
    const appImageBytes = fakeX86_64Elf("fake linux appimage\n");
    const appImagePath = path.join(dir, linuxAppImage);
    fs.writeFileSync(appImagePath, appImageBytes);
    fs.writeFileSync(path.join(dir, stableLinuxAppImage), appImageBytes);
    signUpdaterFixture(appImagePath, path.join(dir, linuxAppImageSignature));
    fs.writeFileSync(path.join(dir, `${linuxAppImage}.sha256`), `${sha256(appImageBytes)}  ${linuxAppImage}`);
  }

  function writeLinuxLatest(dir, releaseNotes, options = {}) {
    const signature = options.signature ?? fs.readFileSync(path.join(dir, linuxAppImageSignature), "utf8").trim();
    fs.writeFileSync(
      path.join(dir, "latest.json"),
      `${JSON.stringify(
        {
          version,
          notes: releaseNotes,
          pub_date: "2026-06-11T00:00:00.000Z",
          platforms: {
            "linux-x86_64": {
              signature,
              url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${linuxAppImage}`,
            },
          },
        },
        null,
        2,
      )}\n`,
    );
  }

  function runValidator(dir, platform) {
    const result = spawnSync(process.execPath, [
      "scripts/validate-release-assets.mjs",
      "--version",
      version,
      "--dir",
      dir,
      "--platform",
      platform,
      "--updater-public-key",
      signing.updaterPublicKeyPath,
      "--updater-signature-verifier",
      signing.updaterSignatureVerifierPath,
      ...(platform === "all" || platform === "macos" || platform === "desktop" ? [
        "--macos-dmg-sha256",
        sha256(fs.readFileSync(path.join(dir, macosDmg))),
        "--macos-updater-sha256",
        sha256(fs.readFileSync(path.join(dir, macosUpdaterArchive))),
      ] : []),
      ...(platform === "linux" || platform === "windows-linux" || platform === "desktop" ? [
        "--linux-appimage-sha256",
        sha256(fs.readFileSync(path.join(dir, linuxAppImage))),
      ] : []),
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  function runValidatorFails(dir, platform, expectedMessage) {
    const args = [
      "scripts/validate-release-assets.mjs",
      "--version",
      version,
      "--dir",
      dir,
      "--platform",
      platform,
      "--updater-public-key",
      signing.updaterPublicKeyPath,
      "--updater-signature-verifier",
      signing.updaterSignatureVerifierPath,
    ];
    const dmgPath = path.join(dir, macosDmg);
    if (fs.existsSync(dmgPath)) {
      args.push("--macos-dmg-sha256", sha256(fs.readFileSync(dmgPath)));
    }
    const updaterPath = path.join(dir, macosUpdaterArchive);
    if (fs.existsSync(updaterPath)) {
      args.push("--macos-updater-sha256", sha256(fs.readFileSync(updaterPath)));
    }
    const linuxAppImagePath = path.join(dir, linuxAppImage);
    if (fs.existsSync(linuxAppImagePath)) {
      args.push("--linux-appimage-sha256", sha256(fs.readFileSync(linuxAppImagePath)));
    }
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    assert.notEqual(result.status, 0, "validator unexpectedly passed");
    const output = `${result.stderr}\n${result.stdout}`;
    assert.match(output, new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), output);
  }

  function runReleaseNotesValidator(notesPath, includeMacos, includeLinux) {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/validate-release-notes.mjs",
        "--version",
        version,
        "--notes-file",
        notesPath,
        "--include-macos",
        String(includeMacos),
        "--include-linux",
        String(includeLinux),
        "--min-length",
        "200",
      ],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  function runReleaseNotesValidatorFails(notesPath, includeMacos, includeLinux, expectedMessage) {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/validate-release-notes.mjs",
        "--version",
        version,
        "--notes-file",
        notesPath,
        "--include-macos",
        String(includeMacos),
        "--include-linux",
        String(includeLinux),
        "--min-length",
        "200",
      ],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    assert.notEqual(result.status, 0, "release notes validator unexpectedly passed");
    const output = `${result.stderr}\n${result.stdout}`;
    assert.match(output, new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), output);
  }

  function writeBundleFixture(dir) {
    const installerBytes = Buffer.from("fake installer\n", "utf8");
    const installerPath = path.join(dir, versionedInstaller);
    fs.writeFileSync(installerPath, installerBytes);
    signUpdaterFixture(installerPath, path.join(dir, `${versionedInstaller}.sig`));
  }

  function runPrepare(bundleDir, outDir, releaseNotes, macosDmg, macosUpdaterArchivePath, macosUpdaterSignaturePath) {
    const result = runPrepareProcess(bundleDir, outDir, releaseNotes, macosDmg, macosUpdaterArchivePath, macosUpdaterSignaturePath);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  function runPrepareFails(
    bundleDir,
    outDir,
    releaseNotes,
    macosDmg,
    macosUpdaterArchivePath,
    macosUpdaterSignaturePath,
    expectedMessage,
    linuxAppImagePath = null,
    linuxAppImageSignaturePath = null,
  ) {
    const result = runPrepareProcess(
      bundleDir,
      outDir,
      releaseNotes,
      macosDmg,
      macosUpdaterArchivePath,
      macosUpdaterSignaturePath,
      linuxAppImagePath,
      linuxAppImageSignaturePath,
    );
    assert.notEqual(result.status, 0, "prepare-release-assets unexpectedly passed");
    const output = `${result.stderr}\n${result.stdout}`;
    assert.match(output, new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), output);
  }

  function runPrepareProcess(
    bundleDir,
    outDir,
    releaseNotes,
    macosDmg,
    macosUpdaterArchivePath,
    macosUpdaterSignaturePath,
    linuxAppImagePath = null,
    linuxAppImageSignaturePath = null,
  ) {
    const args = [
      "scripts/prepare-release-assets.mjs",
      "--version",
      version,
      "--bundle-dir",
      bundleDir,
      "--dir",
      outDir,
      "--notes-env",
      "MC_TEST_RELEASE_NOTES",
    ];
    if (macosDmg) {
      args.push("--macos-dmg", macosDmg);
    }
    if (macosUpdaterArchivePath) {
      args.push("--macos-updater-archive", macosUpdaterArchivePath);
    }
    if (macosUpdaterSignaturePath) {
      args.push("--macos-updater-signature", macosUpdaterSignaturePath);
    }
    if (linuxAppImagePath) {
      args.push("--linux-appimage", linuxAppImagePath);
    }
    if (linuxAppImageSignaturePath) {
      args.push("--linux-appimage-signature", linuxAppImageSignaturePath);
    }
    return spawnSync(process.execPath, args, {
      cwd: root,
      env: { ...process.env, MC_TEST_RELEASE_NOTES: releaseNotes },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
  }

  function fakeX86_64Elf(text) {
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

  function generateUpdaterSigningKey(dir) {
    const keyPath = path.join(dir, "updater-test-key");
    const result = spawnSync(process.execPath, [tauriCliPath(), "signer", "generate", "--ci", "-w", keyPath, "-p", ""], {
      cwd: root,
      env: signerEnv(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const encodedPublicKey = fs.readFileSync(`${keyPath}.pub`, "utf8").trim();
    const publicKey = Buffer.from(encodedPublicKey, "base64").toString("utf8");
    const decodedPublicKeyPath = path.join(dir, "updater-test-key.decoded.pub");
    fs.writeFileSync(decodedPublicKeyPath, publicKey, "utf8");
    return decodedPublicKeyPath;
  }

  function buildUpdaterSignatureVerifier(dir) {
    const manifestPath = path.join("tools", "updater-signature-verifier", "Cargo.toml");
    const result = spawnSync("cargo", ["build", "--manifest-path", manifestPath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const binary = path.join(root, "tools", "updater-signature-verifier", "target", "debug", process.platform === "win32" ? "mc-release-sigcheck.exe" : "mc-release-sigcheck");
    assert.ok(fs.existsSync(binary), `Missing updater signature verifier: ${binary}`);
    return binary;
  }

  function signUpdaterFixture(filePath, signaturePath) {
    fs.rmSync(signaturePath, { force: true });
    const result = spawnSync(process.execPath, [tauriCliPath(), "signer", "sign", "-f", path.join(signingDir, "updater-test-key"), "-p", "", filePath], {
      cwd: root,
      env: signerEnv(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(fs.existsSync(signaturePath), `Missing generated signature: ${signaturePath}`);
  }

  function signerEnv() {
    const env = { ...process.env };
    delete env.TAURI_SIGNING_PRIVATE_KEY;
    delete env.TAURI_SIGNING_PRIVATE_KEY_PATH;
    delete env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
    return env;
  }

  function tauriCliPath() {
    return path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
  }

  return {
    buildUpdaterSignatureVerifier,
    fakeX86_64Elf,
    generateUpdaterSigningKey,
    runPrepare,
    runPrepareFails,
    runReleaseNotesValidator,
    runReleaseNotesValidatorFails,
    runValidator,
    runValidatorFails,
    sha256,
    signUpdaterFixture,
    writeBundleFixture,
    writeLinuxAssets,
    writeLinuxLatest,
    writeMacosAssets,
    writeWindowsAssets,
  };
}
