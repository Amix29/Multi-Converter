import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve(import.meta.dirname, "..");
const kit = path.join(root, "branding-kit/08_design-system");
const css = fs.readFileSync(path.join(kit, "tokens.css"), "utf8");
const blocks = [...css.matchAll(/[^{}]+\{([^{}]+)\}/g)];
const contract = JSON.parse(fs.readFileSync(path.join(kit, "source/action-roles.json"), "utf8"));
const themes = JSON.parse(fs.readFileSync(path.join(kit, "source/theme-tokens.json"), "utf8"));
function luminance(hex) {
  const linear = hex.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
const measurements = [];
for (const [index, mode] of ["light", "dark"].entries()) {
  const roles = contract.themes[mode];
  for (const [name, value] of Object.entries(roles)) {
    const actual = blocks[index][1].match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    assert.equal(actual, value, `${mode} ${name}: generated role differs from canonical CSS`);
    assert.equal(themes[mode][name], value, `${mode} ${name}: theme index differs`);
  }
  assert.equal(roles["--action-on"], "#fffdf7");
  for (const state of ["bg", "hover", "active"]) {
    const values = [luminance(roles[`--action-${state}`]), luminance(roles["--action-on"])].sort((a,b) => a-b);
    const ratio = (values[1] + 0.05) / (values[0] + 0.05);
    assert.ok(ratio >= 4.5, `${mode} ${state}: contrast ${ratio}`);
    measurements.push({ mode, state, contrast: Number(ratio.toFixed(3)) });
  }
}
const bridge = fs.readFileSync(path.join(root, "src/styles/tailwind.css"), "utf8");
assert.doesNotMatch(bridge, /--text-(?:xs|sm|base|lg|xl):/, "generic Tailwind typography must remain independent");
assert.match(bridge, /--color-primary: var\(--action-bg\)/);
assert.match(bridge, /--color-primary-foreground: var\(--action-on\)/);
const desktop = fs.readFileSync(path.join(root, "src/styles/design-system.css"), "utf8");
assert.doesNotMatch(desktop, /(?:animation|transition)-duration:1ms/);
assert.match(desktop, /--vlm-motion-fast: var\(--motion-fast\)/);
assert.match(desktop, /--vlm-motion-base: var\(--motion-base\)/);
const scanned = JSON.parse(fs.readFileSync(path.join(kit, "source/scanned-files.json"), "utf8"));
for (const file of scanned.files) {
  assert.equal(createHash("sha256").update(fs.readFileSync(path.join(kit, file.path))).digest("hex"), file.sha256, `stale design source index: ${file.path}`);
}
console.log(JSON.stringify({ designContract: "passed", measurements, indexedFiles: scanned.files.length }));
