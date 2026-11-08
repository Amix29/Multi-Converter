import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const composition = fs.readFileSync(path.join(root, "src", "app", "application.svelte.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src", "App.svelte"), "utf8").replaceAll("application.", "");
const appTopbar = fs.readFileSync(path.join(root, "src", "app", "layout", "AppTopbar.svelte"), "utf8");
const filesScreen = fs.readFileSync(path.join(root, "src", "app", "screens", "FilesScreen.svelte"), "utf8");
const formatScreen = fs.readFileSync(path.join(root, "src", "app", "screens", "FormatScreen.svelte"), "utf8");
const progressScreen = fs.readFileSync(path.join(root, "src", "app", "screens", "ProgressScreen.svelte"), "utf8");
const virtualizedJobList = fs.readFileSync(path.join(root, "src", "app", "screens", "VirtualizedJobList.svelte"), "utf8");
const largeListModel = fs.readFileSync(path.join(root, "src", "app", "conversion", "largeListModel.ts"), "utf8");
const feedbackOverlays = fs.readFileSync(path.join(root, "src", "app", "feedback", "FeedbackButton.svelte"), "utf8");
const fileWorkflow = fs.readFileSync(path.join(root, "src", "app", "conversion", "fileWorkflow.svelte.ts"), "utf8");
const api = [
  fs.readFileSync(path.join(root, "src", "lib", "api.ts"), "utf8"),
  fs.readFileSync(path.join(root, "src", "lib", "api", "contracts.ts"), "utf8"),
  fs.readFileSync(path.join(root, "src", "lib", "api", "previewAdapter.ts"), "utf8"),
  fs.readFileSync(path.join(root, "src", "lib", "api", "tauriAdapter.ts"), "utf8"),
].join("\n");
const updaterHook = fs.readFileSync(path.join(root, "src", "hooks", "appUpdater.svelte.ts"), "utf8");
const updateFlow = fs.readFileSync(path.join(root, "src", "components", "UpdateReminder.svelte"), "utf8");
const stylesRoot = path.join(root, "src", "styles");
const css = [
  fs.readFileSync(path.join(root, "src", "styles.css"), "utf8"),
  ...fs.readdirSync(stylesRoot, { recursive: true })
    .filter((name) => name.endsWith(".css") && !name.startsWith("vendor"))
    .map((name) => fs.readFileSync(path.join(stylesRoot, name), "utf8")),
].join("\n");
const fileCardsCss = fs.readFileSync(path.join(root, "src", "styles", "file-cards.css"), "utf8");

assert.match(app, /<div\s+class="floating-corner"\s+data-testid="floating-corner"\s*>/, "floating-corner wrapper is missing");
assert.match(app, /updateReminderActive\s*\?\s*"has-update-reminder"\s*:\s*""/, "app shell must expose update reminder state for layout collision avoidance");
assert.doesNotMatch(app, /has-feedback-launcher/, "topbar feedback must not reserve space as a floating control");
assert.match(app, /importToastActive\s*\?\s*"has-import-toast"\s*:\s*""/, "app shell must expose import toast state for notice collision avoidance");
assert.match(updaterHook, /mockUpdate"\)\s*!==\s*"1"/, "update reminder QA hook is missing");
assert.match(updaterHook, /import\.meta\.env\.DEV\s*\|\|\s*import\.meta\.env\.MODE\s*===\s*"preview"/, "mock update UI must be compiled only for dev or explicit built previews");
assert.match(app, /feedbackVisible={feedbackLauncherActive}/, "app shell must pass the current feedback visibility rules to the topbar");
assert.match(appTopbar, /<div\s+class="topbar-actions">[\s\S]*?<FeedbackButton/, "feedback must render inside the topbar action group");
assert.match(appTopbar, /<div\s+class="brand-title-row">[\s\S]*?brand-mark[\s\S]*?<h1>Multi-Converter<\/h1>/, "the logo must sit immediately beside the product name");
assert.match(css, /grid-template-areas:\s*[\r\n]+\s*"brand actions"[\r\n]+\s*"context context";/, "compact topbars must keep settings on the right and move context below");
assert.doesNotMatch(app, /<FeedbackButton/, "feedback must not remain in the floating app-shell stack");
assert.match(feedbackOverlays, /data-testid="feedback-launcher"/, "feedback launcher test id is missing");
assert.match(updateFlow, /data-testid="update-reminder"/, "update reminder test id is missing");
assert.match(fileWorkflow, /window\.addEventListener\("paste", onPaste\)/, "clipboard paste listener is missing");
assert.match(fileWorkflow, /canImportDroppedFiles\s*=\s*\$derived\(step === 1 \|\| step === 2\)/, "paste and drop imports must be limited to converter Files and Formats");
assert.match(fileWorkflow, /canImportDroppedFiles\)\s*{\s*await addFilePaths\(paths\);/, "native converter drops must remain limited to import steps");
assert.match(fileWorkflow, /if \(!canImportDroppedFiles\) return;/, "HTML file drops must be ignored outside import steps");
assert.match(fileWorkflow, /api\.saveClipboardFiles/, "clipboard files must be saved locally before analysis");
assert.doesNotMatch(app + appTopbar + fileWorkflow, /pasteFromClipboard|clipboard-button/, "clipboard import must remain implicit without a dedicated UI button");
assert.match(api, /saveClipboardFiles\(files: ClipboardFileInput\[\]\)/, "clipboard API contract is missing");
assert.match(composition, /untrack[\s\S]*?bootStarted\.current[\s\S]*?bootstrapDependencies\(\)/, "engine bootstrap must be isolated from language dependencies");
assert.match(fileWorkflow, /untrack[\s\S]*?onProgress[\s\S]*?disposed/, "native listeners must own teardown and avoid implicit language tracking");
assert.match(formatScreen, /stablePartitionBySupport/, "Formats must keep compatible files before unsupported files");
assert.match(largeListModel, /for \(const file of files\)[\s\S]*?supported[\s\S]*?unsupported/, "the supported-first partition must remain stable");
assert.match(progressScreen, /progress\.filterAll[\s\S]*?progress\.filterErrors/, "output status filters are missing");
assert.match(virtualizedJobList, /props\.files\.slice\(\s*windowState\.startIndex,\s*windowState\.endIndex,?\s*\)/, "output jobs must mount only the visible virtual window");
assert.match(virtualizedJobList, /data-total-count={props\.files\.length}/, "the virtual output list must expose its complete item count for QA");
assert.match(fileCardsCss, /max-height:\s*calc\(3 \* 132px \+ 2 \* 12px\);/, "the file lane must show at most three card rows");
assert.doesNotMatch(fileCardsCss, /animation\s*:/, "large file-card lists must not animate each card on entry");

assert.doesNotMatch(app + appTopbar + fileWorkflow, /EditorWorkspace|onAppMode|editorDropRequest/, "removed editor navigation must not return");
assert.match(app, /import\("\.\/ocr\/ImageOcrDialog\.svelte"\)/, "image OCR must remain available from the converter");
assert.match(api, /recognizeImage|recognize_image/, "the OCR API must remain available");
assert.doesNotMatch(api, /editorCreateDocument|pdfEditorOpen|editor_create_document|pdf_editor_open/, "editor APIs must not be exposed");

const floatingCorner = cssRule(".floating-corner");
assert.match(floatingCorner, /position:\s*fixed;/, "floating-corner must own fixed positioning");
assert.match(floatingCorner, /flex-direction:\s*column;/, "floating-corner must stack floating controls vertically");
assert.match(floatingCorner, /pointer-events:\s*none;/, "floating-corner should not block the app outside its children");
assert.match(cssRule(".floating-corner > *"), /pointer-events:\s*auto;/, "floating-corner children must remain clickable");
assert.match(cssRule(".floating-corner > *"), /transform-origin:\s*right bottom;/, "floating-corner children should animate from the corner anchor");
assert.match(css, /--vlm-ease-standard:\s*cubic-bezier\(0\.19,\s*1,\s*0\.22,\s*1\);/, "the approved product easing token is missing");
assert.match(cssRule("button"), /touch-action:\s*manipulation;/, "buttons should use manipulation touch action");
assert.match(cssRule(".app-shell"), /--floating-toast-offset:\s*24px;/, "app shell must define the default floating toast offset");
assert.match(cssRule(".app-shell.has-update-reminder"), /--floating-toast-offset:\s*190px;/, "update reminder state must reserve vertical toast space");

const updateReminder = cssRule(".update-reminder");
const feedbackLauncher = cssRule(".feedback-launcher");
const importToast = cssRule(".import-toast");
const pageNotice = cssRule(".page-notice");
assert.doesNotMatch(updateReminder, /position:\s*fixed;/, "update-reminder must not be fixed independently");
assert.doesNotMatch(feedbackLauncher, /position:\s*fixed;/, "feedback-launcher must not be fixed independently");
assert.match(importToast, /bottom:\s*var\(--floating-toast-offset\);/, "import toast must avoid the floating feedback/update stack");
assert.match(importToast, /transition:\s*bottom 180ms var\(--vlm-ease-standard\);/, "import toast should move smoothly when floating controls appear");
assert.match(pageNotice, /position:\s*relative;/, "notices must participate in layout rather than cover output actions");
assert.match(pageNotice, /grid-row:\s*2;/, "notices need their own row below navigation");
assert.match(cssRule(".app-shell.has-page-notice"), /grid-template-rows:\s*(?:104px|auto) auto minmax\(0, 1fr\);/, "desktop and responsive notices must reserve a separate row");
assert.doesNotMatch(pageNotice, /position:\s*fixed;/, "notices must not obscure export controls");
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
