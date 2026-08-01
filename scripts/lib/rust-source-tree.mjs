import fs from "node:fs";
import path from "node:path";

function rustFilesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...rustFilesUnder(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".rs")) {
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function readRustModuleTree(root, moduleName) {
  const rustRoot = path.join(root, "src-tauri", "src");
  const moduleFile = path.join(rustRoot, `${moduleName}.rs`);
  const files = [moduleFile, ...rustFilesUnder(path.join(rustRoot, moduleName))];
  return files.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
}

export function copyRustModuleTree(sourceRoot, destinationRoot, moduleName) {
  const sourceRustRoot = path.join(sourceRoot, "src-tauri", "src");
  const destinationRustRoot = path.join(destinationRoot, "src-tauri", "src");
  fs.mkdirSync(destinationRustRoot, { recursive: true });
  fs.copyFileSync(
    path.join(sourceRustRoot, `${moduleName}.rs`),
    path.join(destinationRustRoot, `${moduleName}.rs`),
  );
  const sourceDirectory = path.join(sourceRustRoot, moduleName);
  if (fs.existsSync(sourceDirectory)) {
    fs.cpSync(sourceDirectory, path.join(destinationRustRoot, moduleName), { recursive: true });
  }
}
