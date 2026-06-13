import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  downloadIfMissingVerified,
  publicSourceLabel,
  requireSha256Env,
} from "./lib/download-integrity.mjs";

const root = process.cwd();
const version = process.env.LIBREOFFICE_VERSION ?? "26.2.3";
const downloadsDir = path.join(root, "engine-sources", ".downloads");
const sourceDir = path.join(root, "engine-sources", "macos-universal", "libreoffice");
const workDir = path.join(os.tmpdir(), "mc-libreoffice-macos");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };
const inputs = [
  {
    arch: "aarch64",
    fileName: `LibreOffice_${version}_MacOS_aarch64.dmg`,
    url: process.env.LIBREOFFICE_MAC_AARCH64_DMG_URL
      ?? `https://download.documentfoundation.org/libreoffice/stable/${version}/mac/aarch64/LibreOffice_${version}_MacOS_aarch64.dmg`,
    shaEnv: "LIBREOFFICE_MACOS_AARCH64_DMG_SHA256",
  },
  {
    arch: "x86_64",
    fileName: `LibreOffice_${version}_MacOS_x86-64.dmg`,
    url: process.env.LIBREOFFICE_MAC_X86_64_DMG_URL
      ?? `https://download.documentfoundation.org/libreoffice/stable/${version}/mac/x86_64/LibreOffice_${version}_MacOS_x86-64.dmg`,
    shaEnv: "LIBREOFFICE_MACOS_X86_64_DMG_SHA256",
  },
];

if (process.platform !== "darwin") {
  throw new Error("macOS LibreOffice engine preparation must run on macOS so hdiutil can mount the official DMGs.");
}

requireCommand("hdiutil", ["help"]);

await fs.mkdir(downloadsDir, { recursive: true });
await fs.rm(workDir, { recursive: true, force: true });
await fs.mkdir(workDir, { recursive: true });
await fs.rm(sourceDir, { recursive: true, force: true });

for (const input of inputs) {
  const dmgPath = path.join(downloadsDir, input.fileName);
  await downloadIfMissingVerified(input.url, dmgPath, requireSha256Env(input.shaEnv), userAgent);
  await stageLibreOfficeApp(input, dmgPath);
}

await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });
await fs.writeFile(
  path.join(sourceDir, "licenses", "LICENSE.txt"),
  [
    "LibreOffice",
    "",
    "LibreOffice is primarily distributed under the Mozilla Public License 2.0.",
    "Official license information: https://www.libreoffice.org/about-us/licenses/",
    "MPL 2.0 text: https://www.mozilla.org/MPL/2.0/",
    "",
  ].join("\n"),
  "utf8",
);
await fs.writeFile(
  path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"),
  [
    "LibreOffice macOS package prepared for Multi-Converter.",
    ...inputs.map((input) => `${input.arch} source DMG: ${publicSourceLabel(input.url)}`),
    `Prepared version: ${version}`,
    "",
    "LibreOffice includes third-party components. Keep this notice with the package and refer to the official LibreOffice license page:",
    "https://www.libreoffice.org/about-us/licenses/",
    "",
  ].join("\n"),
  "utf8",
);

for (const input of inputs) {
  const soffice = path.join(sourceDir, input.arch, "LibreOffice.app", "Contents", "MacOS", "soffice");
  await assertFile(soffice, `${input.arch} LibreOffice soffice launcher is missing.`);
  await fs.chmod(soffice, 0o755);
  await smokeTestLibreOffice(soffice, input.arch);
}

console.log(`macOS LibreOffice ready from ${version}.`);

async function stageLibreOfficeApp(input, dmgPath) {
  const mountPoint = path.join(workDir, `mount-${input.arch}`);
  const target = path.join(sourceDir, input.arch, "LibreOffice.app");
  await fs.mkdir(mountPoint, { recursive: true });
  let mounted = false;
  try {
    run("hdiutil", ["attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", mountPoint]);
    mounted = true;
    const app = await findLibreOfficeApp(mountPoint);
    if (!app) {
      throw new Error(`${input.arch} LibreOffice DMG does not contain LibreOffice.app.`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(app, target, { recursive: true, force: true, preserveTimestamps: true });
  } finally {
    if (mounted) {
      run("hdiutil", ["detach", mountPoint, "-quiet"]);
    }
    await fs.rm(mountPoint, { recursive: true, force: true });
  }
}

async function findLibreOfficeApp(base) {
  const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(base, entry.name);
    if (entry.isDirectory() && entry.name === "LibreOffice.app") return fullPath;
    if (entry.isDirectory()) {
      const found = await findLibreOfficeApp(fullPath);
      if (found) return found;
    }
  }
  return null;
}

async function smokeTestLibreOffice(soffice, arch) {
  const profile = path.join(workDir, `lo-smoke-profile-${arch}`).replaceAll("\\", "/");
  const result = spawnSync(soffice, [
    "--headless",
    "--invisible",
    "--nologo",
    "--nodefault",
    "--nolockcheck",
    "--norestore",
    "--nofirststartwizard",
    "--terminate_after_init",
    `-env:UserInstallation=file://${profile}`,
  ], {
    cwd: path.dirname(soffice),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
  });
  if (result.status !== 0) {
    throw new Error(`${arch} LibreOffice headless smoke test failed: ${result.stderr || result.stdout}`);
  }
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}

function requireCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} is required: ${result.stderr || result.stdout}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
