import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { extractOcrRuntimeArchive, ocrRuntimeArchivePath } from "./lib/ocr-runtime-archive.mjs";

const root = process.cwd();
const platform = process.platform === "win32"
  ? "windows-x64"
  : process.platform === "darwin"
    ? "macos-universal"
    : "linux-x64";
const runtimeArchive = ocrRuntimeArchivePath(root, platform);
const models = path.join(root, "src-tauri", "ocr-resources", "models");
await assertFile(runtimeArchive, "archive du runtime OCR préparé");
await assertDirectory(models, "modèles OCR préparés");

const cases = [
  clean("fr", "Multi-Converter OCR local 2026 - façade déjà été"),
  clean("en", "Local document conversion keeps every file private"),
  clean("es", "Conversión local rápida y privada para documentos"),
  clean("de", "Lokale Dokumentkonvertierung bleibt vollständig privat"),
  clean("it", "Conversione locale rapida e privata dei documenti"),
  clean("pt", "Conversão local rápida e privada para documentos"),
  clean("ja", "ローカル文書変換は安全で高品質です", "ja"),
  difficult("rotation", "Texte français incliné mais toujours lisible", "rotate(5deg)", "#111", "#fff", 0.95),
  difficult("low-contrast", "Faible contraste mais reconnaissance locale", "none", "#999", "#f3f3f3", 0.95),
  difficult("perspective", "Photo en perspective pour OCR local", "perspective(900px) rotateY(22deg) rotateX(8deg)", "#111", "#fff", 0.9),
  { id: "blank", expected: "", threshold: 1, blank: true },
];

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "multi-converter-ocr-corpus-"));
const browser = await chromium.launch({ headless: true });
let worker;
try {
  const executable = await extractOcrRuntimeArchive(runtimeArchive, path.join(temporary, "runtime"), platform);
  for (const fixture of cases) {
    fixture.input = path.join(temporary, `${fixture.id}.png`);
    fixture.output = path.join(temporary, `${fixture.id}.json`);
    await renderFixture(browser, fixture);
  }
  worker = await startWorker(executable, models);
  const results = [];
  const failures = [];
  for (const fixture of cases) {
    const started = performance.now();
    await worker.recognize(fixture.id, fixture.input, fixture.output);
    const result = JSON.parse(await fs.readFile(fixture.output, "utf8"));
    const actual = normalize(result.text ?? "");
    const expected = normalize(fixture.expected);
    const accuracy = expected
      ? 1 - levenshtein(actual, expected) / Math.max(1, Array.from(expected).length)
      : Number(actual === "");
    const elapsedMs = Math.round(performance.now() - started);
    results.push({ id: fixture.id, accuracy, elapsedMs, actual });
    if (accuracy < fixture.threshold) failures.push(
      `${fixture.id}: précision ${(accuracy * 100).toFixed(2)} % < ${(fixture.threshold * 100).toFixed(0)} %, résultat « ${actual} »`,
    );
  }
  const cleanResults = results.filter((result) => result.id.startsWith("clean-"));
  const difficultResults = results.filter((result) => !result.id.startsWith("clean-") && result.id !== "blank");
  const cleanMean = mean(cleanResults.map((result) => result.accuracy));
  const difficultMean = mean(difficultResults.map((result) => result.accuracy));
  const medianMs = median(results.filter((result) => result.id !== "blank").map((result) => result.elapsedMs));
  if (cleanMean < 0.98) failures.push(`moyenne propre ${(cleanMean * 100).toFixed(2)} % < 98 %`);
  console.log(
    `OCR corpus passed: ${cases.length} fixtures, clean mean ${(cleanMean * 100).toFixed(2)} %, difficult mean ${(difficultMean * 100).toFixed(2)} %, median ${medianMs} ms (${platform}, CPU).`,
  );
  for (const result of results) {
    console.log(`- ${result.id}: ${(result.accuracy * 100).toFixed(2)} %, ${result.elapsedMs} ms`);
  }
  if (failures.length) throw new Error(`Corpus OCR insuffisant:\n- ${failures.join("\n- ")}`);
} finally {
  await worker?.close();
  await browser.close();
  await fs.rm(temporary, { recursive: true, force: true });
}

function clean(language, expected, font = "latin") {
  return { id: `clean-${language}`, expected, threshold: 0.9, font };
}

function difficult(id, expected, transform, color, background, threshold) {
  return { id, expected, transform, color, background, threshold };
}

async function renderFixture(browserInstance, fixture) {
  const page = await browserInstance.newPage({ viewport: { width: 2400, height: 560 } });
  try {
    await page.route("**/*", (route) => route.abort());
    const family = fixture.font === "ja"
      ? "'Yu Gothic UI','Yu Gothic','Meiryo',sans-serif"
      : "Arial,sans-serif";
    const content = fixture.blank ? "" : `<div>${escapeHtml(fixture.expected)}</div>`;
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:${fixture.background ?? "#fff"}}body{display:grid;place-items:center;overflow:hidden;color:${fixture.color ?? "#111"};font:64px ${family}}div{white-space:nowrap;transform:${fixture.transform ?? "none"};transform-origin:center}</style>${content}`,
    );
    await page.screenshot({ path: fixture.input, animations: "disabled" });
  } finally {
    await page.close();
  }
}

async function startWorker(workerPath, modelsPath) {
  const child = spawn(workerPath, ["--serve", "--models", modelsPath, "--provider", "cpu"], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      HF_HUB_OFFLINE: "1",
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "true",
      NO_PROXY: "*",
    },
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });
  const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const ready = await nextMessage(lines, 30_000);
  if (ready.type !== "ready") throw new Error(`Message initial OCR inattendu: ${JSON.stringify(ready)}`);
  return {
    async recognize(jobId, input, output) {
      child.stdin.write(`${JSON.stringify({ schemaVersion: 1, jobId, input, output })}\n`);
      const message = await nextMessage(lines, 180_000);
      if (message.type === "failed") throw new Error(`${jobId}: ${message.message}`);
      if (message.type !== "completed" || message.jobId !== jobId) {
        throw new Error(`${jobId}: réponse OCR inattendue ${JSON.stringify(message)}`);
      }
    },
    async close() {
      if (child.exitCode !== null) return;
      child.stdin.end();
      const [code] = await once(child, "exit");
      if (code !== 0) throw new Error(`Le runtime OCR s’est arrêté (${code}): ${stderr}`);
    },
  };
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

function normalize(value) {
  return value.normalize("NFC").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
}

function levenshtein(left, right) {
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  let previous = Array.from({ length: rightChars.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= leftChars.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= rightChars.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + Number(leftChars[leftIndex - 1] !== rightChars[rightIndex - 1]),
      );
    }
    previous = current;
  }
  return previous[rightChars.length];
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(`${label} absent: ${filePath}`);
}

async function assertDirectory(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`${label} absent: ${filePath}`);
}
