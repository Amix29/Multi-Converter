import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outputRoot = path.resolve(args.outputDir ?? path.join(root, "engine-sources", "linux-x64"));
const workRoot = path.resolve(args.workDir ?? path.join(os.tmpdir(), "mc-linux-engine-sources"));
const userAgent = { "User-Agent": "Multi-Converter-Packager" };
const engines = [
  {
    id: "pdfium",
    archiveArg: "pdfium-archive",
    shaArg: "pdfium-sha256",
    requiredFiles: ["bin/libpdfium.so", "bin/pdfium-render-x86_64-unknown-linux-gnu"],
    smoke: ["bin/pdfium-render-x86_64-unknown-linux-gnu", ["--check"]],
  },
  {
    id: "libreoffice",
    archiveArg: "libreoffice-archive",
    shaArg: "libreoffice-sha256",
    requiredFiles: ["program/soffice"],
    smoke: ["program/soffice", ["--headless", "--invisible", "--nologo", "--nodefault", "--nolockcheck", "--norestore", "--nofirststartwizard", "--terminate_after_init"]],
  },
  {
    id: "pandoc",
    archiveArg: "pandoc-archive",
    shaArg: "pandoc-sha256",
    requiredFiles: ["bin/pandoc"],
    smoke: ["bin/pandoc", ["--version"]],
  },
  {
    id: "libvips",
    archiveArg: "libvips-archive",
    shaArg: "libvips-sha256",
    requiredFiles: ["bin/vips"],
    smoke: ["bin/vips", ["--version"]],
  },
];

if (process.platform !== "linux" || process.arch !== "x64") {
  fail(`Linux engine source preparation must run on Linux x64, current host is ${process.platform}/${process.arch}.`);
}

await fs.rm(workRoot, { recursive: true, force: true });
await fs.mkdir(workRoot, { recursive: true });
await fs.mkdir(outputRoot, { recursive: true });

for (const engine of engines) {
  await prepareEngine(engine);
}

console.log(`Linux engine source trees prepared in ${path.relative(root, outputRoot) || outputRoot}.`);

async function prepareEngine(engine) {
  const archiveInput = args[engine.archiveArg] ?? process.env[`MC_${engine.id.toUpperCase()}_LINUX_X64_ARCHIVE`];
  const expectedSha = args[engine.shaArg] ?? process.env[`MC_${engine.id.toUpperCase()}_LINUX_X64_ARCHIVE_SHA256`];
  if (!archiveInput) fail(`${engine.id}: missing --${engine.archiveArg} or MC_${engine.id.toUpperCase()}_LINUX_X64_ARCHIVE.`);
  if (!expectedSha) fail(`${engine.id}: missing --${engine.shaArg} or MC_${engine.id.toUpperCase()}_LINUX_X64_ARCHIVE_SHA256.`);
  if (!/^[a-f0-9]{64}$/i.test(expectedSha) || /^0{64}$/i.test(expectedSha)) {
    fail(`${engine.id}: SHA-256 is missing or placeholder.`);
  }

  const archivePath = path.join(workRoot, `${engine.id}${archiveExtension(archiveInput)}`);
  await materializeArchive(archiveInput, archivePath);
  await verifySha256(archivePath, expectedSha, `${engine.id} Linux source archive`);

  const extractDir = path.join(workRoot, `${engine.id}-extract`);
  await extractArchive(archivePath, extractDir);
  const sourceRoot = await findSourceRoot(extractDir, engine.requiredFiles);
  if (!sourceRoot) {
    fail(`${engine.id}: archive does not contain required Linux source tree files: ${engine.requiredFiles.join(", ")}.`);
  }
  await validateSourceTree(sourceRoot, engine);

  const targetRoot = path.join(outputRoot, engine.id);
  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(targetRoot), { recursive: true });
  await fs.cp(sourceRoot, targetRoot, { recursive: true, force: true });
  await ensureExecutableBits(targetRoot, engine);
}

async function materializeArchive(input, target) {
  if (/^https:\/\//i.test(input)) {
    const response = await fetch(input, { headers: userAgent });
    if (!response.ok || !response.body) fail(`Download failed (${response.status}): ${input}`);
    await pipeline(response.body, createWriteStream(target));
    return;
  }
  if (/^http:\/\//i.test(input)) {
    fail(`Refusing non-HTTPS Linux engine archive URL: ${input}`);
  }
  const source = path.resolve(input);
  await assertFile(source, `local archive ${input}`);
  await fs.copyFile(source, target);
}

function archiveExtension(input) {
  const name = path.basename(urlOrPath(input));
  if (/\.tar\.xz$/i.test(name)) return ".tar.xz";
  if (/\.tar\.gz$/i.test(name) || /\.tgz$/i.test(name)) return ".tar.gz";
  if (/\.zip$/i.test(name)) return ".zip";
  return ".archive";
}

function urlOrPath(input) {
  try {
    return new URL(input).pathname;
  } catch {
    return input;
  }
}

async function extractArchive(archivePath, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const name = path.basename(archivePath).toLowerCase();
  const command = name.endsWith(".zip")
    ? ["unzip", ["-q", archivePath, "-d", destination]]
    : ["tar", ["-xf", archivePath, "-C", destination]];
  const result = spawnSync(command[0], command[1], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`Archive extraction failed for ${archivePath}: ${result.stderr || result.stdout}`);
  }
}

async function findSourceRoot(startDir, requiredFiles) {
  const queue = [startDir];
  while (queue.length > 0) {
    const current = queue.shift();
    if (await hasRequiredFiles(current, requiredFiles)) return current;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) queue.push(path.join(current, entry.name));
    }
  }
  return null;
}

async function hasRequiredFiles(dir, requiredFiles) {
  for (const relative of requiredFiles) {
    const stat = await fs.stat(path.join(dir, normalizeArchivePath(relative))).catch(() => null);
    if (!stat?.isFile() || stat.size <= 0) return false;
  }
  return true;
}

async function validateSourceTree(sourceRoot, engine) {
  for (const relative of [...engine.requiredFiles, "licenses/LICENSE.txt", "licenses/THIRD_PARTY_NOTICES.txt"]) {
    await assertFile(path.join(sourceRoot, normalizeArchivePath(relative)), `${engine.id}: missing ${relative}`);
  }
  await assertNoNonLinuxBinaries(sourceRoot, engine.id);
  await ensureExecutableBits(sourceRoot, engine);
  await smokeTest(sourceRoot, engine);
}

async function ensureExecutableBits(sourceRoot, engine) {
  for (const relative of engine.requiredFiles) {
    const filePath = path.join(sourceRoot, normalizeArchivePath(relative));
    await fs.chmod(filePath, 0o755);
  }
}

async function smokeTest(sourceRoot, engine) {
  if (args["skip-smoke"] === "1") return;
  const [relative, smokeArgs] = engine.smoke;
  const filePath = path.join(sourceRoot, normalizeArchivePath(relative));
  const result = spawnSync(filePath, smokeArgs, {
    cwd: path.dirname(filePath),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
  });
  if (result.status !== 0) {
    fail(`${engine.id}: smoke test failed (${result.stderr || result.stdout || "no output"}).`);
  }
}

async function assertNoNonLinuxBinaries(sourceRoot, engineId) {
  const bad = [];
  await walkFiles(sourceRoot, async (filePath) => {
    const relative = path.relative(sourceRoot, filePath).replaceAll(path.sep, "/");
    if (/\.(app|bat|cmd|dll|dmg|dylib|exe|msi|pkg|ps1)(?:\/|$)/i.test(relative)) {
      bad.push(relative);
    }
  });
  if (bad.length) fail(`${engineId}: non-Linux file found in source tree: ${bad[0]}`);
}

async function walkFiles(dir, visit) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(full, visit);
    else if (entry.isFile()) await visit(full);
  }
}

async function verifySha256(filePath, expected, label) {
  const actual = await sha256File(filePath);
  if (actual !== expected.toLowerCase()) {
    fail(`${label}: SHA-256 mismatch. Expected ${expected}, got ${actual}.`);
  }
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) fail(`Missing or empty ${label}: ${filePath}`);
}

function normalizeArchivePath(relative) {
  const normalized = String(relative).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("//")) fail(`Invalid archive path: ${relative}`);
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) fail(`Ambiguous archive path: ${relative}`);
  return normalized;
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) fail(`Unexpected argument: ${arg}`);
    const key = arg.slice(2).replaceAll("-", "");
    const normalizedKey = arg.slice(2);
    if (normalizedKey === "skip-smoke") {
      parsed[normalizedKey] = "1";
      continue;
    }
    const value = rawArgs[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${arg}.`);
    parsed[normalizedKey] = value;
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
