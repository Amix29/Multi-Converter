import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const libSource = fs.readFileSync(path.join(root, "src-tauri", "src", "lib.rs"), "utf8");
const handler = libSource.match(/generate_handler!\s*\[([\s\S]*?)\]/u);
assert.ok(handler, "Tauri invoke handler is missing");

const commands = handler[1]
  .split(",")
  .map((command) => command.trim())
  .filter(Boolean);

assert.deepEqual(commands, [
  "welcome_state",
  "mark_welcome_seen",
  "pick_file_paths",
  "describe_paths",
  "save_clipboard_files",
  "pick_output_folder",
  "create_temp_output_folder",
  "cleanup_temp_output_folder",
  "bootstrap_dependencies",
  "engine_statuses",
  "start_conversion",
  "cancel_conversion",
  "ocr::get_ocr_runtime_info",
  "ocr::recognize_image",
  "ocr::cancel_ocr",
  "reveal_file",
  "open_external_url",
  "export_to_downloads",
  "export_to_folder",
  "editor::editor_create_document",
  "editor::editor_list_recent_documents",
  "editor::editor_load_document",
  "editor::editor_save_draft",
  "editor::editor_delete_draft",
  "editor::editor_rename_document",
  "editor::editor_duplicate_document",
  "editor::editor_import_document",
  "editor::editor_save_document",
  "editor::editor_save_as",
  "editor::editor_export_document",
  "editor::editor_read_asset",
  "editor::editor_store_asset",
  "editor::editor_import_asset",
  "editor::editor_remove_asset",
  "editor::editor_prune_assets",
]);

function rustFilesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return rustFilesUnder(entryPath);
    return entry.isFile() && entry.name.endsWith(".rs") ? [entryPath] : [];
  });
}

function normalizeSignature(value) {
  return value
    .replace(/\s+/gu, " ")
    .replace(/\s*([,:()<>])\s*/gu, "$1")
    .replace(/,\)/gu, ")")
    .trim();
}

function commandSignatures(source) {
  const signatures = [];
  let cursor = 0;
  while ((cursor = source.indexOf("#[tauri::command]", cursor)) >= 0) {
    const declarationStart = cursor + "#[tauri::command]".length;
    const declaration = source.slice(declarationStart);
    const functionMatch = declaration.match(/\b(async\s+)?fn\s+(\w+)\s*\(/u);
    assert.ok(functionMatch, "Tauri command declaration has an unsupported shape");
    const openParen = declarationStart + functionMatch.index + functionMatch[0].lastIndexOf("(");

    let depth = 0;
    let closeParen = openParen;
    for (; closeParen < source.length; closeParen += 1) {
      if (source[closeParen] === "(") depth += 1;
      if (source[closeParen] === ")" && (depth -= 1) === 0) {
        closeParen += 1;
        break;
      }
    }
    const bodyStart = source.indexOf("{", closeParen);
    assert.ok(bodyStart >= 0, `Tauri command ${functionMatch[2]} has no body`);
    const signature = `${functionMatch[1] ?? ""}fn ${functionMatch[2]}${source.slice(openParen, bodyStart)}`;
    signatures.push([functionMatch[2], normalizeSignature(signature)]);
    cursor = bodyStart + 1;
  }
  return signatures;
}

function duplicateCommandNames(entries) {
  const counts = new Map();
  for (const [name] of entries) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();
}

assert.deepEqual(
  duplicateCommandNames([
    ["duplicate", "first"],
    ["duplicate", "second"],
  ]),
  ["duplicate"],
  "duplicate-command detection must remain active",
);

const actualSignatureEntries = rustFilesUnder(path.join(root, "src-tauri", "src")).flatMap(
  (filePath) => commandSignatures(fs.readFileSync(filePath, "utf8")),
);
assert.deepEqual(
  duplicateCommandNames(actualSignatureEntries),
  [],
  "Tauri command names must be unique before registration",
);
const actualSignatures = new Map(actualSignatureEntries);
const expectedSignatures = new Map([
  ["welcome_state", "fn welcome_state()->CommandResult<WelcomeState>"],
  ["mark_welcome_seen", "fn mark_welcome_seen()->CommandResult<bool>"],
  ["pick_file_paths", "async fn pick_file_paths()->CommandResult<Vec<String>>"],
  ["describe_paths", "async fn describe_paths(app:AppHandle,paths:Vec<String>)->CommandResult<Vec<FileDescription>>"],
  ["save_clipboard_files", "async fn save_clipboard_files(files:Vec<ClipboardFile>)->CommandResult<Vec<String>>"],
  ["pick_output_folder", "async fn pick_output_folder()->CommandResult<Option<String>>"],
  ["create_temp_output_folder", "fn create_temp_output_folder()->CommandResult<String>"],
  ["cleanup_temp_output_folder", "fn cleanup_temp_output_folder(folder:String)->CommandResult<bool>"],
  ["bootstrap_dependencies", "fn bootstrap_dependencies(app:AppHandle)->CommandResult<DependencyBootstrap>"],
  ["engine_statuses", "fn engine_statuses(app:AppHandle)->Vec<ToolStatus>"],
  ["start_conversion", "async fn start_conversion(app:AppHandle,job:ConversionJob)->CommandResult<ConversionResult>"],
  ["cancel_conversion", "fn cancel_conversion(job_id:String,ocr_state:tauri::State<'_,ocr::OcrState>)->CommandResult<bool>"],
  ["get_ocr_runtime_info", "fn get_ocr_runtime_info(app:AppHandle)->Result<OcrRuntimeInfoV1,String>"],
  ["recognize_image", "async fn recognize_image(app:AppHandle,state:State<'_,OcrState>,path:String,job_id:String)->Result<OcrDocumentResultV1,String>"],
  ["cancel_ocr", "fn cancel_ocr(state:State<'_,OcrState>,job_id:String)->bool"],
  ["reveal_file", "fn reveal_file(file_path:String)->CommandResult<bool>"],
  ["open_external_url", "fn open_external_url(url:String)->CommandResult<bool>"],
  ["export_to_downloads", "fn export_to_downloads(file_paths:Vec<String>,output_dir:Option<String>)->CommandResult<ExportResult>"],
  ["export_to_folder", "fn export_to_folder(file_paths:Vec<String>,destination_dir:String,output_dir:Option<String>)->CommandResult<ExportResult>"],
  ["editor_create_document", "fn editor_create_document()->CommandResult<EditorDocument>"],
  ["editor_list_recent_documents", "fn editor_list_recent_documents()->CommandResult<Vec<EditorDocumentSummary>>"],
  ["editor_load_document", "fn editor_load_document(id:String)->CommandResult<EditorDocument>"],
  ["editor_save_draft", "fn editor_save_draft(document:EditorDocument)->CommandResult<EditorDocument>"],
  ["editor_delete_draft", "fn editor_delete_draft(id:String)->CommandResult<bool>"],
  ["editor_rename_document", "fn editor_rename_document(id:String,title:String)->CommandResult<EditorDocument>"],
  ["editor_duplicate_document", "fn editor_duplicate_document(id:String,title:String)->CommandResult<EditorDocument>"],
  ["editor_import_document", "async fn editor_import_document(app:AppHandle,path:Option<String>)->CommandResult<Option<EditorImportResult>>"],
  ["editor_save_document", "async fn editor_save_document(app:AppHandle,request:EditorWriteRequest)->CommandResult<EditorWriteResult>"],
  ["editor_save_as", "async fn editor_save_as(app:AppHandle,request:EditorWriteRequest)->CommandResult<Option<EditorWriteResult>>"],
  ["editor_export_document", "async fn editor_export_document(app:AppHandle,request:EditorWriteRequest)->CommandResult<Option<EditorWriteResult>>"],
  ["editor_read_asset", "fn editor_read_asset(document_id:String,asset_id:String)->CommandResult<EditorAssetData>"],
  ["editor_store_asset", "fn editor_store_asset(document_id:String,name:String,mime_type:String,bytes:Vec<u8>)->CommandResult<EditorAssetStoreResult>"],
  ["editor_import_asset", "async fn editor_import_asset(document_id:String,path:Option<String>)->CommandResult<Option<EditorAssetStoreResult>>"],
  ["editor_remove_asset", "fn editor_remove_asset(document_id:String,asset_id:String)->CommandResult<EditorDocument>"],
  ["editor_prune_assets", "fn editor_prune_assets(document_id:String)->CommandResult<EditorDocument>"],
]);

assert.deepEqual(
  [...actualSignatures].sort(([left], [right]) => left.localeCompare(right)),
  [...expectedSignatures].sort(([left], [right]) => left.localeCompare(right)),
  "Tauri command parameter or return contracts changed",
);
assert.deepEqual(
  commands.map((command) => command.split("::").at(-1)).sort(),
  [...actualSignatures.keys()].sort(),
  "Every Tauri command must be registered exactly once",
);

const conversionEvents = fs.readFileSync(path.join(root, "src-tauri", "src", "converters", "orchestrator.rs"), "utf8");
const ocrEvents = fs.readFileSync(path.join(root, "src-tauri", "src", "ocr", "supervisor.rs"), "utf8");
assert.match(conversionEvents, /app\.emit\s*\(\s*"convert-progress"\s*,\s*ProgressPayload/u);
assert.match(ocrEvents, /app\.emit\s*\(\s*"ocr-progress"\s*,\s*progress/u);

console.log(`Rust public contracts passed: ${commands.length} typed Tauri commands and 2 emitted events.`);
