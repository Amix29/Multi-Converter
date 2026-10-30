import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const locks = [
  "requirements-windows-x64.lock.txt",
  "requirements-macos-aarch64.lock.txt",
  "requirements-linux-x64.lock.txt",
];

const failures = [];
for (const lock of locks) {
  const result = spawnSync("uvx", [
    "--from", "pip-audit==2.10.1", "pip-audit",
    "-r", path.join("tools", "ocr-runtime", lock),
    "--require-hashes", "--no-deps", "--disable-pip",
  ], { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) failures.push(lock);
}
if (failures.length) {
  console.error(`OCR Python audits failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`OCR Python audits passed for ${locks.length} locked platform environments.`);
