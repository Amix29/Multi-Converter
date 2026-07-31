import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const appModel = fs.readFileSync(path.join(root, "src", "app", "conversion", "model.ts"), "utf8");
const appTopbar = fs.readFileSync(path.join(root, "src", "app", "layout", "AppTopbar.tsx"), "utf8");
const feedbackOverlays = fs.readFileSync(path.join(root, "src", "app", "feedback", "FeedbackOverlays.tsx"), "utf8");
const fileWorkflow = fs.readFileSync(path.join(root, "src", "app", "conversion", "useFileWorkflow.ts"), "utf8");
const api = [
  fs.readFileSync(path.join(root, "src", "lib", "api.ts"), "utf8"),
  fs.readFileSync(path.join(root, "src", "lib", "api", "contracts.ts"), "utf8"),
  fs.readFileSync(path.join(root, "src", "lib", "api", "previewAdapter.ts"), "utf8"),
  fs.readFileSync(path.join(root, "src", "lib", "api", "tauriAdapter.ts"), "utf8"),
].join("\n");
const updaterHook = fs.readFileSync(path.join(root, "src", "hooks", "useAppUpdater.ts"), "utf8");
const updateFlow = fs.readFileSync(path.join(root, "src", "components", "UpdateFlow.tsx"), "utf8");
const stylesRoot = path.join(root, "src", "styles");
const css = [
  fs.readFileSync(path.join(root, "src", "styles.css"), "utf8"),
  ...fs.readdirSync(stylesRoot, { recursive: true })
    .filter((name) => name.endsWith(".css"))
    .map((name) => fs.readFileSync(path.join(stylesRoot, name), "utf8")),
].join("\n");
const editor = [
  fs.readFileSync(path.join(root, "src", "editor", "EditorWorkspace.tsx"), "utf8"),
  fs.readFileSync(path.join(root, "src", "editor", "EditorLanding.tsx"), "utf8"),
  fs.readFileSync(path.join(root, "src", "editor", "RecentDocumentDialogs.tsx"), "utf8"),
].join("\n");
const editorCss = fs.readFileSync(path.join(root, "src", "editor", "editor.css"), "utf8");

assert.match(app, /<div className="floating-corner" data-testid="floating-corner">/, "floating-corner wrapper is missing");
assert.match(app, /updateReminderActive\s*\?\s*"has-update-reminder"\s*:\s*""/, "app shell must expose update reminder state for layout collision avoidance");
assert.doesNotMatch(app, /has-feedback-launcher/, "topbar feedback must not reserve space as a floating control");
assert.match(app, /importToastActive\s*\?\s*"has-import-toast"\s*:\s*""/, "app shell must expose import toast state for notice collision avoidance");
assert.match(appModel, /mockWelcomeSeen"\)\s*!==\s*"1"/, "dev QA hook for skipping the welcome dialog is missing");
assert.match(api, /mockWelcomeSeen"\)\s*!==\s*"1"/, "preview API must honor the welcome-skip QA hook");
assert.match(updaterHook, /mockUpdate"\)\s*!==\s*"1"/, "update reminder QA hook is missing");
assert.doesNotMatch(updaterHook, /import\.meta\.env\.DEV[\s\S]{0,240}mockUpdate/, "mock update UI must be available in built browser previews");
assert.match(app, /feedbackVisible={feedbackLauncherActive}/, "app shell must pass the current feedback visibility rules to the topbar");
assert.match(appTopbar, /<div className="topbar-actions">[\s\S]*?<FeedbackButton/, "feedback must render inside the topbar action group");
assert.doesNotMatch(app, /<FeedbackButton/, "feedback must not remain in the floating app-shell stack");
assert.match(feedbackOverlays, /data-testid="feedback-launcher"/, "feedback launcher test id is missing");
assert.match(updateFlow, /data-testid="update-reminder"/, "update reminder test id is missing");
assert.match(fileWorkflow, /window\.addEventListener\("paste", onPaste\)/, "clipboard paste listener is missing");
assert.match(fileWorkflow, /canImportDroppedFiles\s*=\s*options\.appMode === "converter" && \(step === 1 \|\| step === 2\)/, "paste and drop imports must be limited to converter Files and Formats");
assert.match(fileWorkflow, /appModeRef\.current === "editor"[\s\S]*?setEditorDropRequest/, "native editor drops must be routed through the file workflow");
assert.match(fileWorkflow, /if \(canImportDroppedFilesRef\.current\) await addFilePaths\(paths\);/, "native converter drops must remain limited to import steps");
assert.match(fileWorkflow, /if \(!canImportDroppedFiles\) return;/, "HTML file drops must be ignored outside import steps");
assert.match(fileWorkflow, /api\.saveClipboardFiles/, "clipboard files must be saved locally before analysis");
assert.doesNotMatch(app + appTopbar + fileWorkflow, /pasteFromClipboard|clipboard-button/, "clipboard import must remain implicit without a dedicated UI button");
assert.match(api, /saveClipboardFiles\(files: ClipboardFileInput\[\]\)/, "clipboard API contract is missing");
assert.match(appTopbar, /className="mode-toggle"/, "converter/editor mode toggle is missing");
assert.match(app, /<EditorWorkspace/, "editor workspace is missing from the app shell");
assert.match(editor, /nativeDropRequest/, "the editor must consume native drop requests");
assert.match(editor, /recent-document-menu-popover/, "recent document actions menu is missing");
assert.match(editor, /createPortal/, "editor dialogs must render outside animated workspace containers");
assert.match(editor, /is-menu-open/, "the active recent-document menu must own the highest card stacking layer");
assert.match(editor, /role="alertdialog"/, "deleting a recent document must require an accessible confirmation");
assert.match(editor, /event\.dataTransfer\.files\.length !== 1/, "editor drops must enforce the single-document contract");
assert.match(editorCss, /\.editor-landing\.is-dragging/, "the editor drop state must be visible");
assert.match(editorCss, /\.recent-document-card\.is-menu-open\s*{\s*z-index:\s*40;/, "open recent-document menus must render above later cards");
assert.match(editorCss, /button:not\(\.editor-primary-button\):not\(\.editor-danger-button\)/, "neutral modal button styling must not override destructive actions");
assert.match(css + editorCss, /prefers-reduced-motion:\s*reduce/, "editor motion must honor reduced-motion preferences");

const floatingCorner = cssRule(".floating-corner");
assert.match(floatingCorner, /position:\s*fixed;/, "floating-corner must own fixed positioning");
assert.match(floatingCorner, /flex-direction:\s*column;/, "floating-corner must stack floating controls vertically");
assert.match(floatingCorner, /pointer-events:\s*none;/, "floating-corner should not block the app outside its children");
assert.match(cssRule(".floating-corner > *"), /pointer-events:\s*auto;/, "floating-corner children must remain clickable");
assert.match(cssRule(".floating-corner > *"), /transform-origin:\s*right bottom;/, "floating-corner children should animate from the corner anchor");
assert.match(css, /--vlm-ease-standard:\s*cubic-bezier\(0\.22,\s*0\.72,\s*0\.18,\s*1\);/, "shared Vellum UI easing token is missing");
assert.match(cssRule("button"), /touch-action:\s*manipulation;/, "buttons should use manipulation touch action");
assert.match(cssRule(".app-shell"), /--floating-toast-offset:\s*24px;/, "app shell must define the default floating toast offset");
assert.match(cssRule(".app-shell"), /--page-notice-offset:\s*var\(--floating-toast-offset\);/, "page notices must default to the floating toast offset");
assert.match(cssRule(".app-shell.has-update-reminder"), /--floating-toast-offset:\s*190px;/, "update reminder state must reserve vertical toast space");
assert.match(cssRule(".app-shell.has-import-toast"), /--page-notice-offset:\s*calc\(var\(--floating-toast-offset\) \+ 86px\);/, "page notices must move above import toast when both are visible");

const updateReminder = cssRule(".update-reminder");
const feedbackLauncher = cssRule(".feedback-launcher");
const importToast = cssRule(".import-toast");
const pageNotice = cssRule(".page-notice");
assert.doesNotMatch(updateReminder, /position:\s*fixed;/, "update-reminder must not be fixed independently");
assert.doesNotMatch(feedbackLauncher, /position:\s*fixed;/, "feedback-launcher must not be fixed independently");
assert.match(importToast, /bottom:\s*var\(--floating-toast-offset\);/, "import toast must avoid the floating feedback/update stack");
assert.match(importToast, /transition:\s*bottom 180ms var\(--vlm-ease-standard\);/, "import toast should move smoothly when floating controls appear");
assert.match(pageNotice, /bottom:\s*var\(--page-notice-offset\);/, "page notices must avoid the floating feedback/update/import stack");
assert.match(pageNotice, /transition:\s*bottom var\(--vlm-motion-base\) var\(--vlm-ease-standard\);/, "page notices should move smoothly when floating controls appear");
assert.match(floatingCorner, /max-height:\s*calc\(100vh - 44px\);/, "floating corner must stay inside short viewports");
assert.match(floatingCorner, /overflow:\s*auto;/, "floating corner must scroll instead of covering the app in short viewports");
assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.floating-corner\s*{[\s\S]*?width:\s*calc\(100vw - 28px\);/, "mobile layout must resize the floating stack");
assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.update-reminder\s*{[\s\S]*?grid-template-columns:\s*1fr;/, "mobile update reminder must stack actions instead of squeezing controls");
assert.match(css, /\.drop-zone:hover,\s*[\r\n]+\.drop-zone:focus-within,\s*[\r\n]+\.drop-zone\.is-over/, "drop zone must have hover and keyboard focus motion states");
assert.match(css, /\.file-ticket:hover,\s*[\r\n]+\.file-ticket:focus-within/, "file tickets must react to hover and keyboard focus");
assert.match(css, /\.update-reminder:hover,\s*[\r\n]+\.update-reminder:focus-within/, "update reminder must react to hover and keyboard focus");
assert.match(css, /\.feedback-launcher:hover,\s*[\r\n]+\.feedback-launcher:focus-visible/, "feedback launcher must react to hover and keyboard focus");
assert.match(css, /\.feedback-launcher:hover span,\s*[\r\n]+\.feedback-launcher:focus-visible span/, "feedback launcher icon should provide subtle motion feedback");
assert.match(css, /\.primary-button:active:not\(:disabled\),[\s\S]*?scale\(0\.985\);/, "main controls must have a stable pressed state");
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, "reduced motion preference must be honored");
console.log("UI layout tests passed.");

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|})\\s*${escaped}\\s*{([\\s\\S]*?)}`));
  assert.ok(match, `${selector} rule is missing`);
  return match[1];
}
