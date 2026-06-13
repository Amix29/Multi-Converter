import fs from "node:fs/promises";
import { existsSync } from "node:fs";
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
const fileName = `LibreOffice_${version}_Win_x86-64.msi`;
const downloadUrl = process.env.LIBREOFFICE_MSI_URL
  ?? `https://download.documentfoundation.org/libreoffice/stable/${version}/win/x86_64/${fileName}`;
const downloadsDir = path.join(root, "engine-sources", ".downloads");
const sourceDir = path.join(root, "engine-sources", "windows-x64", "libreoffice");
const msiPath = path.join(downloadsDir, fileName);
const lessMsiVersion = "2.12.6";
const lessMsiZip = path.join(downloadsDir, `lessmsi-v${lessMsiVersion}.zip`);
const lessMsiDir = path.join(os.tmpdir(), "mc-lessmsi");
const lessMsiExe = path.join(lessMsiDir, "lessmsi.exe");
const workDir = path.join(os.tmpdir(), "mc-libreoffice-msi");

await fs.mkdir(downloadsDir, { recursive: true });
await downloadIfMissingVerified(
  downloadUrl,
  msiPath,
  requireSha256Env("LIBREOFFICE_WINDOWS_X64_MSI_SHA256"),
  { "User-Agent": "Multi-Converter-Packager" },
);
await ensureLessMsi();

await fs.rm(workDir, { recursive: true, force: true });
await fs.mkdir(workDir, { recursive: true });
const tempMsiPath = path.join(workDir, "libreoffice.msi");
const extractDir = path.join(workDir, "extract");
await fs.copyFile(msiPath, tempMsiPath);
await fs.mkdir(extractDir, { recursive: true });
const extract = spawnSync(lessMsiExe, ["x", tempMsiPath, `${extractDir}\\`], {
  cwd: workDir,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  windowsHide: true,
});
if (extract.status !== 0) {
  throw new Error(`Extraction MSI LibreOffice impossible (${extract.status}): ${extract.stderr || extract.stdout}`);
}

const extractedRoot = await findLibreOfficeRoot(extractDir);
if (!extractedRoot) {
  throw new Error("Extraction LibreOffice invalide : program/soffice.exe introuvable.");
}

await fs.rm(sourceDir, { recursive: true, force: true });
await copyTree(extractedRoot, sourceDir);
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
    "LibreOffice Windows x86-64 package prepared for Multi-Converter.",
    `Source MSI: ${publicSourceLabel(downloadUrl)}`,
    `Prepared version: ${version}`,
    "",
    "LibreOffice includes third-party components. Keep this notice with the package and refer to the official LibreOffice license page:",
    "https://www.libreoffice.org/about-us/licenses/",
    "",
  ].join("\n"),
  "utf8",
);

await assertFile(path.join(sourceDir, "program", "soffice.exe"), "program/soffice.exe absent.");
const smokeProfile = path.join(workDir, "lo-smoke-profile").replaceAll("\\", "/");
const smoke = spawnSync(path.join(sourceDir, "program", "soffice.exe"), [
  "--headless",
  "--invisible",
  "--nologo",
  "--nodefault",
  "--nolockcheck",
  "--norestore",
  "--nofirststartwizard",
  "--terminate_after_init",
  `-env:UserInstallation=file:///${encodeURI(smokeProfile)}`,
], {
  cwd: path.join(sourceDir, "program"),
  encoding: "utf8",
  windowsHide: true,
});
if (smoke.status !== 0) {
  throw new Error(`LibreOffice headless ne démarre pas : ${smoke.stderr || smoke.stdout}`);
}

console.log(`LibreOffice ready from ${fileName}`);

async function ensureLessMsi() {
  await downloadIfMissingVerified(
    `https://github.com/activescott/lessmsi/releases/download/v${lessMsiVersion}/lessmsi-v${lessMsiVersion}.zip`,
    lessMsiZip,
    requireSha256Env("LESSMSI_WINDOWS_X64_ARCHIVE_SHA256"),
    { "User-Agent": "Multi-Converter-Packager" },
  );
  await fs.rm(lessMsiDir, { recursive: true, force: true });
  await fs.mkdir(lessMsiDir, { recursive: true });
  const expand = spawnSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
    lessMsiZip,
    lessMsiDir,
  ], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (expand.status !== 0) {
    throw new Error(`Extraction lessmsi impossible : ${expand.stderr || expand.stdout}`);
  }
  await assertFile(lessMsiExe, "lessmsi.exe absent après extraction.");
}

async function findLibreOfficeRoot(base) {
  const queue = [base];
  while (queue.length > 0) {
    const current = queue.shift();
    if (existsSync(path.join(current, "program", "soffice.exe"))) {
      return current;
    }
    for (const entry of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory()) queue.push(path.join(current, entry.name));
    }
  }
  return null;
}

async function copyTree(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(source, target);
    else if (entry.isFile()) await fs.copyFile(source, target);
  }
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}
