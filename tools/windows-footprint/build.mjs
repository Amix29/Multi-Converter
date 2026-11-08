// Build an installer-only helper with the exact resource destinations of this package.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tools = path.dirname(fileURLToPath(import.meta.url));
const tauri = path.resolve(tools, "../../src-tauri");
const readConfig = name => JSON.parse(readFileSync(path.join(tauri, name), "utf8")).bundle;
const base = readConfig("tauri.conf.json");
const resources = { ...base.resources, ...readConfig("tauri.windows.conf.json").resources };
const names = new Set(["multi-converter.exe", "uninstall.exe"]);
for (const sidecar of base.externalBin) names.add(path.basename(sidecar) + ".exe");

function collect(source, target) {
  if (statSync(source).isDirectory()) {
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (!entry.isFile() && !entry.isDirectory()) throw Error(`Unexpected resource: ${entry.name}`);
      collect(path.join(source, entry.name), path.join(target, entry.name));
    }
  } else {
    const relative = target.replaceAll("\\", "/");
    if (path.isAbsolute(relative) || relative.split("/").some(p => !p || p === ".." || /[:\r\n]/.test(p))) {
      throw Error(`Invalid installation path: ${relative}`);
    }
    names.add(relative);
  }
}
for (const [source, target] of Object.entries(resources)) collect(path.resolve(tauri, source), target);
const temp = mkdtempSync(path.join(os.tmpdir(), "mc-footprint-"));
const manifest = path.join(temp, "files.txt");
try {
  writeFileSync(manifest, [...names].sort().join("\n"));
  execFileSync("rustc", ["--edition", "2021", "-C", "opt-level=s", "-C", "panic=abort",
    "-C", "strip=symbols", "-C", "debuginfo=0", path.join(tools, "compact.rs"), "-o", process.argv[2]], {
    env: { ...process.env, MC_INSTALL_MANIFEST: manifest }, stdio: "inherit",
  });
} finally {
  unlinkSync(manifest);
  rmdirSync(temp);
}
