import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const lockPath = path.join(root, "src-tauri", "ocr-runtime-lock.json");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const failures = [];

expect(lock.schemaVersion === 2, "ocr-runtime-lock schemaVersion doit valoir 2");
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
const expectedPlatforms = ["windows-x64", "macos-aarch64", "macos-x86_64", "linux-x64"];
expect(
  JSON.stringify(lock.platformSelections?.map((entry) => entry.platform)) === JSON.stringify(expectedPlatforms),
  "les quatre runtimes OCR natifs doivent être déclarés explicitement",
);
for (const platform of expectedPlatforms) {
  const selection = lock.platformSelections.find((entry) => entry.platform === platform);
  expect(selection?.runtime === "official", `${platform}: runtime officiel requis`);
  expect(selection?.provider === "cpu" && selection?.fallbackProvider === "cpu", `${platform}: CPU officiel requis`);
  expect(!/onnx|coreml|openvino|directml/i.test(selection?.provider ?? ""), `${platform}: accélérateur non validé`);
  expect(lock.platformBuildEnvironments?.[platform]?.python === "3.12.10", `${platform}: Python 3.12.10 requis`);
}
expect(lock.platformBuildEnvironments?.["macos-x86_64"]?.paddleSource === "locked-source-build", "macOS Intel doit compiler PaddlePaddle depuis la source verrouillée");
const licenseInventory = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "ocr-runtime-licenses.json"), "utf8"),
);
const supplementalLicenses = JSON.parse(
  fs.readFileSync(path.join(root, "tools", "ocr-runtime", "supplemental-licenses.json"), "utf8"),
);
for (const supplemental of supplementalLicenses.packages ?? []) {
  const content = fs.readFileSync(path.join(root, supplemental.licenseFile), "utf8").replaceAll("\r\n", "\n");
  const actual = createHash("sha256").update(content).digest("hex");
  expect(actual === supplemental.licenseSha256, `${supplemental.name}: licence supplémentaire désynchronisée`);
}
expect(licenseInventory.schemaVersion === 2, "l’inventaire des licences OCR doit utiliser le schéma 2");
expect(licenseInventory.platform === "windows-x64", "l’inventaire des licences OCR doit viser Windows x64");
expect(licenseInventory.runtimeFileCount === windowsSelection?.artifact?.fileCount, "l’inventaire OCR doit verrouiller chaque fichier du runtime");
expect(licenseInventory.runtimeTotalBytes === windowsSelection?.artifact?.totalBytes, "l’inventaire OCR doit verrouiller la taille du runtime");
expect(
  licenseInventory.runtimeAggregateSha256 === windowsSelection?.artifact?.aggregateSha256,
  "l’inventaire des licences OCR doit correspondre exactement au runtime verrouillé",
);
expect(licenseInventory.packageCount > 0, "l’inventaire des licences OCR doit contenir les distributions Python embarquées");
expect(
  JSON.stringify(licenseInventory.packagesWithoutEmbeddedLicenseFiles) === JSON.stringify(["bce-python-sdk"]),
  "la liste verrouillée des distributions OCR sans licence intégrée a changé",
);
expect(licenseInventory.packagesWithoutLicenseFiles.length === 0, "chaque distribution OCR doit avoir une licence emballée");
expect(licenseInventory.unresolvedMetadata?.length === 0, "chaque distribution OCR doit déclarer sa licence dans ses métadonnées");
expect(licenseInventory.licenseFileCount >= licenseInventory.packagesWithLicenseFiles, "les fichiers de licence OCR doivent être inventoriés");
for (const dependency of licenseInventory.packages ?? []) {
  expect(Boolean(dependency.name && dependency.version), "chaque dépendance OCR doit avoir un nom et une version");
  expect(
    dependency.licenseFiles?.length > 0 || dependency.supplementalLicenseFiles?.length > 0,
    `${dependency.name}: absence de fichier de licence non déclarée`,
  );
  for (const licenseFile of [...(dependency.licenseFiles ?? []), ...(dependency.supplementalLicenseFiles ?? [])]) {
    expect(/^[a-f0-9]{64}$/.test(licenseFile.sha256), `${dependency.name}: empreinte de licence invalide`);
  }
}
const stagedRuntimeRoot = path.join(root, "src-tauri", "ocr-resources", "runtime");
if (fs.existsSync(stagedRuntimeRoot)) {
  const stagedEntries = fs.readdirSync(stagedRuntimeRoot, { withFileTypes: true });
  const names = stagedEntries.map((entry) => entry.name).sort();
  const allowedSets = [
    ["windows-x64.zip"],
    ["linux-x64.zip"],
    ["macos-aarch64.zip", "macos-x86_64.zip"],
  ];
  expect(stagedEntries.every((entry) => entry.isFile()), "les runtimes préparés doivent être des archives régulières");
  expect(allowedSets.some((set) => JSON.stringify(set) === JSON.stringify(names)), "le paquet ne doit contenir que le ou les runtimes de sa plateforme");
}
const stagedModelsPath = path.join(root, "src-tauri", "ocr-resources", "models", "models-lock.json");
if (fs.existsSync(stagedModelsPath)) {
  const staged = JSON.parse(fs.readFileSync(stagedModelsPath, "utf8"));
  expect(staged.fileCount === lock.modelArtifact.fileCount, "modèles OCR: nombre de fichiers différent du verrou");
  expect(staged.totalBytes === lock.modelArtifact.totalBytes, "modèles OCR: taille différente du verrou");
  expect(staged.aggregateSha256 === lock.modelArtifact.aggregateSha256, "modèles OCR: empreinte différente du verrou");
}

const worker = fs.readFileSync(path.join(root, "tools", "ocr-runtime", "worker.py"), "utf8");
const supervisor = fs.readFileSync(path.join(root, "src-tauri", "src", "ocr", "supervisor.rs"), "utf8");
const runtimeSmoke = fs.readFileSync(path.join(root, "scripts", "test-ocr-runtime.mjs"), "utf8");
expect(supervisor.includes('command.env("LD_LIBRARY_PATH", library_dir)'), "Linux doit résoudre les bibliothèques Paddle embarquées");
expect(supervisor.includes('command.env("DYLD_LIBRARY_PATH", library_dir)'), "macOS doit résoudre les bibliothèques Paddle embarquées");
expect(runtimeSmoke.includes("runtimeLibraryEnvironment(workerPath)"), "le smoke doit reproduire l’environnement du superviseur OCR");
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
