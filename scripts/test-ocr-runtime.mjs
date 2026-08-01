import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { extractOcrRuntimeArchive, ocrRuntimeArchivePath } from "./lib/ocr-runtime-archive.mjs";

const root = process.cwd();
const platform = process.platform === "win32" ? "windows-x64" : process.platform === "darwin" ? "macos-universal" : "linux-x64";
const runtimeArchive = ocrRuntimeArchivePath(root, platform);
const models = path.join(root, "src-tauri", "ocr-resources", "models");
await assertFile(runtimeArchive, "archive du runtime OCR préparé");
await assertDirectory(models, "modèles OCR préparés");

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "multi-converter-ocr-smoke-"));
const input = path.join(temporary, "clean-french.png");
const output = path.join(temporary, "result.json");
const expected = "Multi-Converter OCR local 2026 - façade déjà été";
try {
  const executable = await extractOcrRuntimeArchive(runtimeArchive, path.join(temporary, "runtime"), platform);
  await renderFixture(input, expected);
  const started = performance.now();
  await recognize(executable, models, input, output);
  const elapsed = Math.round(performance.now() - started);
  const result = JSON.parse(await fs.readFile(output, "utf8"));
  const actual = normalize(result.text ?? "");
  const target = normalize(expected);
  const accuracy = 1 - levenshtein(actual, target) / Math.max(1, target.length);
  if (accuracy < 0.98) {
    throw new Error(`Précision OCR propre insuffisante: ${(accuracy * 100).toFixed(2)} %, résultat « ${actual} »`);
  }
  console.log(`OCR packaged runtime passed: ${(accuracy * 100).toFixed(2)} % character accuracy in ${elapsed} ms (${platform}, CPU).`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

async function renderFixture(target, text) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 2400, height: 420 }, deviceScaleFactor: 1 });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(`<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:#fff}body{display:grid;place-items:center;color:#111;font:72px Arial,sans-serif}</style><div>${escapeHtml(text)}</div>`);
    await page.screenshot({ path: target, animations: "disabled" });
  } finally {
    await browser.close();
  }
}

function recognize(workerPath, modelsPath, inputPath, outputPath) {
  return new Promise((resolve, reject) => {
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
    let stdout = "";
    let stderr = "";
    let completed = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Le runtime OCR empaqueté a dépassé 180 secondes."));
    }, 180_000);
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      let newline = stdout.indexOf("\n");
      while (newline >= 0) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (line) {
          const message = JSON.parse(line);
          if (message.type === "ready") {
            child.stdin.write(`${JSON.stringify({ jobId: "runtime-smoke", input: inputPath, output: outputPath })}\n`);
          } else if (message.type === "completed") {
            completed = true;
            child.stdin.end();
          } else if (message.type === "failed") {
            child.kill();
            clearTimeout(timer);
            reject(new Error(`Le runtime OCR a échoué: ${message.message}`));
          }
        }
        newline = stdout.indexOf("\n");
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (completed && code === 0) resolve();
      else reject(new Error(`Le runtime OCR s’est arrêté (${code}): ${stderr}`));
    });
  });
}

function normalize(value) {
  return value.normalize("NFC").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
}

function levenshtein(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + Number(left[leftIndex - 1] !== right[rightIndex - 1]),
      );
    }
    previous = current;
  }
  return previous[right.length];
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
