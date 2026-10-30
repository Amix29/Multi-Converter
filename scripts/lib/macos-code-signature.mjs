import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync("codesign", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) {
    throw new Error(`macOS code signature failed: ${result.error?.message ?? result.stderr}`);
  }
}

// install_name_tool invalidates a Mach-O signature. Re-sign the completed
// portable files before native smoke tests and archive hashing.
export function adHocSignMachO(files, execute = run) {
  for (const file of [...new Set(files)].sort()) {
    execute(["--force", "--sign", "-", "--timestamp=none", file]);
  }
  verifyMachOSignatures(files, execute);
}

export function verifyMachOSignatures(files, execute = run) {
  for (const file of [...new Set(files)].sort()) execute(["--verify", "--strict", file]);
}
