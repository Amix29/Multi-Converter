import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { extractOcrRuntimeArchive, hostOcrPlatform, ocrRuntimeArchivePath } from "./lib/ocr-runtime-archive.mjs";

const root = process.cwd();
const platform = hostOcrPlatform();
const runtimeArchive = ocrRuntimeArchivePath(root, platform);
const directExecutable = process.env.MULTI_CONVERTER_OCR_CORPUS_EXECUTABLE
  ? path.resolve(process.env.MULTI_CONVERTER_OCR_CORPUS_EXECUTABLE)
  : null;
const models = path.join(root, "src-tauri", "ocr-resources", "models");
const manifestPath = path.join(root, "tests", "fixtures", "ocr", "corpus-manifest.json");
const requestedIds = new Set((process.env.MULTI_CONVERTER_OCR_CORPUS_CASES ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const partial = requestedIds.size > 0;
const reportPath = path.join(root, "test-results", "phase-6", partial ? "ocr-corpus-partial.json" : "ocr-corpus.json");

if (directExecutable) await assertFile(directExecutable, "exécutable OCR direct");
else await assertFile(runtimeArchive, "archive du runtime OCR préparé");
await assertDirectory(models, "modèles OCR préparés");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
await validateManifest(manifest);
const selectedCases = partial ? manifest.cases.filter(({ id }) => requestedIds.has(id)) : manifest.cases;
if (partial && selectedCases.length !== requestedIds.size) throw new Error("Un identifiant demandé est absent du manifeste OCR.");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "multi-converter-ocr-corpus-"));
let worker;
try {
  const extractionStarted = performance.now();
  const executable = directExecutable
    ?? await extractOcrRuntimeArchive(runtimeArchive, path.join(temporary, "runtime"), platform);
  const extractionMs = Math.round(performance.now() - extractionStarted);
  worker = await startWorker(executable, models);
  const results = [];
  const failures = [];
  const recognitionCache = new Map();
  for (const fixture of selectedCases.filter(({ kind }) => kind === "ocr-image")) {
    const result = await recognizeFixture(worker, fixture, temporary, recognitionCache);
    results.push(result);
    validateAccuracy(fixture, result, failures);
    logResult(result);
  }
  const pdfium = await pdfiumExecutable();
  for (const fixture of selectedCases.filter(({ kind }) => kind === "pdf-hybrid")) {
    const result = await recognizePdfFixture(worker, pdfium, fixture, temporary);
    results.push(result);
    validateAccuracy(fixture, result, failures);
    logResult(result);
  }
  if (selectedCases.some(({ kind }) => kind === "rust-normalization")) runRustNormalizationTest();
  for (const fixture of selectedCases.filter(({ kind }) => kind === "rust-normalization")) {
    results.push({ id: fixture.id, kind: fixture.kind, accuracy: 1, elapsedMs: 0, actual: fixture.expected });
  }
  const clean = results.filter(({ id }) => id.startsWith("clean-"));
  const difficult = results.filter(({ kind, id }) => kind === "ocr-image" && !id.startsWith("clean-") && id !== "blank");
  const measured = results.filter(({ elapsedMs }) => elapsedMs > 0);
  const report = {
    schemaVersion: 1,
    platform,
    runtimeArchiveSha256: directExecutable ? null : await sha256(runtimeArchive),
    directExecutable: directExecutable ? path.relative(root, directExecutable).replaceAll("\\", "/") : null,
    runtimeExtractionMs: extractionMs,
    runtimeInitializationMs: worker.initializationMs,
    peakWorkerWorkingSetBytes: Math.max(0, ...results.map(({ workerWorkingSetBytes }) => workerWorkingSetBytes ?? 0)),
    medianRecognitionMs: median(measured.map(({ elapsedMs }) => elapsedMs)),
    cleanMean: mean(clean.map(({ accuracy }) => accuracy)),
    difficultMean: mean(difficult.map(({ accuracy }) => accuracy)),
    networkSamples: worker.network.samples,
    observedWorkerConnections: worker.network.connections,
    results,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (worker.network.connections.length) {
    failures.push(`le worker OCR a créé ${worker.network.connections.length} connexion(s) distante(s)`);
  }
  if (failures.length) throw new Error(`Corpus OCR insuffisant:\n- ${failures.join("\n- ")}`);
  console.log(
    `OCR ${partial ? "corpus probe" : "corpus"} passed: ${selectedCases.length} cases, clean mean ${(report.cleanMean * 100).toFixed(2)} %, difficult mean ${(report.difficultMean * 100).toFixed(2)} %, median ${report.medianRecognitionMs} ms, peak ${formatBytes(report.peakWorkerWorkingSetBytes)} (${platform}, CPU).`,
  );
  console.log(`OCR worker network observation: ${worker.network.samples} samples, 0 remote connections.`);
  for (const result of results) {
    if (result.kind === "rust-normalization") logResult(result);
  }
} finally {
  await worker?.close();
  await fs.rm(temporary, { recursive: true, force: true });
}

async function validateManifest(manifest) {
  const failures = [];
  if (manifest.schemaVersion !== 1) failures.push("schemaVersion doit valoir 1");
  if (manifest.cases?.length < 40) failures.push("au moins 40 cas sont requis");
  const counts = countBy(manifest.cases ?? [], ({ category }) => category);
  if (counts.clean !== 21) failures.push("21 documents propres sont requis");
  if ((counts.difficult ?? 0) < 9) failures.push("au moins 9 cas difficiles sont requis");
  if (counts["image-format"] !== 5) failures.push("les cinq formats image sont requis");
  if (counts.pdf !== 3) failures.push("les PDF natif, scanné et mixte sont requis");
  const cleanLanguages = countBy(manifest.cases.filter(({ category }) => category === "clean"), ({ language }) => language);
  for (const language of ["fr", "en", "es", "de", "it", "pt", "ja"]) {
    if (cleanLanguages[language] !== 3) failures.push(`trois documents propres ${language} sont requis`);
  }
  const fixtureRoot = `${path.resolve(root, "tests", "fixtures", "ocr")}${path.sep}`.toLowerCase();
  for (const fixture of manifest.cases ?? []) {
    if (!fixture.id || !fixture.input || fixture.expected === undefined || !fixture.language || fixture.threshold === undefined) {
      failures.push(`${fixture.id ?? "cas inconnu"}: contrat incomplet`);
      continue;
    }
    if (!fixture.provenance || !fixture.license) failures.push(`${fixture.id}: provenance ou licence absente`);
    const input = path.resolve(root, fixture.input);
    if (!input.toLowerCase().startsWith(fixtureRoot)) failures.push(`${fixture.id}: entrée hors du corpus`);
    else if (await sha256(input) !== fixture.sha256) failures.push(`${fixture.id}: SHA-256 inattendu`);
  }
  if (failures.length) throw new Error(`Manifeste OCR invalide:\n- ${failures.join("\n- ")}`);
}

async function recognizeFixture(workerInstance, fixture, temporaryRoot, cache) {
  let recognized = cache.get(fixture.input);
  const cacheHit = Boolean(recognized);
  if (!recognized) {
    const output = path.join(temporaryRoot, `${fixture.id}.json`);
    const started = performance.now();
    await workerInstance.recognize(fixture.id, path.resolve(root, fixture.input), output);
    recognized = {
      payload: JSON.parse(await fs.readFile(output, "utf8")),
      elapsedMs: Math.round(performance.now() - started),
      workerWorkingSetBytes: await workingSet(workerInstance.pid),
    };
    cache.set(fixture.input, recognized);
  }
  const blocks = recognized.payload.pages?.[0]?.blocks ?? [];
  const actual = fixture.blockIndex === undefined
    ? recognized.payload.text ?? ""
    : blocks[fixture.blockIndex]?.text ?? "";
  return scoredResult(fixture, actual, cacheHit ? 0 : recognized.elapsedMs, recognized.workerWorkingSetBytes);
}

async function recognizePdfFixture(workerInstance, pdfium, fixture, temporaryRoot) {
  const input = path.resolve(root, fixture.input);
  const inspectionPath = path.join(temporaryRoot, `${fixture.id}-inspection.json`);
  run(pdfium, ["--inspect-text", input, inspectionPath], "inspection PDFium");
  const inspection = JSON.parse(await fs.readFile(inspectionPath, "utf8"));
  const actualSources = inspection.pages.map(({ usable }) => usable ? "native" : "ocr");
  if (JSON.stringify(actualSources) !== JSON.stringify(fixture.expectedSources)) {
    throw new Error(`${fixture.id}: sources ${JSON.stringify(actualSources)} au lieu de ${JSON.stringify(fixture.expectedSources)}`);
  }
  const pages = [];
  const started = performance.now();
  for (const page of inspection.pages) {
    if (page.usable) {
      pages.push(page.text);
      continue;
    }
    const rendered = path.join(temporaryRoot, `${fixture.id}-page-${page.pageNumber}.png`);
    const cropped = path.join(temporaryRoot, `${fixture.id}-page-${page.pageNumber}-cropped.png`);
    const output = path.join(temporaryRoot, `${fixture.id}-page-${page.pageNumber}.json`);
    run(pdfium, ["--render", input, rendered, "--page", String(page.pageNumber), "--format", "png", "--dpi", "300"], "rendu PDFium");
    cropLightPageBorder(rendered, cropped);
    await workerInstance.recognize(`${fixture.id}-${page.pageNumber}`, cropped, output);
    pages.push(JSON.parse(await fs.readFile(output, "utf8")).text ?? "");
  }
  return scoredResult(fixture, pages.join(" "), Math.round(performance.now() - started), await workingSet(workerInstance.pid));
}

function validateAccuracy(fixture, result, failures) {
  if (fixture.id === "blank" && result.actual !== "") failures.push(`blank: résultat non vide « ${result.actual} »`);
  if (result.accuracy < fixture.threshold) failures.push(
    `${fixture.id}: précision ${(result.accuracy * 100).toFixed(2)} % < ${(fixture.threshold * 100).toFixed(0)} %, résultat « ${result.actual} »`,
  );
}

function scoredResult(fixture, rawActual, elapsedMs, workerWorkingSetBytes) {
  const actual = normalize(rawActual);
  const expected = normalize(fixture.expected);
  const accuracy = expected ? 1 - levenshtein(actual, expected) / Math.max(1, Array.from(expected).length) : Number(actual === "");
  return { id: fixture.id, kind: fixture.kind, accuracy, elapsedMs, workerWorkingSetBytes, actual };
}

async function startWorker(workerPath, modelsPath) {
  const started = performance.now();
  const child = spawn(workerPath, ["--serve", "--models", modelsPath, "--provider", "cpu"], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, HF_HUB_OFFLINE: "1", PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "true", NO_PROXY: "*" },
  });
  const network = monitorNetwork(child.pid);
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
  const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const ready = await nextMessage(lines, 30_000);
  if (ready.type !== "ready") throw new Error(`Message initial OCR inattendu: ${JSON.stringify(ready)}`);
  return {
    pid: child.pid,
    initializationMs: Math.round(performance.now() - started),
    network,
    async recognize(jobId, input, output) {
      child.stdin.write(`${JSON.stringify({ schemaVersion: 1, jobId, input, output })}\n`);
      const message = await nextMessage(lines, 180_000);
      if (message.type === "failed") throw new Error(`${jobId}: ${message.message}`);
      if (message.type !== "completed" || message.jobId !== jobId) throw new Error(`${jobId}: réponse OCR inattendue ${JSON.stringify(message)}`);
    },
    async close() {
      network.stop();
      if (child.exitCode !== null) return;
      child.stdin.end();
      const [code] = await once(child, "exit");
      if (code !== 0) throw new Error(`Le runtime OCR s’est arrêté (${code}): ${stderr}`);
    },
  };
}

function monitorNetwork(pid) {
  const state = { samples: 0, connections: [], stopped: false };
  const sample = () => {
    if (state.stopped) return;
    if (process.platform !== "win32" && process.env.MC_OCR_OBSERVE_NETWORK !== "1") return;
    const command = process.platform === "win32" ? "netstat" : "lsof";
    const args = process.platform === "win32"
      ? ["-ano", "-p", "tcp"] : ["-nP", "-a", "-p", String(pid), "-iTCP", "-iUDP"];
    const probe = spawn(command, args, { windowsHide: true });
    let stdout = "";
    probe.stdout.on("data", (chunk) => { stdout += chunk; });
    probe.on("close", () => {
      state.samples += 1;
      if (process.platform !== "win32") {
        for (const line of stdout.split(/\r?\n/).slice(1).filter(Boolean)) state.connections.push({ sample: state.samples, foreign: line.trim() });
        return;
      }
      for (const line of stdout.split(/\r?\n/)) {
        const fields = line.trim().split(/\s+/);
        if (fields.at(-1) !== String(pid) || fields[3] !== "ESTABLISHED") continue;
        const foreign = fields[2] ?? "";
        if (!/^(127\.0\.0\.1|\[?::1\]?):/.test(foreign)) state.connections.push({ sample: state.samples, foreign });
      }
    });
  };
  sample();
  const timer = setInterval(sample, 1_000);
  timer.unref?.();
  state.stop = () => { state.stopped = true; clearInterval(timer); };
  return state;
}

async function nextMessage(lines, timeoutMs) {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => reject(new Error(`Aucun message OCR reçu en ${timeoutMs} ms.`)), timeoutMs);
    id.unref?.();
  });
  const result = await Promise.race([lines.next(), timeout]);
  if (result.done) throw new Error("Le flux du runtime OCR s’est fermé prématurément.");
  return JSON.parse(result.value);
}

async function pdfiumExecutable() {
  const name = process.platform === "win32" ? "pdfium-render-x86_64-pc-windows-msvc.exe" : "pdfium-render";
  const candidate = process.env.MULTI_CONVERTER_TEST_PDFIUM_RENDER
    ?? path.join(root, "src-tauri", "bundled-engines", "pdfium", "compatible", "bin", name);
  await assertFile(candidate, "exécutable PDFium préparé");
  return candidate;
}

function run(executable, args, label) {
  const result = spawnSync(executable, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`${label} en échec (${result.status ?? "sans code"}).`);
}

function runRustNormalizationTest() {
  const result = spawnSync("node", ["scripts/cargo-test-temp.mjs", "test", "--manifest-path", "src-tauri/Cargo.toml", "ocr::validation::tests::phase_6_manifest_image_formats_are_normalized_without_touching_sources", "--", "--exact"], {
    cwd: root, stdio: "inherit", windowsHide: true,
  });
  if (result.status !== 0) throw new Error("La normalisation Rust des cinq formats a échoué.");
}

function cropLightPageBorder(input, output) {
  const ffmpeg = bundledSidecar("ffmpeg");
  const ffprobe = bundledSidecar("ffprobe");
  const dimensionsProbe = spawnSync(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", input], {
    cwd: root, encoding: "utf8", windowsHide: true,
  });
  if (dimensionsProbe.status !== 0) throw new Error("Dimensions de la page PDF illisibles.");
  const stream = JSON.parse(dimensionsProbe.stdout).streams?.[0];
  const detection = spawnSync(ffmpeg, ["-hide_banner", "-i", input, "-vf", "negate,bbox=min_val=20", "-frames:v", "1", "-f", "null", "-"], {
    cwd: root, encoding: "utf8", windowsHide: true,
  });
  const bounds = detection.stderr.match(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+) w:(\d+) h:(\d+)/);
  if (!bounds || !stream?.width || !stream?.height) throw new Error("Bord clair de la page PDF introuvable.");
  const [, xText, , yText, , widthText, heightText] = bounds;
  const [width, height, x, y] = [widthText, heightText, xText, yText].map(Number);
  const margin = Math.max(24, height * 2);
  const left = Math.max(0, x - margin);
  const top = Math.max(0, y - margin);
  const right = Math.min(stream.width, x + width + margin);
  const bottom = Math.min(stream.height, y + height + margin);
  run(ffmpeg, ["-y", "-loglevel", "error", "-i", input, "-vf", `crop=${right - left}:${bottom - top}:${left}:${top}`, "-frames:v", "1", output], "recadrage PDF OCR");
}

function bundledSidecar(name) {
  const suffix = process.platform === "win32" ? "-x86_64-pc-windows-msvc.exe" : "";
  return path.join(root, "src-tauri", "binaries", `${name}${suffix}`);
}

async function workingSet(pid) {
  if (process.platform !== "win32") return null;
  const probe = spawnSync("powershell", ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet64`], { encoding: "utf8", windowsHide: true });
  const value = Number(probe.stdout.trim());
  return Number.isFinite(value) ? value : null;
}

function normalize(value) {
  return value.normalize("NFC").toLocaleLowerCase("und").replace(/\s+/gu, " ").trim();
}

function levenshtein(left, right) {
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  let previous = Array.from({ length: rightChars.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= leftChars.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= rightChars.length; rightIndex += 1) {
      current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + Number(leftChars[leftIndex - 1] !== rightChars[rightIndex - 1]));
    }
    previous = current;
  }
  return previous[rightChars.length];
}

function countBy(values, selector) {
  return values.reduce((counts, value) => ({ ...counts, [selector(value)]: (counts[selector(value)] ?? 0) + 1 }), {});
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function logResult(result) {
  console.log(`- ${result.id}: ${(result.accuracy * 100).toFixed(2)} %, ${result.elapsedMs} ms`);
}

async function sha256(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(`${label} absent: ${filePath}`);
}

async function assertDirectory(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`${label} absent: ${filePath}`);
}
