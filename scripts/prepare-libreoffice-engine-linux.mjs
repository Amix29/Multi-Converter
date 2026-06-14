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
const extractsDir = path.join(root, "engine-sources", ".extracts");
const sourceDir = path.join(root, "engine-sources", "linux-x64", "libreoffice");
const workDir = path.join(os.tmpdir(), "mc-libreoffice-linux");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };
const archiveName = `LibreOffice_${version}_Linux_x86-64_deb.tar.gz`;
const archiveUrl = process.env.LIBREOFFICE_LINUX_X64_DEB_ARCHIVE_URL
  ?? `https://download.documentfoundation.org/libreoffice/stable/${version}/deb/x86_64/${archiveName}`;

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error(`Linux LibreOffice engine preparation must run on Linux x64, current host is ${process.platform}/${process.arch}.`);
}

requireCommand("tar", ["--version"]);
requireCommand("dpkg-deb", ["--version"]);

await fs.mkdir(downloadsDir, { recursive: true });
await fs.mkdir(extractsDir, { recursive: true });
await fs.rm(workDir, { recursive: true, force: true });
await fs.mkdir(workDir, { recursive: true });

const archivePath = path.join(downloadsDir, archiveName);
await downloadIfMissingVerified(
  archiveUrl,
  archivePath,
  requireSha256Env("LIBREOFFICE_LINUX_X64_DEB_ARCHIVE_SHA256"),
  userAgent,
);

const debExtract = path.join(extractsDir, "libreoffice-linux-debs");
await fs.rm(debExtract, { recursive: true, force: true });
await fs.mkdir(debExtract, { recursive: true });
run("tar", ["-xzf", archivePath, "-C", debExtract]);

const installRoot = path.join(workDir, "install-root");
await fs.rm(installRoot, { recursive: true, force: true });
await fs.mkdir(installRoot, { recursive: true });
for (const deb of await collectFiles(debExtract, /\.deb$/i)) {
  run("dpkg-deb", ["-x", deb, installRoot]);
}

const libreOfficeRoot = await findLibreOfficeRoot(path.join(installRoot, "opt"));
if (!libreOfficeRoot) {
  throw new Error("Official LibreOffice Linux archive did not contain opt/libreoffice*/program/soffice.");
}

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(path.dirname(sourceDir), { recursive: true });
await fs.cp(libreOfficeRoot, sourceDir, { recursive: true, force: true, preserveTimestamps: true });
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });

const soffice = path.join(sourceDir, "program", "soffice");
await assertFile(soffice, "program/soffice missing.");
await fs.chmod(soffice, 0o755);
await stageLicenseAndNotices();
await smokeTestLibreOffice(soffice);

console.log(`Linux LibreOffice ready from ${version}.`);

async function collectFiles(dir, pattern) {
  const results = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  await walk(dir);
  return results.sort();
}

async function findLibreOfficeRoot(optRoot) {
  for (const entry of await fs.readdir(optRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !/^libreoffice/i.test(entry.name)) continue;
    const candidate = path.join(optRoot, entry.name);
    const soffice = path.join(candidate, "program", "soffice");
    const stat = await fs.stat(soffice).catch(() => null);
    if (stat?.isFile()) return candidate;
  }
  return null;
}

async function stageLicenseAndNotices() {
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
      "LibreOffice Linux x64 package prepared for Multi-Converter.",
      `Source: ${publicSourceLabel(archiveUrl)}`,
      `Prepared version: ${version}`,
      "",
      "LibreOffice includes third-party components. Keep this notice with the package and refer to the official LibreOffice license page:",
      "https://www.libreoffice.org/about-us/licenses/",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function smokeTestLibreOffice(soffice) {
  const profile = path.join(workDir, "lo-smoke-profile").replaceAll("\\", "/");
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
    throw new Error(`LibreOffice Linux headless smoke test failed: ${result.stderr || result.stdout}`);
  }
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) throw new Error(message);
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
