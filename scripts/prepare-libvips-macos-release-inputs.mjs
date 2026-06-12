import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const tag = args.tag ?? fail("Missing --tag <release-tag>.");
const repo = args.repo ?? process.env.GITHUB_REPOSITORY ?? fail("Missing --repo <owner/name> or GITHUB_REPOSITORY.");
const outDir = path.resolve(args.outDir ?? path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "mc-libvips-macos-inputs"));
const assets = [
  {
    arch: "aarch64",
    envName: "LIBVIPS_MACOS_AARCH64_SOURCE_DIR",
    pattern: args.aarch64Asset ?? "libvips-macos-aarch64.tar.gz",
  },
  {
    arch: "x86_64",
    envName: "LIBVIPS_MACOS_X86_64_SOURCE_DIR",
    pattern: args.x86_64Asset ?? "libvips-macos-x86_64.tar.gz",
  },
];

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const envLines = [];
for (const asset of assets) {
  const assetDir = path.join(outDir, asset.arch, "asset");
  const extractDir = path.join(outDir, asset.arch, "extract");
  await fs.mkdir(assetDir, { recursive: true });
  await fs.mkdir(extractDir, { recursive: true });
  downloadReleaseAsset(asset.pattern, assetDir);
  const archive = await singleFile(assetDir, `${asset.arch} libvips archive`);
  await extractArchive(archive, extractDir);
  const runtimeRoot = await findRuntimeRoot(extractDir);
  if (!runtimeRoot) {
    fail(`${asset.arch}: extracted libvips archive does not contain bin/vips.`);
  }
  envLines.push(`${asset.envName}=${runtimeRoot}`);
}

if (process.env.GITHUB_ENV) {
  await fs.appendFile(process.env.GITHUB_ENV, `${envLines.join("\n")}\n`, "utf8");
} else {
  console.log(envLines.join("\n"));
}

function downloadReleaseAsset(pattern, dir) {
  const result = spawnSync("gh", ["release", "download", tag, "--repo", repo, "--pattern", pattern, "--dir", dir], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function singleFile(dir, label) {
  const entries = (await fs.readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile());
  if (entries.length !== 1) {
    fail(`Expected exactly one ${label}, found ${entries.length}.`);
  }
  return path.join(dir, entries[0].name);
}

async function extractArchive(archive, destination) {
  const lower = archive.toLowerCase();
  if (lower.endsWith(".zip")) {
    run("unzip", ["-q", archive, "-d", destination]);
    return;
  }
  run("tar", ["-xf", archive, "-C", destination]);
}

async function findRuntimeRoot(dir) {
  const candidate = path.join(dir, "bin", "vips");
  const stat = await fs.stat(candidate).catch(() => null);
  if (stat?.isFile()) return dir;

  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = await findRuntimeRoot(path.join(dir, entry.name));
    if (found) return found;
  }
  return null;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--tag") parsed.tag = rawArgs[++index];
    else if (arg === "--repo") parsed.repo = rawArgs[++index];
    else if (arg === "--out-dir") parsed.outDir = rawArgs[++index];
    else if (arg === "--aarch64-asset") parsed.aarch64Asset = rawArgs[++index];
    else if (arg === "--x86_64-asset") parsed.x86_64Asset = rawArgs[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
