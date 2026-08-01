import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const lockPath = path.join(root, "src-tauri", "ocr-runtime-lock.json");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const failures = [];

expect(lock.schemaVersion === 1, "ocr-runtime-lock schemaVersion doit valoir 1");
expect(lock.model === "PP-OCRv6_medium", "le modèle doit rester PP-OCRv6_medium");
expect(lock.versions?.paddlepaddle === "3.3.1", "PaddlePaddle doit être verrouillé sur 3.3.1");
expect(lock.versions?.paddleocr === "3.7.0", "PaddleOCR doit être verrouillé sur 3.7.0");
expect(lock.versions?.paddlex === "3.7.0", "PaddleX doit être verrouillé sur 3.7.0");
expect(lock.versions?.onnxruntime === "1.26.0", "ONNX Runtime doit être verrouillé sur 1.26.0");
expect(lock.models?.length === 5, "les cinq modules officiels medium doivent être déclarés");
expect(lock.modelArtifact?.fileCount === 21, "le contenu extrait des modèles doit être verrouillé");
expect(/^[a-f0-9]{64}$/.test(lock.modelArtifact?.aggregateSha256 ?? ""), "les modèles extraits doivent avoir une empreinte agrégée");
for (const model of lock.models ?? []) {
  expect(/^https:\/\/paddle-model-ecology\.bj\.bcebos\.com\//.test(model.url), `${model.id}: URL officielle requise`);
  expect(/^[a-f0-9]{64}$/.test(model.sha256), `${model.id}: SHA-256 vérifié requis`);
  expect(model.license === "Apache-2.0", `${model.id}: licence Apache-2.0 requise`);
}
expect(!fs.readFileSync(lockPath, "utf8").includes("PENDING"), "le manifeste OCR ne doit contenir aucun marqueur PENDING");

const windowsSelection = lock.platformSelections?.find((value) => value.platform === "windows-x64");
expect(windowsSelection?.runtime === "official", "Windows doit utiliser le runtime officiel tant que le candidat natif n’est pas validé");
expect(windowsSelection?.provider === "cpu", "DirectML ne doit pas être activé sans preuve de parité et de gain");
expect(/^[a-f0-9]{64}$/.test(windowsSelection?.artifact?.aggregateSha256 ?? ""), "le paquet Windows doit avoir une empreinte agrégée");
const licenseInventory = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "ocr-runtime-licenses.json"), "utf8"),
);
expect(licenseInventory.schemaVersion === 1, "l’inventaire des licences OCR doit utiliser le schéma 1");
expect(licenseInventory.platform === "windows-x64", "l’inventaire des licences OCR doit viser Windows x64");
expect(licenseInventory.runtimeFileCount === windowsSelection?.artifact?.fileCount, "l’inventaire OCR doit verrouiller chaque fichier du runtime");
expect(licenseInventory.runtimeTotalBytes === windowsSelection?.artifact?.totalBytes, "l’inventaire OCR doit verrouiller la taille du runtime");
expect(
  licenseInventory.runtimeAggregateSha256 === windowsSelection?.artifact?.aggregateSha256,
  "l’inventaire des licences OCR doit correspondre exactement au runtime verrouillé",
);
expect(licenseInventory.packageCount > 0, "l’inventaire des licences OCR doit contenir les distributions Python embarquées");
expect(
  JSON.stringify(licenseInventory.packagesWithoutLicenseFiles) === JSON.stringify(["bce-python-sdk"]),
  "la liste verrouillée des distributions OCR sans fichier de licence a changé",
);
expect(licenseInventory.unresolvedMetadata?.length === 0, "chaque distribution OCR doit déclarer sa licence dans ses métadonnées");
expect(licenseInventory.licenseFileCount >= licenseInventory.packagesWithLicenseFiles, "les fichiers de licence OCR doivent être inventoriés");
for (const dependency of licenseInventory.packages ?? []) {
  expect(Boolean(dependency.name && dependency.version), "chaque dépendance OCR doit avoir un nom et une version");
  expect(
    dependency.licenseFiles?.length > 0 || licenseInventory.packagesWithoutLicenseFiles.includes(dependency.name),
    `${dependency.name}: absence de fichier de licence non déclarée`,
  );
  for (const licenseFile of dependency.licenseFiles ?? []) {
    expect(/^[a-f0-9]{64}$/.test(licenseFile.sha256), `${dependency.name}: empreinte de licence invalide`);
  }
}
const stagedRuntimeRoot = path.join(root, "src-tauri", "ocr-resources", "runtime");
if (fs.existsSync(stagedRuntimeRoot)) {
  const stagedEntries = fs.readdirSync(stagedRuntimeRoot, { withFileTypes: true });
  expect(stagedEntries.length === 1, "le paquet préparé doit contenir exactement une archive OCR de plateforme");
  expect(stagedEntries[0]?.isFile() && stagedEntries[0]?.name === "windows-x64.zip", "le runtime Windows doit être empaqueté dans windows-x64.zip");
}
const stagedModelsPath = path.join(root, "src-tauri", "ocr-resources", "models", "models-lock.json");
if (fs.existsSync(stagedModelsPath)) {
  const staged = JSON.parse(fs.readFileSync(stagedModelsPath, "utf8"));
  expect(staged.fileCount === lock.modelArtifact.fileCount, "modèles OCR: nombre de fichiers différent du verrou");
  expect(staged.totalBytes === lock.modelArtifact.totalBytes, "modèles OCR: taille différente du verrou");
  expect(staged.aggregateSha256 === lock.modelArtifact.aggregateSha256, "modèles OCR: empreinte différente du verrou");
}

const worker = fs.readFileSync(path.join(root, "tools", "ocr-runtime", "worker.py"), "utf8");
for (const marker of [
  'HF_HUB_OFFLINE", "1',
  'PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "true',
  'device="cpu"',
  'doc_orientation_classify_model_dir=',
  'doc_unwarping_model_dir=',
  'textline_orientation_model_dir=',
  'text_detection_model_dir=',
  'text_recognition_model_dir=',
]) expect(worker.includes(marker), `worker OCR: contrat manquant ${marker}`);

const capabilities = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "capabilities", "default.json"), "utf8"));
const clipboardPermissions = capabilities.permissions.filter((value) => value.startsWith("clipboard-manager:"));
expect(JSON.stringify(clipboardPermissions) === JSON.stringify(["clipboard-manager:allow-write-text"]), "le presse-papiers OCR doit autoriser uniquement write-text");

for (const configName of ["tauri.conf.json", "tauri.macos.conf.json", "tauri.linux.conf.json"]) {
  const config = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", configName), "utf8"));
  expect(config.bundle?.resources?.["ocr-resources/"] === "ocr/", `${configName}: ressources OCR absentes`);
}

if (failures.length) {
  console.error("OCR contract validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`OCR contract validation passed: ${lock.models.length} locked models, offline worker, bounded clipboard permission.`);

function expect(condition, message) {
  if (!condition) failures.push(message);
}
