import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import os from "node:os";
import process from "node:process";

const require = createRequire(import.meta.url);
const failures = [];
const requiredPkgConfigPackages = [
  "dbus-1",
  "gtk+-3.0",
  "webkit2gtk-4.1",
  "ayatana-appindicator3-0.1",
  "librsvg-2.0",
  "xdo",
  "openssl",
];
const runningInWsl = Boolean(process.env.WSL_DISTRO_NAME || /microsoft/i.test(os.release()));

if (process.platform !== "linux" || process.arch !== "x64") {
  fail(`Linux environment validation must run on Linux x64, current host is ${process.platform}/${process.arch}.`);
}

if (runningInWsl && /^\/mnt\/[a-z]\//i.test(process.cwd().replaceAll("\\", "/"))) {
  failures.push(
    [
      `The current checkout is on a Windows-mounted filesystem inside WSL (${process.cwd()}).`,
      "Use a dedicated checkout under the WSL Linux filesystem, such as ~/Multi-Converter, before Linux tests/builds.",
      "This avoids hybrid node_modules, executable-bit and AppImage packaging false positives.",
    ].join("\n"),
  );
}

requireCommand("node", ["--version"], "Node.js must be available from the Linux PATH.");
requireCommand("npm", ["--version"], "npm must be available from the Linux PATH.");
requireCommand("rustc", ["--version"], "rustc must be available from the Linux PATH.");
requireCommand("cargo", ["--version"], "cargo must be available from the Linux PATH.");
requireCommand("cargo", ["fmt", "--version"], "rustfmt must be installed for the active Rust toolchain.");
requireCommand("cargo", ["clippy", "--version"], "clippy must be installed for the active Rust toolchain.");
requireCommand("pkg-config", ["--version"], "pkg-config is required for Linux native dependencies.");
requireCommand("cc", ["--version"], "A C compiler is required for Linux native dependencies.");

for (const packageName of requiredPkgConfigPackages) {
  requirePkgConfig(packageName);
}

try {
  require("@tauri-apps/cli");
} catch (error) {
  failures.push(
    [
      "The Tauri CLI native Linux binding is not available in node_modules.",
      "Run npm ci on Linux before Linux tests/builds. In WSL, prefer a separate Linux checkout or reinstall Windows dependencies after Linux npm operations.",
      error.message,
    ].join("\n"),
  );
}

if (failures.length > 0) {
  console.error("Linux environment validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Linux environment validation passed.");

function requireCommand(command, args, message) {
  const commandPath = resolveCommandPath(command);
  if (runningInWsl && commandPath && /^\/mnt\/[a-z]\//i.test(commandPath.replaceAll("\\", "/"))) {
    failures.push(
      `${command} resolves to a Windows-mounted executable inside WSL (${commandPath}). Use Linux-installed tooling in WSL before Linux tests/builds.`,
    );
    return;
  }

  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    failures.push(`${message}\n${result.stderr || result.stdout || `${command} ${args.join(" ")} failed.`}`);
  }
}

function resolveCommandPath(command) {
  const result = spawnSync("bash", ["-lc", `command -v ${shellQuote(command)}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim().split(/\r?\n/)[0] ?? null;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function requirePkgConfig(packageName) {
  const result = spawnSync("pkg-config", ["--exists", packageName], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    failures.push(`Missing Linux development package for pkg-config module ${packageName}.`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
