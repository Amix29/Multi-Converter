import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readRustModuleTree } from "./lib/rust-source-tree.mjs";

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
const backend = readRustModuleTree(root, "editor");
const fontBackend = [
  fs.readFileSync(path.join(root, "src-tauri", "src", "editor_fonts.rs"), "utf8"),
  ...fs.readdirSync(path.join(root, "src-tauri", "src", "editor_fonts"))
    .filter((name) => name.endsWith(".rs"))
    .map((name) => fs.readFileSync(path.join(root, "src-tauri", "src", "editor_fonts", name), "utf8")),
].join("\n");
const editorImporter = fs.readFileSync(path.join(editorRoot, "import.rs"), "utf8");
const editorExporter = fs.readFileSync(path.join(editorRoot, "export.rs"), "utf8");
const converters = readRustModuleTree(root, "converters");
const editorExtensions = fs.readFileSync(path.join(root, "src", "editor", "extensions.ts"), "utf8");
const imageNodeView = fs.readFileSync(path.join(root, "src", "editor", "DocumentImageView.tsx"), "utf8");
const htmlSanitizer = fs.readFileSync(path.join(root, "src", "editor", "htmlSanitizer.ts"), "utf8");
const editorAssets = fs.readFileSync(path.join(root, "src", "editor", "editorAssets.ts"), "utf8");
const documentEditor = fs.readFileSync(path.join(root, "src", "editor", "DocumentEditor.tsx"), "utf8");
const generatedDocx = [
  ...fs.readdirSync(path.join(root, "src", "editor", "docx"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => fs.readFileSync(path.join(root, "src", "editor", "docx", name), "utf8")),
  backend,
].join("\n");
const pdfFontPolicy = fs.readFileSync(path.join(root, "src", "editor", "pdfFontPolicy.ts"), "utf8");
const editorToolbar = [
  fs.readFileSync(path.join(root, "src", "editor", "EditorToolbar.tsx"), "utf8"),
  fs.readFileSync(path.join(root, "src", "editor", "EditorTextControls.tsx"), "utf8"),
  fs.readFileSync(path.join(root, "src", "editor", "EditorToolbarSections.tsx"), "utf8"),
  fs.readFileSync(path.join(root, "src", "editor", "EditorColorPopover.tsx"), "utf8"),
  fs.readFileSync(path.join(root, "src", "editor", "EditorMetricCombobox.tsx"), "utf8"),
  fs.readFileSync(path.join(root, "src", "editor", "editorColorState.ts"), "utf8"),
].join("\n");
const fontControl = fs.readFileSync(path.join(root, "src", "editor", "EditorFontFamilyControl.tsx"), "utf8");
const tableControls = fs.readFileSync(path.join(root, "src", "editor", "EditorTableControls.tsx"), "utf8");
const toolbarIcons = fs.readFileSync(path.join(root, "src", "editor", "EditorToolbarIcons.tsx"), "utf8");
const documentCommandRow = fs.readFileSync(path.join(root, "src", "editor", "DocumentCommandRow.tsx"), "utf8");
const editorFocusMode = fs.readFileSync(path.join(root, "src", "editor", "useEditorFocusMode.ts"), "utf8");
const editorCss = [
  fs.readFileSync(path.join(root, "src", "editor", "editor.css"), "utf8"),
  fs.readFileSync(path.join(root, "src", "editor", "editor-table-resize.css"), "utf8"),
].join("\n");
const headerFooterDialog = fs.readFileSync(path.join(root, "src", "editor", "HeaderFooterDialog.tsx"), "utf8");
const tauriConfig = fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8");

for (const [name, version] of Object.entries(packageJson.dependencies)) {
  assert.ok(!name.startsWith("@tiptap-pro/"), `paid Tiptap dependency is forbidden: ${name}`);
  if (name.startsWith("@tiptap/")) assert.equal(version, "3.27.3", `${name} must be exactly pinned`);
}
assert.doesNotMatch(packageLock, /node_modules\/@tiptap-pro\//, "package lock must not contain Tiptap Pro packages");
assert.equal(packageJson.dependencies.dompurify, "3.4.12", "DOMPurify must be exactly pinned");
assert.match(packageLock, /node_modules\/dompurify[\s\S]*?"version": "3\.4\.12"/, "DOMPurify lock entry is missing");
assert.equal(packageJson.dependencies.docx, "9.7.1", "docx.js must be exactly pinned");
assert.match(packageLock, /node_modules\/docx[\s\S]*?"version": "9\.7\.1"/, "docx.js lock entry is missing");
assert.ok(fs.existsSync(path.join(root, "public", "third-party", "docx", "LICENSE.txt")), "docx.js MIT license is missing");

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
assert.match(editorExporter, /convert_office_document_strict/, "RTF and PDF exports must use the strict rich ODT bridge");
assert.ok((editorExporter.match(/convert_office_document_strict/g) ?? []).length >= 2, "RTF and PDF exports must normalize ODT before final LibreOffice conversion");
assert.doesNotMatch(editorExporter, /ConversionJob|converters::convert\(/, "office exports must not use the generic engine planner or its text fallback");
assert.match(editorExporter, /EDITOR_DOCX_DIRECT_REQUIRED/, "LibreOffice must reject DOCX export fallback");
assert.match(converters, /pub\(crate\) fn convert_office_document_strict/, "the strict LibreOffice bridge is missing");
assert.match(documentEditor, /writeGeneratedDocx\(api, request/, "DOCX save and export must use the direct generator");
assert.match(generatedDocx, /import\("docx"\)/, "docx.js must be loaded lazily");
assert.match(generatedDocx, /new Worker\(new URL\("\.\/docxGeneration\.worker\.ts"/, "DOCX packing must run in the dedicated Vite worker when available");
assert.match(generatedDocx, /worker\.terminate\(\)/, "DOCX cancellation must terminate the worker");
assert.match(generatedDocx, /DOCX_LIMIT:\s*u64\s*=\s*128 \* 1024 \* 1024/, "generated DOCX output must be bounded to 128 MiB");
assert.match(generatedDocx, /DOCX_CHUNK_SIZE:\s*usize\s*=\s*1024 \* 1024/, "generated DOCX writes must use 1 MiB chunks");
assert.match(generatedDocx, /commit_staged_file/, "generated DOCX commit must use the shared atomic filesystem primitive");
assert.match(backend, /mc-asset:\/\//, "canonical editor asset protocol is missing");
assert.doesNotMatch(api, /html:\s*editor\.getHTML/, "office exports must use Tiptap JSON rather than a frontend HTML snapshot");
assert.match(editorExtensions, /allowBase64:\s*false/, "base64 images must be disabled in Tiptap");
assert.match(imageNodeView, /URL\.revokeObjectURL/, "temporary editor asset URLs must be revoked");
assert.match(api, /editorStoreAsset/, "the frontend asset storage contract is missing");
assert.match(htmlSanitizer, /DOMPurify\.sanitize/, "editor HTML must use DOMPurify");
assert.match(htmlSanitizer, /options\.allowDataImages\s*&&\s*isBoundedDataImage/, "pasted HTML data images must stay disabled by default");
assert.match(editorAssets, /allowDataImages:\s*true/, "only the import asset migration may admit bounded data images");
assert.match(documentEditor, /transformPastedHTML:[\s\S]*sanitizeImportedHtml/, "document HTML paste/drop sanitization is missing");
assert.match(documentEditor, /heading:\s*\{\s*levels:\s*\[1, 2, 3, 4, 5, 6\]/, "imported heading nodes must remain supported");
assert.doesNotMatch(editorToolbar, /toggleHeading|paragraphStyle/, "the editor toolbar must not expose heading presets");
assert.match(editorToolbar, /setFontSize/, "free point-size formatting is missing");
assert.match(editorToolbar, /unsetColor/, "the default text color action is missing");
assert.match(editorToolbar, /unsetHighlight/, "the no-highlight action is missing");
assert.match(editorToolbar, /aria-label/, "editor formatting controls must expose explicit labels");
assert.match(toolbarIcons, /<svg/, "editor controls must use explicit local SVG icons");
assert.match(toolbarIcons, /aria-hidden="true"/, "toolbar icons must defer their names to accessible labels");
assert.match(api, /editorListSystemFonts/, "the native system-font API is missing");
assert.match(api, /editorInspectFontEmbedding/, "the PDF font-permission API is missing");
assert.match(fontControl, /orderedFontCatalog/, "system fonts must be ordered as default, recent and alphabetical");
assert.match(fontControl, /VIEWPORT_HEIGHT/, "the installed-font list must be virtualized");
assert.match(fontBackend, /DirectWrite/, "Windows font enumeration must use DirectWrite");
assert.match(fontBackend, /CoreText/, "macOS font enumeration must use CoreText");
assert.match(fontBackend, /fc-list/, "Linux font enumeration must use Fontconfig");
assert.match(fontBackend, /OS\/2/, "PDF embedding must inspect the OpenType OS/2 table");
assert.match(pdfFontPolicy, /editorInspectFontEmbedding/, "PDF export must preflight font embedding permissions");
assert.match(documentEditor, /prepareDocumentForPdf/, "PDF save and export must apply the font preflight");
assert.doesNotMatch(app, /editor-fonts\.css/, "the app must not load bundled editor fonts");
assert.match(tableControls, /addColumnBefore/, "table column controls are missing");
assert.match(tableControls, /addRowAfter/, "table row controls are missing");
assert.match(tableControls, /mergeCells/, "table cell controls are missing");
assert.match(editorCss, /\.column-resize-handle/, "table resize handles are not styled");
assert.match(editorCss, /\.resize-cursor/, "table resize cursor feedback is missing");
assert.match(editorFocusMode, /event\.key !== "Escape"/, "focus mode must close with Escape");
assert.match(editorFocusMode, /focusButtonRef\.current\?\.focus/, "focus mode must restore focus to its trigger");
assert.match(documentCommandRow, /editor\.documents/, "the document back action needs a visible label");
assert.match(headerFooterDialog, /transformPastedHTML:[\s\S]*sanitizeImportedHtml/, "header/footer HTML paste/drop sanitization is missing");
assert.match(tauriConfig, /script-src 'self'/, "the Tauri script CSP must stay self-only");
assert.doesNotMatch(tauriConfig, /script-src[^;]*(?:'unsafe-inline'|'unsafe-eval')/, "the Tauri script CSP must not allow inline code or eval");

console.log("Editor source contracts passed.");
