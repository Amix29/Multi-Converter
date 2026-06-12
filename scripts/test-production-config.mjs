import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const viteConfig = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const frontendFiles = ["src/App.tsx", "src/lib/api.ts"]
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

console.log("Production config tests passed.");
