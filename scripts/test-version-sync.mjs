import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");
const expected = "1.0.7";

assert.equal(packageJson.version, expected, "package.json doit annoncer V1.0.7");
assert.equal(packageLock.version, expected, "package-lock.json racine désynchronisé");
assert.equal(packageLock.packages?.[""]?.version, expected, "package-lock.json package racine désynchronisé");
assert.equal(tauri.version, expected, "tauri.conf.json désynchronisé");
assert.match(cargoToml, new RegExp(`^version = "${expected.replaceAll(".", "\\.")}"$`, "m"));
assert.match(cargoLock, new RegExp(`name = "multi-converter"\\s+version = "${expected.replaceAll(".", "\\.")}"`));

console.log("Application version synchronization passed: npm, Tauri and Rust all target V1.0.7.");

function readJson(relative) {
  return JSON.parse(readText(relative));
}

function readText(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}
