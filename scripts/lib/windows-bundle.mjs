import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// NSIS File still encounters MAX_PATH in long worktree paths. A short junction
// changes only the packaging address, not the resource bytes or installed paths.
export function bundleWindows(invoke, env) {
  const alias = path.join(os.tmpdir(), `mc-pack-${process.pid}`);
  const target = path.resolve("src-tauri/bundled-engine-profiles/windows-x64/current");
  const config = path.join(os.tmpdir(), `mc-tauri-bundle-${process.pid}.json`);
  fs.symlinkSync(target, alias, "junction");
  try {
    fs.writeFileSync(config, JSON.stringify({ bundle: {
      createUpdaterArtifacts: Boolean(env.TAURI_SIGNING_PRIVATE_KEY?.trim()),
      resources: {
        "bundled-engine-profiles/windows-x64/current/libreoffice/": null,
        "bundled-engine-profiles/windows-x64/current/ocr/": null,
        [path.join(alias, "libreoffice/")]: "engines/libreoffice/compatible/",
        [path.join(alias, "ocr/")]: "ocr/",
      },
    } }));
    return invoke(["bundle", "--bundles", "nsis", "--config", config]);
  } finally {
    if (fs.existsSync(config)) fs.unlinkSync(config);
    if (!fs.lstatSync(alias).isSymbolicLink() || path.resolve(fs.readlinkSync(alias)) !== target) throw Error("Unexpected packaging junction; refusing cleanup");
    fs.rmdirSync(alias); // Remove the junction itself; never recurse into target.
  }
}
