import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const assets = path.join(root, "dist/assets");
const files = fs.readdirSync(assets).filter(name => name.endsWith(".js"));
assert.ok(files.length > 0, "build production assets before checking");
const source = files.map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
for (const marker of ["mockLargeBatch", "mockSlowOcr", "mockConversionFailure", "multi-converter-preview-recovery", "multi-converter-preview"]) {
  assert.ok(!source.includes(marker), "preview fixture present in production: " + marker);
}
assert.doesNotMatch(source, /react-dom|react\.production|react-jsx-runtime/, "desktop bundle must not ship React");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const name of ["react", "react-dom", "@types/react", "@types/react-dom", "@vitejs/plugin-react"]) {
  assert.equal(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name], undefined, name + " remains in desktop dependencies");
}
console.log("Production bundle passed: no preview fixtures or desktop React runtime.");
