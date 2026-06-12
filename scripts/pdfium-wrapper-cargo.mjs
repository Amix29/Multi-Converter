import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const sourceDir = path.join(root, "tools", "pdfium-render-wrapper");
const tempRoot = process.env.TEMP ?? process.env.TMPDIR ?? os.tmpdir();
const workDir = await fs.mkdtemp(path.join(tempRoot, "multi-converter-pdfium-wrapper-cargo-"));
const targetDir = await fs.mkdtemp(path.join(tempRoot, "mc-cargo-target-pdfium-wrapper-"));
const manifest = path.join(workDir, "Cargo.toml");
const args = process.argv.slice(2);

if (args.length === 0) {
  throw new Error("Missing cargo command for PDFium wrapper.");
}

let exitCode = 1;
try {
  await fs.cp(sourceDir, workDir, { recursive: true, force: true });

  const lock = spawnSync("cargo", ["generate-lockfile", "--manifest-path", manifest], {
    cwd: root,
    stdio: "inherit",
  });
  if (lock.status !== 0) {
    exitCode = lock.status ?? 1;
  } else {
    const cargoEnv = {
      ...process.env,
      CARGO_TARGET_DIR: targetDir,
    };
    if (isRuntimeTestCommand(args)) {
      const pdfiumLibrary = cargoEnv.MULTI_CONVERTER_TEST_PDFIUM_LIBRARY
        || cargoEnv.MULTI_CONVERTER_TEST_PDFIUM_DLL
        || bundledPdfiumLibrary();
      if (!pdfiumLibrary) {
        throw new Error(
          "PDFium wrapper runtime tests require a native PDFium library. Set MULTI_CONVERTER_TEST_PDFIUM_LIBRARY or use npm run test:pdfium-wrapper:compile for compile-only validation.",
        );
      }
      cargoEnv.MULTI_CONVERTER_TEST_PDFIUM_LIBRARY = pdfiumLibrary;
      cargoEnv.MULTI_CONVERTER_TEST_PDFIUM_DLL = pdfiumLibrary;
    }

    const separator = args.indexOf("--");
    const cargoArgs =
      separator === -1
        ? [...args, "--manifest-path", manifest, "--locked"]
        : [...args.slice(0, separator), "--manifest-path", manifest, "--locked", ...args.slice(separator)];

    const result = spawnSync("cargo", cargoArgs, {
      cwd: root,
      env: cargoEnv,
      stdio: "inherit",
    });
    exitCode = result.status ?? 1;
  }
} finally {
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.rm(targetDir, { recursive: true, force: true });
}

process.exit(exitCode);

function isRuntimeTestCommand(cargoArgs) {
  return cargoArgs[0] === "test" && !cargoArgs.includes("--no-run");
}

function bundledPdfiumLibrary() {
  const relativeCandidates = process.platform === "win32"
    ? ["bin/pdfium.dll"]
    : process.platform === "darwin"
      ? ["bin/libpdfium.dylib", "lib/libpdfium.dylib", "libpdfium.dylib"]
      : process.platform === "linux"
        ? ["bin/libpdfium.so", "lib/libpdfium.so", "libpdfium.so"]
        : [];
  const engineRoot = path.join(root, "src-tauri", "bundled-engines", "pdfium", "compatible");
  for (const relative of relativeCandidates) {
    const candidate = path.join(engineRoot, ...relative.split("/"));
    try {
      const stat = requireStat(candidate);
      if (stat.isFile() && stat.size > 0) return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function requireStat(filePath) {
  return fsSync.statSync(filePath);
}
