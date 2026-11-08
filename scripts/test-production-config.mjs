import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const viteConfig = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const platformConfig = (platform) => JSON.parse(fs.readFileSync(path.join(root, "src-tauri", `tauri.${platform}.conf.json`), "utf8"));
const windowsConfig = platformConfig("windows");
const directRoot = "bundled-engine-profiles/windows-x64/v3";
const commonResources = {
  "../LICENSE": "licenses/LICENSE.txt",
  "../NOTICE": "licenses/NOTICE.txt",
};
assert.deepEqual(tauriConfig.bundle.resources, commonResources, "common configuration must include project notices without leaking Windows engines into Mac/Linux merges");
const windowsResources = { ...tauriConfig.bundle.resources, ...windowsConfig.bundle.resources };
assert.equal(windowsResources[`${directRoot}/libreoffice/`], "engines/libreoffice/compatible/");
assert.equal(windowsResources["bundled-engine-profiles/windows-x64/native-v1/ocr/"], "ocr/");
assert.equal(windowsResources[`${directRoot}/ocr/`], undefined, "Windows must not bundle both Python and native OCR runtimes");
assert.ok(!Object.values(windowsResources).some(value => value.includes("engine-archives")));
assert.equal(windowsConfig.bundle.windows.nsis.compression, "lzma");
assert.match(fs.readFileSync(path.join(root, "src-tauri/nsis-hooks.nsh"), "utf8"), /SetCompressorDictSize 128/);
assert.equal(windowsResources["bundled-engine-archives/windows-x64/libreoffice.zip"], undefined, "Windows must not ship both original and profiled archives");
assert.equal(windowsResources["bundled-engines/pdfium/"], "engines/pdfium/");
assert.equal(windowsResources["bundled-engines/"], undefined, "Windows must not also ship an uncompressed LibreOffice tree");
for (const platform of ["linux", "macos"]) {
  const resources = { ...tauriConfig.bundle.resources, ...platformConfig(platform).bundle.resources };
  assert.deepEqual(resources, { ...commonResources, "bundled-engines/": "engines/", "ocr-resources/": "ocr/" }, `${platform} merged resources must contain project notices, native engines and OCR`);
}
const frontendFiles = ["src/App.svelte", "src/lib/api.ts"]
  .map((relative) => fs.readFileSync(path.join(root, relative), "utf8"))
  .join("\n");

assert.match(viteConfig, /envPrefix:\s*\["VITE_"\]/, "Vite must expose only VITE_ variables to frontend code");
assert.doesNotMatch(viteConfig, /envPrefix:[\s\S]*"TAURI_"/, "Vite must not expose broad TAURI_ environment variables to the frontend");
assert.doesNotMatch(frontendFiles, /import\.meta\.env\.TAURI_/,
  "Frontend code must not depend on TAURI_* environment variables, which can include signing secrets");

const csp = tauriConfig.app?.security?.csp ?? "";
assert.ok(csp, "Tauri CSP must stay configured for production builds");
assert.match(csp, /default-src 'self'/, "CSP must default to self");
assert.match(csp, /script-src 'self'/, "CSP must restrict scripts to self");
assert.doesNotMatch(csp, /script-src[^;]*'unsafe-eval'/, "CSP must not allow unsafe-eval scripts");
assert.doesNotMatch(csp, /(?:^|[;\s])\*(?:[;\s]|$)/, "CSP must not contain wildcard sources");
assert.match(csp, /object-src 'none'/, "CSP must block plugins and object embeds");
assert.match(csp, /base-uri 'self'/, "CSP must restrict base-uri to self");
assert.match(csp, /form-action 'none'/, "CSP must block form submissions");
assert.match(csp, /frame-src 'none'/, "CSP must block embedded frames");
assert.match(csp, /frame-ancestors 'none'/, "CSP must block framing the application");

console.log("Production config tests passed.");
