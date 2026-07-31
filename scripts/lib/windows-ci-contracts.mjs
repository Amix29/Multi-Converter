import assert from "node:assert/strict";

export function assertWindowsCiContracts({ packageJson, buildWorkflow, windowsBuildJob, windowsCiGateScript }) {
  assert.equal(
    packageJson.scripts["audit:rust"],
    "cargo audit --file src-tauri/Cargo.lock",
    "Rust audit must not hide dependency advisories",
  );
  assert.equal(
    packageJson.scripts["test:ui:preview"],
    "npm run build:frontend:preview && playwright test",
    "preview UI tests must build the explicit browser-preview frontend before using the installed Playwright runner",
  );
  assert.equal(
    packageJson.scripts["build:frontend:preview"],
    "npm run validate:i18n && npm run typecheck && vite build --mode preview",
    "browser-preview builds must opt into preview fixtures without changing the production frontend build",
  );
  assert.equal(
    packageJson.scripts["build:frontend"],
    "npm run validate:i18n && npm run typecheck && vite build",
    "the production frontend build must not opt into browser-preview fixtures",
  );
  assert.doesNotMatch(packageJson.scripts.build, /vite build\s+--mode preview/, "the packaged Tauri build must never include browser-preview fixtures");
  assert.match(packageJson.scripts.check, /(?:^|&&\s*)npm run typecheck:tests(?:\s*&&|$)/, "the canonical check command must typecheck test and runner configuration files");
  assert.match(packageJson.scripts.check, /(?:^|&&\s*)npm run test:unit(?:\s*&&|$)/, "the canonical check command must include Vitest unit tests");
  assert.equal(packageJson.scripts["test:windows:ci"], "node scripts/test-windows-ci-gate.mjs", "Windows CI validation wrapper must be exposed through npm");

  assert.match(buildWorkflow, /quality-gate:\s*\n\s+name:\s+Windows x64 quality gate/, "build workflow must keep the Windows job clearly named");
  assert.match(windowsBuildJob, /timeout-minutes:\s+120/, "Windows quality gate must allow enough time for conversion tests and the full Tauri build");
  assert.match(windowsBuildJob, /id:\s+cargo-audit-cache/, "Windows CI must cache the cargo-audit binary");
  assert.match(windowsBuildJob, /~\/\.cargo\/bin\/cargo-audit\.exe/, "Windows CI cargo-audit cache must target the installed binary");
  assert.match(windowsBuildJob, /cargo install cargo-audit --locked\s*\n\s+if:\s+steps\.cargo-audit-cache\.outputs\.cache-hit != 'true'/, "Windows CI must skip cargo-audit installation on cache hits");
  assert.match(
    windowsBuildJob,
    /npm ci\s*\n\s+- run:\s+npx playwright install chromium[\s\S]*?\n\s+- run:\s+npm run test:windows:ci/,
    "Windows CI must install Playwright Chromium after the reproducible npm install and before the canonical gate",
  );
  assert.match(windowsBuildJob, /npm run test:windows:ci/, "Windows CI must use the explicit Windows validation wrapper");

  assert.match(windowsCiGateScript, /process\.platform !== "win32"/, "Windows CI validation wrapper must refuse non-Windows hosts");
  assert.match(windowsCiGateScript, /process\.env\.npm_execpath/, "Windows CI validation wrapper must reuse npm's CLI path instead of spawning npm.cmd directly");
  assert.match(windowsCiGateScript, /process\.execPath/, "Windows CI validation wrapper must invoke npm through the current Node executable");
  assert.match(windowsCiGateScript, /result\.error/, "Windows CI validation wrapper must report command spawn failures");
  assert.match(windowsCiGateScript, /windows-ci-gate-status\.json/, "Windows CI validation wrapper must write a recoverable status file for long local runs");
  assert.match(windowsCiGateScript, /function beginStep\(command\)/, "Windows CI validation wrapper must checkpoint each started step");
  assert.match(windowsCiGateScript, /function finishStep\(entry, state, details\)/, "Windows CI validation wrapper must checkpoint each completed step");
  assert.match(windowsCiGateScript, /--status-file/, "Windows CI validation wrapper must allow an explicit status file path");
  assert.match(windowsCiGateScript, /status:\s+"skipped"/, "Windows CI validation wrapper dry runs must record skipped steps in the status file");
  assert.match(
    windowsCiGateScript,
    /\["npm", \["audit", "--omit=dev"\]\],\s*\["npm", \["audit"\]\],/,
    "Windows CI validation wrapper must run production and complete npm audits in that order",
  );
  assert.match(windowsCiGateScript, /\["npm", \["run", "prepare:bundled-engines"\]\]/, "Windows CI validation wrapper must prepare Windows bundled engines before validation");
  assert.match(
    windowsCiGateScript,
    /\["npm", \["run", "check"\]\],\s*\["npm", \["run", "test:ui:preview"\]\],/,
    "Windows CI validation wrapper must run rendered preview UI tests immediately after static and contract checks",
  );
  assert.match(windowsCiGateScript, /\["npm", \["run", "fmt:rust:check"\]\]/, "Windows CI validation wrapper must run Rust formatting checks");
  assert.match(windowsCiGateScript, /\["npm", \["run", "clippy:rust"\]\]/, "Windows CI validation wrapper must run Rust Clippy");
  assert.match(windowsCiGateScript, /\["npm", \["run", "audit:rust"\]\]/, "Windows CI validation wrapper must run Rust audit");
  assert.match(windowsCiGateScript, /\["npm", \["run", "test:rust"\]\]/, "Windows CI validation wrapper must run Rust unit tests");
  assert.match(windowsCiGateScript, /\["npm", \["run", "test:conversions"\]\]/, "Windows CI validation wrapper must run the full Windows conversion matrix");
  assert.match(windowsCiGateScript, /\["npm", \["run", "test:pdfium-wrapper"\]\]/, "Windows CI validation wrapper must run PDFium runtime tests with the bundled Windows DLL");
  assert.match(windowsCiGateScript, /\["npm", \["run", "clippy:pdfium-wrapper"\]\]/, "Windows CI validation wrapper must lint the PDFium wrapper");
  assert.match(windowsCiGateScript, /\["npm", \["run", "build"\]\]/, "Windows CI validation wrapper must run the frontend production build");
  assert.match(windowsCiGateScript, /\["npm", \["run", "tauri:build"\]\]/, "Windows CI validation wrapper must build the Windows Tauri installer");
}
