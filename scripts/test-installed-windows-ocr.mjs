import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

// Exercise the packaged WebView, Rust verifier and worker through the OCR dialog.
const [executable, report, expectedError] = process.argv.slice(2);
assert(process.platform === "win32" && executable && report, "Usage: <installed.exe> <report.json> [expected error]");
const corpus = JSON.parse(await readFile("tests/fixtures/ocr/corpus-manifest.json", "utf8"));
const cases = corpus.cases.filter(item => item.input.endsWith("/clean-fr.png"));
assert(cases.length >= 3);
const profile = await mkdtemp(path.join(os.tmpdir(), "mc-installed-ocr-webview-"));
const listener = createServer();
await new Promise((resolve, reject) => listener.once("error", reject).listen(Number(process.env.MC_TEST_WEBVIEW_PORT ?? 0), "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const child = spawn(path.resolve(executable), [], {
  cwd: path.dirname(path.resolve(executable)), windowsHide: true,
  env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` },
});
const exited = new Promise(resolve => child.once("exit", resolve));
let browser;
try {
  const endpoint = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    assert.equal(child.exitCode, null, "Installed application exited at startup");
    const targets = await fetch(endpoint + "/json/list").then(r => r.json()).catch(() => []);
    if (targets.some(t => t.type === "page" && new URL(t.url).hostname === "tauri.localhost")) break;
    await delay(250);
  }
  browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    page = browser.contexts().flatMap(context => context.pages())
      .find(page => new URL(page.url()).hostname === "tauri.localhost");
    if (!page) await delay(100);
  }
  assert(page, "Installed application WebView not found");
  await page.waitForFunction(() => typeof window.__TAURI_INTERNALS__?.invoke === "function");
  const info = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("get_ocr_runtime_info"));
  assert(info.available && info.runtime === "native" && info.provider === "cpu");
  const drop = paths => page.evaluate(paths => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {
    event: "tauri://drag-drop", payload: { paths },
  }), paths);
  await page.getByRole("button", { name: /Parcourir|Browse/i }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0, "File import must be directly available on first launch");
  const capture = async name => {
    if (path.basename(report) === "app-clean.json") {
      await page.screenshot({ path: path.join(path.dirname(report), `app-clean-${name}.png`) });
    }
  };
  await capture("start");
  await drop([path.resolve(cases[0].input)]);
  await page.locator(".file-ticket").first().waitFor();
  await page.getByRole("button", { name: /Extraire le texte|Extract text/i }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.locator("#ocr-title") });
  const error = dialog.locator(".ocr-error");
  const result = dialog.locator("#ocr-text");
  await result.or(error).waitFor({ timeout: 180_000 });
  let folderImport;
  if (expectedError) {
    assert((await error.innerText()).includes(expectedError), "Unexpected OCR integrity result");
    assert.equal(await result.count(), 0);
  } else {
    if (await error.isVisible()) throw Error(await error.innerText());
    const text = (await result.inputValue()).normalize("NFC").toLowerCase().replace(/\s+/gu, " ");
    for (const item of cases) assert(text.includes(item.expected.normalize("NFC").toLowerCase()), item.expected);
    await capture("ocr");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    folderImport = await checkFolderImport(page, drop, profile);
    await capture("folder");
  }
  await writeFile(report, JSON.stringify({ runtime: info.runtime, provider: info.provider,
    fixture: cases[0].input, verifiedLines: expectedError ? 0 : cases.length,
    folderImport, expectedError: expectedError ?? null }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) child.kill();
  await exited;
}

async function checkFolderImport(page, drop, profile) {
  const folder = path.join(profile, "mixed-folder");
  const nested = path.join(folder, "nested");
  await mkdir(nested, { recursive: true });
  const mediaCount = 80;
  for (let i = 0; i < mediaCount; i++) {
    await copyFile("tests/fixtures/formats/sample.mp4", path.join(nested, `video-${i}.MP4`));
  }
  const unsupported = path.join(folder, "unsupported.bin");
  await writeFile(unsupported, "unsupported fixture");
  await writeFile(path.join(nested, "other.unknown"), "unsupported fixture");
  const started = Date.now();
  await drop([folder]);
  // One image was already imported by the OCR check. The folder is one dropped
  // path, but all of its supported children must appear within the time budget.
  const grid = page.getByTestId("virtual-file-grid");
  await grid.waitFor();
  await page.waitForFunction(expected =>
    Number(document.querySelector('[data-testid="virtual-file-grid"]')?.getAttribute("data-total-count")) === expected,
    mediaCount + 1, { timeout: 45_000 });
  const elapsedMs = Date.now() - started;
  await page.getByText("2 fichiers n’ont pas pu être importés car leur format n’est pas pris en charge.", { exact: true }).waitFor();
  await page.locator(".import-toast.is-analyzing").waitFor({ state: "hidden" });
  await drop([unsupported]);
  await page.getByText("Un fichier n’a pas pu être importé car son format n’est pas pris en charge.", { exact: true }).waitFor();
  assert.equal(await grid.getAttribute("data-total-count"), String(mediaCount + 1));
  return { supported: mediaCount, unsupported: 2, elapsedMs };
}
