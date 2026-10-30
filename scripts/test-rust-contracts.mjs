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
  "export_batch_report",
  "load_batch_recovery",
  "set_batch_recovery_enabled",
  "save_batch_recovery",
  "clear_batch_recovery",
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
  ["describe_paths", "async fn describe_paths(app:AppHandle,paths:Vec<String>)->CommandResult<ImportBatchResult>"],
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
  ["export_to_downloads", "fn export_to_downloads(file_paths:Vec<String>,output_dir:Option<String>,entries:Option<Vec<ExportEntryV1>>)->CommandResult<ExportResult>"],
  ["export_to_folder", "fn export_to_folder(file_paths:Vec<String>,destination_dir:String,output_dir:Option<String>,entries:Option<Vec<ExportEntryV1>>)->CommandResult<ExportResult>"],
  ["export_batch_report", "async fn export_batch_report(output_dir:String,destination_dir:String,rows:Vec<BatchReportRow>)->CommandResult<ExportResult>"],
  ["load_batch_recovery", "async fn load_batch_recovery(app:AppHandle)->CommandResult<RecoveryState>"],
  ["set_batch_recovery_enabled", "async fn set_batch_recovery_enabled(app:AppHandle,enabled:bool)->CommandResult<RecoveryState>"],
  ["save_batch_recovery", "async fn save_batch_recovery(app:AppHandle,plan:RecoveryPlan)->CommandResult<usize>"],
  ["clear_batch_recovery", "async fn clear_batch_recovery(app:AppHandle)->CommandResult<bool>"],
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
