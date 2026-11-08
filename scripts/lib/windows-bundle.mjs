import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// NSIS File still encounters MAX_PATH in long worktree paths. A short junction
// changes only the packaging address, not the resource bytes or installed paths.
export function bundleWindows(invoke, env) {
  const source = path.resolve("src-tauri");
  // Tauri normalizes resource keys by stripping drive letters. Use relative
  // keys and keep the short junctions on the checkout's drive.
  const volume = path.parse(source).root.toLowerCase();
  const temporary = [env.RUNNER_TEMP, os.tmpdir()].find(
    dir => dir && path.parse(dir).root.toLowerCase() === volume,
  ) ?? source;
  const alias = path.join(temporary, `mc-pack-${process.pid}`);
  const target = path.resolve("src-tauri/bundled-engine-profiles/windows-x64/v3");
  const nativeTarget = path.resolve("src-tauri/bundled-engine-profiles/windows-x64/native-v1");
  const nativeAlias = path.join(temporary, `mc-pack-native-${process.pid}`);
  const config = path.join(os.tmpdir(), `mc-tauri-bundle-${process.pid}.json`);
  fs.symlinkSync(target, alias, "junction");
  fs.symlinkSync(nativeTarget, nativeAlias, "junction");
  try {
    fs.writeFileSync(config, JSON.stringify({ bundle: {
      createUpdaterArtifacts: Boolean(env.TAURI_SIGNING_PRIVATE_KEY?.trim()),
      resources: {
        "bundled-engine-profiles/windows-x64/v3/libreoffice/": null,
        "bundled-engine-profiles/windows-x64/native-v1/ocr/": null,
        [path.relative(source, path.join(alias, "libreoffice"))]: "engines/libreoffice/compatible/",
        [path.relative(source, path.join(nativeAlias, "ocr"))]: "ocr/native-v1/",
      },
    } }));
    return invoke(["bundle", "--bundles", "nsis", "--config", config]);
  } finally {
    if (fs.existsSync(config)) fs.unlinkSync(config);
    if (!fs.lstatSync(alias).isSymbolicLink() || path.resolve(fs.readlinkSync(alias)) !== target) throw Error("Unexpected packaging junction; refusing cleanup");
    fs.rmdirSync(alias); // Remove the junction itself; never recurse into target.
    if (!fs.lstatSync(nativeAlias).isSymbolicLink() || path.resolve(fs.readlinkSync(nativeAlias)) !== nativeTarget) throw Error("Unexpected native OCR junction; refusing cleanup");
    fs.rmdirSync(nativeAlias);
  }
}
