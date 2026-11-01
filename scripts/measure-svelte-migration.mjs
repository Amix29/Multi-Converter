import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
const [referenceRoot, referencePreview, currentRoot, currentPreview, output] = process.argv.slice(2);
fs.mkdirSync(output, { recursive: true });
const cases = [
  { name: 'react', root: referenceRoot, preview: referencePreview, production: 'tmp/react-production-final', port: 4196 },
  { name: 'svelte', root: currentRoot, preview: currentPreview, production: 'tmp/svelte-production-final', port: 4197 },
];
const servers = cases.map(item => spawn(process.execPath, [path.join(item.root, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', item.preview, '--host', '127.0.0.1', '--port', String(item.port), '--strictPort'], { cwd: item.root, stdio: 'ignore', windowsHide: true }));
const browser = await chromium.launch({ headless: true });
const measurements = [];
try {
  for (const item of cases) {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = (await fetch(`http://127.0.0.1:${item.port}`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Preview server unavailable: ' + item.name);
  }
  for (let pair = 0; pair < 7; pair++) {
    for (const item of pair % 2 === 0 ? cases : [...cases].reverse()) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      let started = performance.now();
      await page.goto(`http://127.0.0.1:${item.port}/?mockWelcomeSeen=1&mockLargeBatch=2000`);
      await page.getByRole('button', { name: 'Parcourir', exact: true }).waitFor();
      const startupMs = performance.now() - started;
      started = performance.now();
      await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      const settingsMs = performance.now() - started;
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Parcourir', exact: true }).click();
      await page.getByRole('button', { name: 'Préparer la conversion', exact: true }).click();
      await page.getByTestId('virtual-format-rail').waitFor();
      started = performance.now();
      await page.locator('.format-card').first().click();
      await page.locator('.format-card.is-selected').first().waitFor();
      const formatSelectionMs = performance.now() - started;
      measurements.push({ implementation: item.name, pair, startupMs, settingsMs, formatSelectionMs, errors });
      await context.close();
    }
  }
  const median = values => [...values].sort((a,b) => a-b)[3];
  const summaries = cases.map(item => ({ implementation: item.name, median: Object.fromEntries(['startupMs','settingsMs','formatSelectionMs'].map(key => [key, median(measurements.filter(row => row.implementation === item.name).map(row => row[key]))])) }));
  const assets = cases.map(item => ({ implementation: item.name, files: fs.readdirSync(path.join(item.root,item.production,'assets')).filter(name => /\.(css|js)$/.test(name)).map(name => { const data = fs.readFileSync(path.join(item.root,item.production,'assets',name)); return { name, bytes: data.length, gzipBytes: gzipSync(data).length }; }) }));
  const report = { date: new Date().toISOString(), scope: 'Compiled mock preview only. Seven paired fresh Chromium contexts per implementation, alternating order. No native startup, OS RSS, OCR or package claim.', measurements, summaries, assets };
  fs.writeFileSync(path.join(output,'paired-preview-comparison.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(summaries));
} finally {
  await browser.close();
  servers.forEach(server => server.kill());
}
