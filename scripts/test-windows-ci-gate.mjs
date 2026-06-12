import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const statusFile = path.resolve(optionValue(process.argv.slice(2), "--status-file") ?? path.join(root, "tmp", "windows-ci-gate-status.json"));
const startedAt = new Date().toISOString();
const status = {
  command: "test:windows:ci",
  state: dryRun ? "dry-run" : "running",
  startedAt,
  updatedAt: startedAt,
  currentStep: null,
  steps: [],
};

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

writeStatus();
console.log(`Windows CI validation status: ${path.relative(root, statusFile)}`);

for (const [command, args] of commands) {
  const display = `${command} ${args.join(" ")}`;
  if (dryRun) {
    console.log(display);
    status.steps.push({
      command: display,
      durationMs: 0,
      endedAt: status.updatedAt,
      exitCode: null,
      index: status.steps.length + 1,
      startedAt: status.updatedAt,
      status: "skipped",
    });
    writeStatus();
    continue;
  }

  console.log(`\n> ${display}`);
  const step = beginStep(display);
  const invocation = commandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    finishStep(step, "failed", { error: result.error.message });
    fail(`${display} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    finishStep(step, "failed", { exitCode: result.status ?? 1 });
    process.exit(result.status ?? 1);
  }
  finishStep(step, "passed", { exitCode: 0 });
}

if (dryRun) {
  status.currentStep = null;
  writeStatus();
  console.log("Windows CI validation dry run passed.");
} else {
  status.state = "passed";
  status.currentStep = null;
  writeStatus();
  console.log("Windows CI validation passed.");
}

function commandInvocation(command, args) {
  if (command !== "npm") return { command, args };

  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return { command: process.execPath, args: [npmExecPath, ...args] };
  }

  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] };
  }

  return { command: "npm", args };
}

function beginStep(command) {
  const now = Date.now();
  const step = {
    command,
    durationMs: null,
    endedAt: null,
    exitCode: null,
    index: status.steps.length + 1,
    startedAt: new Date(now).toISOString(),
    status: "running",
  };
  status.currentStep = {
    command,
    index: step.index,
    total: commands.length,
  };
  status.steps.push(step);
  writeStatus();
  return { step, startedAtMs: now };
}

function finishStep(entry, state, details) {
  const endedAtMs = Date.now();
  entry.step.status = state;
  entry.step.endedAt = new Date(endedAtMs).toISOString();
  entry.step.durationMs = endedAtMs - entry.startedAtMs;
  entry.step.exitCode = details.exitCode ?? null;
  if (details.error) entry.step.error = details.error;
  status.state = state === "failed" ? "failed" : "running";
  status.currentStep = null;
  writeStatus();
}

function writeStatus() {
  status.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.writeFileSync(statusFile, `${JSON.stringify(status, null, 2)}\n`);
}

function optionValue(args, name) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name) return args[index + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
