import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const lockPath = path.join(root, "tools", "platform-runtime-provenance-lock.json");
const source = fs.readFileSync(lockPath, "utf8");
const lock = JSON.parse(source);
const failures = [];

expect(lock.schemaVersion === 1, "le verrou de provenance doit utiliser le schéma 1");
expect(!/releases\/latest|latest\/download/i.test(source), "aucune provenance ne doit suivre latest");
expect(lock.pdfium?.version === "149.0.7825.0", "PDFium doit rester verrouillé sur 149.0.7825.0");
expect(lock.pdfium?.tag === "chromium/7825", "le tag PDFium doit être chromium/7825");
expect(lock.pdfium?.wrapperVersion === "0.3.0", "le wrapper PDFium doit rester en 0.3.0");
for (const platform of ["macos-universal", "linux-x64"]) {
  const entry = lock.pdfium.platforms?.[platform];
  expect(entry?.url?.startsWith("https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/7825/"), `${platform}: URL PDFium verrouillée absente`);
  expect(Number.isInteger(entry?.bytes) && entry.bytes > 0, `${platform}: taille PDFium absente`);
  expect(isSha(entry?.sha256), `${platform}: SHA-256 de l’archive PDFium invalide`);
  expect(isSha(entry?.librarySha256), `${platform}: SHA-256 de la bibliothèque PDFium invalide`);
}

expect(lock.ocr?.python === "3.12.10", "Python OCR doit rester verrouillé sur 3.12.10");
expect(lock.ocr?.uv === "0.11.21", "uv doit rester verrouillé sur 0.11.21");
expect(lock.ocr?.paddlepaddle?.version === "3.3.1", "PaddlePaddle doit rester verrouillé sur 3.3.1");
expect(isSha(lock.ocr?.paddlepaddle?.source?.sha256), "le source PaddlePaddle doit avoir une empreinte");
expect(lock.ocr?.paddlepaddle?.source?.repository === "https://github.com/PaddlePaddle/Paddle.git", "le dépôt officiel PaddlePaddle doit être verrouillé");
expect(/^[a-f0-9]{40}$/.test(lock.ocr?.paddlepaddle?.source?.commit ?? ""), "le commit PaddlePaddle doit être verrouillé");
const pocketfft = lock.ocr?.paddlepaddle?.source?.compatibilityRefs?.pocketfft;
expect(pocketfft?.path === "third_party/pocketfft", "le chemin PocketFFT de compatibilité doit être verrouillé");
expect(pocketfft?.url === "https://gitlab.mpcdf.mpg.de/mtr/pocketfft.git", "le dépôt PocketFFT officiel doit être verrouillé");
expect(pocketfft?.ref === "refs/tags/release_for_eigen", "la référence PocketFFT requise par Paddle doit être verrouillée");
expect(pocketfft?.objectSha === "b387dbecbab7a64ce2eb10c119e506af3c754c13", "l’objet du tag PocketFFT doit être verrouillé");
expect(pocketfft?.commit === "ea778e37710c07723435b1be58235996d1d43a5a", "le commit PocketFFT pointé doit être verrouillé");
for (const platform of ["macos-aarch64", "linux-x64"]) {
  const wheel = lock.ocr?.paddlepaddle?.platforms?.[platform];
  expect(wheel?.url?.startsWith("https://files.pythonhosted.org/"), `${platform}: wheel officiel absent`);
  expect(isSha(wheel?.sha256), `${platform}: SHA-256 du wheel invalide`);
}
expect(lock.ocr?.paddlepaddle?.platforms?.["macos-x86_64"]?.kind === "source", "macOS Intel doit imposer la compilation source");

for (const [name, baseline] of Object.entries(lock.v106Baselines ?? {})) {
  expect(Number.isInteger(baseline.runId) && baseline.runId > 0, `${name}: run ID absent`);
  expect(/^[a-f0-9]{40}$/.test(baseline.headSha ?? ""), `${name}: commit source absent`);
  expect(isSha(baseline.sha256), `${name}: digest d’artefact invalide`);
}

if (failures.length) {
  console.error("Platform runtime provenance validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Platform runtime provenance validation passed: fixed PDFium and PaddlePaddle sources, architectures and baseline artifacts.");

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function isSha(value) {
  return /^[a-f0-9]{64}$/.test(value ?? "");
}
