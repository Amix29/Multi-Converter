import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = fs.readFileSync(path.join(root, "package-lock.json"), "utf8");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const appTopbar = fs.readFileSync(path.join(root, "src", "app", "layout", "AppTopbar.tsx"), "utf8");
const fileWorkflow = fs.readFileSync(path.join(root, "src", "app", "conversion", "useFileWorkflow.ts"), "utf8");
const api = [
  fs.readFileSync(path.join(root, "src", "lib", "api.ts"), "utf8"),
  fs.readFileSync(path.join(root, "src", "lib", "api", "contracts.ts"), "utf8"),
  fs.readFileSync(path.join(root, "src", "lib", "api", "previewAdapter.ts"), "utf8"),
  fs.readFileSync(path.join(root, "src", "lib", "api", "tauriAdapter.ts"), "utf8"),
].join("\n");
const editorRoot = path.join(root, "src-tauri", "src", "editor");
const backend = [
  fs.readFileSync(path.join(root, "src-tauri", "src", "editor.rs"), "utf8"),
  ...fs.readdirSync(editorRoot).filter((name) => name.endsWith(".rs")).map((name) => fs.readFileSync(path.join(editorRoot, name), "utf8")),
].join("\n");
const editorImporter = fs.readFileSync(path.join(editorRoot, "import.rs"), "utf8");
const editorExporter = fs.readFileSync(path.join(editorRoot, "export.rs"), "utf8");
const converters = fs.readFileSync(path.join(root, "src-tauri", "src", "converters.rs"), "utf8");
const editorExtensions = fs.readFileSync(path.join(root, "src", "editor", "extensions.ts"), "utf8");
const imageNodeView = fs.readFileSync(path.join(root, "src", "editor", "DocumentImageView.tsx"), "utf8");
const htmlSanitizer = fs.readFileSync(path.join(root, "src", "editor", "htmlSanitizer.ts"), "utf8");
const editorAssets = fs.readFileSync(path.join(root, "src", "editor", "editorAssets.ts"), "utf8");
const documentEditor = fs.readFileSync(path.join(root, "src", "editor", "DocumentEditor.tsx"), "utf8");
const headerFooterDialog = fs.readFileSync(path.join(root, "src", "editor", "HeaderFooterDialog.tsx"), "utf8");
const tauriConfig = fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8");

for (const [name, version] of Object.entries(packageJson.dependencies)) {
  assert.ok(!name.startsWith("@tiptap-pro/"), `paid Tiptap dependency is forbidden: ${name}`);
  if (name.startsWith("@tiptap/")) assert.equal(version, "3.27.3", `${name} must be exactly pinned`);
}
assert.doesNotMatch(packageLock, /node_modules\/@tiptap-pro\//, "package lock must not contain Tiptap Pro packages");
assert.equal(packageJson.dependencies.dompurify, "3.4.12", "DOMPurify must be exactly pinned");
assert.match(packageLock, /node_modules\/dompurify[\s\S]*?"version": "3\.4\.12"/, "DOMPurify lock entry is missing");

assert.match(app, /type AppMode/, "app mode contract must be imported");
assert.match(appTopbar, /className="mode-toggle"/, "converter/editor mode toggle is missing");
assert.match(fileWorkflow, /const canImportDroppedFiles = options\.appMode === "converter" && \(step === 1 \|\| step === 2\)/, "converter drop scope must not capture editor drops");
assert.match(api, /editorCreateDocument\(\)/, "editor frontend API is missing");
assert.match(api, /editorRenameDocument\(/, "recent document rename API is missing");
assert.match(api, /editorDuplicateDocument\(/, "recent document duplicate API is missing");
assert.match(backend, /editor_rename_document/, "recent document rename command is missing");
assert.match(backend, /editor_duplicate_document/, "recent document duplicate command is missing");
assert.match(backend, /duplicate\.source = None/, "duplicates must never retain overwrite access to the original source");
assert.match(backend, /EDITOR_SOURCE_CONFLICT/, "external source conflict protection is missing");
assert.match(backend, /MAX_IMPORT_BYTES/, "bounded editor import is missing");
assert.equal((editorImporter.match(/target_format:\s*"html"/g) ?? []).length, 1, "only the Markdown adapter may route through HTML");
assert.match(editorImporter, /convert_office_document_strict/, "office imports must use the strict rich ODT bridge");
assert.match(editorExporter, /convert_office_document_strict/, "office exports must use the strict rich ODT bridge");
assert.ok((editorExporter.match(/convert_office_document_strict/g) ?? []).length >= 2, "office exports must normalize ODT before final LibreOffice conversion");
assert.doesNotMatch(editorExporter, /ConversionJob|converters::convert\(/, "office exports must not use the generic engine planner or its text fallback");
assert.match(converters, /pub\(crate\) fn convert_office_document_strict/, "the strict LibreOffice bridge is missing");
assert.match(backend, /mc-asset:\/\//, "canonical editor asset protocol is missing");
assert.doesNotMatch(api, /html:\s*editor\.getHTML/, "office exports must use Tiptap JSON rather than a frontend HTML snapshot");
assert.match(editorExtensions, /allowBase64:\s*false/, "base64 images must be disabled in Tiptap");
assert.match(imageNodeView, /URL\.revokeObjectURL/, "temporary editor asset URLs must be revoked");
assert.match(api, /editorStoreAsset/, "the frontend asset storage contract is missing");
assert.match(htmlSanitizer, /DOMPurify\.sanitize/, "editor HTML must use DOMPurify");
assert.match(htmlSanitizer, /options\.allowDataImages\s*&&\s*isBoundedDataImage/, "pasted HTML data images must stay disabled by default");
assert.match(editorAssets, /allowDataImages:\s*true/, "only the import asset migration may admit bounded data images");
assert.match(documentEditor, /transformPastedHTML:[\s\S]*sanitizeImportedHtml/, "document HTML paste/drop sanitization is missing");
assert.match(headerFooterDialog, /transformPastedHTML:[\s\S]*sanitizeImportedHtml/, "header/footer HTML paste/drop sanitization is missing");
assert.match(tauriConfig, /script-src 'self'/, "the Tauri script CSP must stay self-only");
assert.doesNotMatch(tauriConfig, /script-src[^;]*(?:'unsafe-inline'|'unsafe-eval')/, "the Tauri script CSP must not allow inline code or eval");

console.log("Editor source contracts passed.");
