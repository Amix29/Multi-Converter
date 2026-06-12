import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

const commands = [
  ["npm", ["audit", "--omit=dev"]],
  ["npm", ["run", "prepare:bundled-engines"]],
  ["npm", ["run", "check"]],
  ["npm", ["run", "fmt:rust:check"]],
  ["npm", ["run", "clippy:rust"]],
  ["npm", ["run", "audit:rust"]],
  ["npm", ["run", "validate:engines"]],
  ["npm", ["run", "test:rust"]],
  ["npm", ["run", "test:conversions"]],
  ["npm", ["run", "test:pdfium-wrapper"]],
  ["npm", ["run", "clippy:pdfium-wrapper"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "tauri:build"]],
];

if (process.platform !== "win32") {
  fail("Windows CI validation must run on Windows. Use the macOS jobs for Darwin checks.");
}

for (const [command, args] of commands) {
  const display = `${command} ${args.join(" ")}`;
  if (dryRun) {
    console.log(display);
    continue;
  }

  console.log(`\n> ${display}`);
  const result = spawnSync(commandName(command), args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (dryRun) {
  console.log("Windows CI validation dry run passed.");
} else {
  console.log("Windows CI validation passed.");
}

function commandName(command) {
  return process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
