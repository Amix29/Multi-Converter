import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const check = process.argv.includes("--check");
const sourcePath = path.join(root, "tools", "ocr-runtime", "requirements-windows-x64.lock.txt");
const targetPath = path.join(root, "tools", "ocr-runtime", "requirements-macos-x86_64.lock.txt");
const source = await fs.readFile(sourcePath, "utf8");
const generated = withoutPaddlePaddle(source);

if (check) {
  const current = await fs.readFile(targetPath, "utf8");
  if (current !== generated) throw new Error("The macOS Intel OCR dependency lock is stale.");
  console.log("macOS Intel OCR dependency lock is reproducible.");
} else {
  await fs.writeFile(targetPath, generated);
  console.log("macOS Intel OCR dependency lock written.");
}

function withoutPaddlePaddle(value) {
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  const output = [
    "# Locked with uv 0.11.21 for CPython 3.12.10 on macOS Intel.",
    "# PaddlePaddle 3.3.1 is installed separately from the source-built wheel in the provenance lock.",
    "# Regenerate through scripts/prepare-ocr-platform-locks.mjs; do not edit by hand.",
  ];
  let skipping = false;
  for (const line of lines.slice(2)) {
    if (/^paddlepaddle==3\.3\.1\s*\\?$/u.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s+--hash=sha256:/u.test(line)) continue;
    if (skipping) skipping = false;
    output.push(line);
  }
  return output.join("\n");
}
