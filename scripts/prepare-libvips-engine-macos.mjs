import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const sourceDir = path.join(root, "engine-sources", "macos-universal", "libvips");
const workDir = path.join(root, "engine-sources", ".extracts", "libvips-macos-smoke");
const archInputs = [
  {
    arch: "aarch64",
    lipoArch: "arm64",
    sourceEnv: "LIBVIPS_MACOS_AARCH64_SOURCE_DIR",
  },
  {
    arch: "x86_64",
    lipoArch: "x86_64",
    sourceEnv: "LIBVIPS_MACOS_X86_64_SOURCE_DIR",
  },
];
const forbiddenLinkPrefixes = [
  "/opt/homebrew/",
  "/usr/local/",
  "/opt/local/",
  "/sw/",
];

if (process.platform !== "darwin") {
  throw new Error("macOS libvips engine preparation must run on macOS so otool and native smoke tests can validate the portable trees.");
}

requireCommand("xcrun", ["-find", "otool"]);
requireCommand("xcrun", ["-find", "lipo"]);

const inputs = await Promise.all(archInputs.map(readSourceInput));
await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(sourceDir, { recursive: true });

for (const input of inputs) {
  const targetRoot = path.join(sourceDir, input.arch);
  await fs.cp(input.sourceDir, targetRoot, { recursive: true, force: true });
  const vips = path.join(targetRoot, "bin", "vips");
  await assertFile(vips, `${input.arch}: bin/vips is missing from the staged libvips tree.`);
  await fs.chmod(vips, 0o755);
  run("lipo", ["-verify_arch", input.lipoArch, vips]);
  await verifyPortableLinks(targetRoot, input.arch);
  await smokeTestNative(targetRoot, input.arch);
}

await stageLicenseAndNotices(inputs);
await assertFile(path.join(sourceDir, "licenses", "LICENSE.txt"), "libvips macOS LICENSE.txt is missing.");
await assertFile(path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"), "libvips macOS THIRD_PARTY_NOTICES.txt is missing.");

console.log("macOS libvips portable trees are staged.");

async function readSourceInput(input) {
  const raw = process.env[input.sourceEnv]?.trim();
  if (!raw) {
    throw new Error([
      `${input.arch}: ${input.sourceEnv} is required.`,
      "Point it to a portable libvips runtime tree that contains bin/vips and all non-system dependencies.",
      "A plain Homebrew cellar prefix is not enough unless install names were rewritten and dependencies were bundled.",
    ].join("\n"));
  }
  const source = path.resolve(raw);
  const stat = await fs.stat(source).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`${input.arch}: ${input.sourceEnv} does not point to a directory: ${source}`);
  }
  await assertFile(path.join(source, "bin", "vips"), `${input.arch}: source tree must contain bin/vips.`);
  return { ...input, sourceDir: source };
}

async function verifyPortableLinks(targetRoot, arch) {
  const candidates = await collectMachOCandidates(targetRoot);
  for (const filePath of candidates) {
    const result = spawnSync("otool", ["-L", filePath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) continue;
    for (const dependency of parseOtoolDependencies(result.stdout)) {
      if (isAllowedDependency(dependency)) continue;
      throw new Error([
        `${arch}: non-portable libvips dependency found in ${path.relative(targetRoot, filePath)}.`,
        `Dependency: ${dependency}`,
        "Bundle that dependency and rewrite the install name to @rpath, @loader_path or @executable_path before staging.",
      ].join("\n"));
    }
  }
}

async function collectMachOCandidates(dir) {
  const results = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isLikelyMachO(entry.name, fullPath)) {
        results.push(fullPath);
      }
    }
  }
  await walk(dir);
  return results;
}

function isLikelyMachO(name, fullPath) {
  if (name.endsWith(".dylib") || name.endsWith(".so") || name === "vips") return true;
  const relative = fullPath.replaceAll("\\", "/");
  return relative.includes("/bin/") && !name.includes(".");
}

function parseOtoolDependencies(output) {
  const lines = output.split(/\r?\n/).slice(1);
  const dependencies = [];
  for (const line of lines) {
    const match = line.trim().match(/^(\S+)/);
    if (match) dependencies.push(match[1]);
  }
  return dependencies;
}

function isAllowedDependency(value) {
  if (value.startsWith("@rpath/") || value.startsWith("@loader_path/") || value.startsWith("@executable_path/")) return true;
  if (value.startsWith("/usr/lib/") || value.startsWith("/System/Library/")) return true;
  if (value.startsWith("/")) return false;
  return !forbiddenLinkPrefixes.some((prefix) => value.startsWith(prefix));
}

async function smokeTestNative(targetRoot, arch) {
  const nativeArch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (arch !== nativeArch) return;

  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  const input = path.join(workDir, "input.png");
  const output = path.join(workDir, "output.jpg");
  await fs.writeFile(input, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAkJ3kKIAAAAASUVORK5CYII=", "base64"));

  const exe = path.join(targetRoot, "bin", "vips");
  const result = spawnSync(exe, ["copy", input, output], {
    cwd: path.dirname(exe),
    env: {
      ...process.env,
      DYLD_LIBRARY_PATH: dyldPath(targetRoot),
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
  if (result.status !== 0) {
    throw new Error(`libvips macOS health check failed for ${arch}: ${result.stderr || result.stdout}`);
  }
  const stat = await fs.stat(output).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) {
    throw new Error(`libvips macOS health check did not create output.jpg for ${arch}.`);
  }
}

function dyldPath(targetRoot) {
  const candidates = [
    path.join(targetRoot, "lib"),
    path.join(targetRoot, "lib64"),
    process.env.DYLD_LIBRARY_PATH,
  ].filter(Boolean);
  return candidates.join(":");
}

async function stageLicenseAndNotices(inputs) {
  await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });
  const license = process.env.LIBVIPS_MACOS_LICENSE_FILE?.trim()
    ? path.resolve(process.env.LIBVIPS_MACOS_LICENSE_FILE)
    : await findAny(inputs[0].sourceDir, ["LICENSE.txt", "LICENSE", "COPYING", "COPYING.LESSER"]);
  if (!license) {
    throw new Error("libvips license file is missing. Set LIBVIPS_MACOS_LICENSE_FILE or include a license file in the source tree.");
  }
  await fs.copyFile(license, path.join(sourceDir, "licenses", "LICENSE.txt"));

  const providedNotice = process.env.LIBVIPS_MACOS_NOTICES_FILE?.trim()
    ? path.resolve(process.env.LIBVIPS_MACOS_NOTICES_FILE)
    : null;
  const lines = [
    "libvips macOS package",
    ...inputs.map((input) => `${input.arch} source tree: ${input.sourceDir}`),
    "",
    "libvips is distributed under LGPL-2.1-or-later.",
    "This package must include every non-system dynamic dependency required by the staged vips binaries.",
    "The preparation script rejects Homebrew/MacPorts/Fink-style absolute links that would not exist on a user's Mac.",
    "",
  ];
  if (providedNotice) {
    lines.push(`Additional notice copied from: ${providedNotice}`, "");
  }
  const target = path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt");
  await fs.writeFile(target, lines.join("\n"), "utf8");
  if (providedNotice) {
    const content = await fs.readFile(providedNotice, "utf8");
    await fs.appendFile(target, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  }
}

async function findAny(dir, names) {
  const lower = new Set(names.map((name) => name.toLowerCase()));
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(fullPath);
        if (found) return found;
      } else if (entry.isFile() && lower.has(entry.name.toLowerCase())) {
        return fullPath;
      }
    }
    return null;
  }
  return walk(dir);
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
