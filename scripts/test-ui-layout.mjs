import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const api = fs.readFileSync(path.join(root, "src", "lib", "api.ts"), "utf8");
const updaterHook = fs.readFileSync(path.join(root, "src", "hooks", "useAppUpdater.ts"), "utf8");
const updateFlow = fs.readFileSync(path.join(root, "src", "components", "UpdateFlow.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

assert.match(app, /<div className="floating-corner" data-testid="floating-corner">/, "floating-corner wrapper is missing");
assert.match(app, /updateReminderActive\s*\?\s*"has-update-reminder"\s*:\s*""/, "app shell must expose update reminder state for layout collision avoidance");
assert.match(app, /feedbackLauncherActive\s*\?\s*"has-feedback-launcher"\s*:\s*""/, "app shell must expose feedback launcher state for layout collision avoidance");
assert.match(app, /mockWelcomeSeen"\)\s*!==\s*"1"/, "dev QA hook for skipping the welcome dialog is missing");
assert.match(api, /mockWelcomeSeen"\)\s*!==\s*"1"/, "preview API must honor the welcome-skip QA hook");
assert.match(updaterHook, /mockUpdate"\)\s*!==\s*"1"/, "update reminder QA hook is missing");
assert.doesNotMatch(updaterHook, /import\.meta\.env\.DEV[\s\S]{0,240}mockUpdate/, "mock update UI must be available in built browser previews");
assert.ok(
  app.indexOf("<UpdateReminder") < app.indexOf("<FeedbackButton"),
  "Update reminder must render before feedback in the floating stack so feedback stays at the bottom",
);
assert.match(app, /data-testid="feedback-launcher"/, "feedback launcher test id is missing");
assert.match(updateFlow, /data-testid="update-reminder"/, "update reminder test id is missing");

const floatingCorner = cssRule(".floating-corner");
assert.match(floatingCorner, /position:\s*fixed;/, "floating-corner must own fixed positioning");
assert.match(floatingCorner, /flex-direction:\s*column;/, "floating-corner must stack floating controls vertically");
assert.match(floatingCorner, /pointer-events:\s*none;/, "floating-corner should not block the app outside its children");
assert.match(cssRule(".floating-corner > *"), /pointer-events:\s*auto;/, "floating-corner children must remain clickable");
assert.match(cssRule(".floating-corner > *"), /transform-origin:\s*right bottom;/, "floating-corner children should animate from the corner anchor");
assert.match(css, /--ease-ui:\s*cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\);/, "shared UI easing token is missing");
assert.match(cssRule("button"), /touch-action:\s*manipulation;/, "buttons should use manipulation touch action");
assert.match(cssRule(".app-shell"), /--floating-toast-offset:\s*24px;/, "app shell must define the default floating toast offset");
assert.match(cssRule(".app-shell.has-feedback-launcher"), /--floating-toast-offset:\s*88px;/, "feedback launcher state must reserve vertical toast space");
assert.match(cssRule(".app-shell.has-update-reminder"), /--floating-toast-offset:\s*190px;/, "update reminder state must reserve vertical toast space");
assert.match(cssRule(".app-shell.has-update-reminder.has-feedback-launcher"), /--floating-toast-offset:\s*250px;/, "combined floating controls must reserve enough toast space");

const updateReminder = cssRule(".update-reminder");
const feedbackLauncher = cssRule(".feedback-launcher");
const importToast = cssRule(".import-toast");
const pageNotice = cssRule(".page-notice");
assert.doesNotMatch(updateReminder, /position:\s*fixed;/, "update-reminder must not be fixed independently");
assert.doesNotMatch(feedbackLauncher, /position:\s*fixed;/, "feedback-launcher must not be fixed independently");
assert.match(importToast, /bottom:\s*var\(--floating-toast-offset\);/, "import toast must avoid the floating feedback/update stack");
assert.match(importToast, /transition:\s*bottom 180ms var\(--ease-ui\);/, "import toast should move smoothly when floating controls appear");
assert.match(pageNotice, /bottom:\s*var\(--floating-toast-offset\);/, "page notices must avoid the floating feedback/update stack");
assert.match(pageNotice, /transition:\s*bottom 180ms var\(--ease-ui\);/, "page notices should move smoothly when floating controls appear");
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
  const match = css.match(new RegExp(`${escaped}\\s*{([\\s\\S]*?)}`));
  assert.ok(match, `${selector} rule is missing`);
  return match[1];
}
