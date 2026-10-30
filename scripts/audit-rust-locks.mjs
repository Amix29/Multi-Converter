import { spawnSync } from "node:child_process";

const locks = [
  "src-tauri/Cargo.lock",
  "tools/pdfium-render-wrapper/Cargo.lock",
  "tools/updater-signature-verifier/Cargo.lock",
];
const failures = [];
for (const lock of locks) {
  console.log(`Auditing Rust dependency graph: ${lock}`);
  const result = spawnSync("cargo", ["audit", "--file", lock], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) failures.push(lock);
}
if (failures.length) {
  console.error(`Rust audit failed for: ${failures.join(", ")}`);
  process.exitCode = 1;
}
