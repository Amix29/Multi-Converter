import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const api = fs.readFileSync(path.join(root, "src", "lib", "api.ts"), "utf8");
const updateFlow = fs.readFileSync(path.join(root, "src", "components", "UpdateFlow.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

assert.match(app, /<div className="floating-corner" data-testid="floating-corner">/, "floating-corner wrapper is missing");
assert.match(app, /mockWelcomeSeen"\)\s*!==\s*"1"/, "dev QA hook for skipping the welcome dialog is missing");
assert.match(api, /mockWelcomeSeen"\)\s*!==\s*"1"/, "preview API must honor the welcome-skip QA hook");
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
assert.match(css, /--ease-ui:\s*cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\);/, "shared UI easing token is missing");
assert.match(cssRule("button"), /touch-action:\s*manipulation;/, "buttons should use manipulation touch action");

const updateReminder = cssRule(".update-reminder");
const feedbackLauncher = cssRule(".feedback-launcher");
assert.doesNotMatch(updateReminder, /position:\s*fixed;/, "update-reminder must not be fixed independently");
assert.doesNotMatch(feedbackLauncher, /position:\s*fixed;/, "feedback-launcher must not be fixed independently");
assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.floating-corner\s*{[\s\S]*?width:\s*calc\(100vw - 28px\);/, "mobile layout must resize the floating stack");
assert.match(css, /\.drop-zone:hover,\s*[\r\n]+\.drop-zone:focus-within,\s*[\r\n]+\.drop-zone\.is-over/, "drop zone must have hover and keyboard focus motion states");
assert.match(css, /\.file-ticket:hover,\s*[\r\n]+\.file-ticket:focus-within/, "file tickets must react to hover and keyboard focus");
assert.match(css, /\.primary-button:active:not\(:disabled\),[\s\S]*?scale\(0\.985\);/, "main controls must have a stable pressed state");
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, "reduced motion preference must be honored");

console.log("UI layout tests passed.");

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*{([\\s\\S]*?)}`));
  assert.ok(match, `${selector} rule is missing`);
  return match[1];
}
