import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { minify } from "terser";

const root = process.cwd();
const outDir = path.join(root, "out");
const siteInteractionsPath = path.join(outDir, "site-interactions.js");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function minifyJavaScript(filePath) {
  if (!(await exists(filePath))) {
    return null;
  }

  const input = await fs.readFile(filePath, "utf8");
  const result = await minify(input, {
    compress: {
      defaults: true,
      passes: 2
    },
    format: {
      comments: false
    },
    mangle: true,
    module: false
  });

  if (!result.code) {
    throw new Error(`Unable to minify ${path.relative(root, filePath)}`);
  }

  await fs.writeFile(filePath, result.code, "utf8");

  return {
    after: Buffer.byteLength(result.code),
    before: Buffer.byteLength(input),
    file: path.relative(root, filePath)
  };
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function optimizePng(filePath) {
  const input = await fs.readFile(filePath);
  const output = await sharp(input)
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
      effort: 10
    })
    .toBuffer();

  if (output.length >= input.length) {
    return null;
  }

  await fs.writeFile(filePath, output);

  return {
    after: output.length,
    before: input.length,
    file: path.relative(root, filePath)
  };
}

const minified = [await minifyJavaScript(siteInteractionsPath)].filter(Boolean);
const pngCandidates = (await walkFiles(outDir)).filter((file) => file.toLowerCase().endsWith(".png"));
const optimizedPngs = (await Promise.all(pngCandidates.map(optimizePng))).filter(Boolean);

for (const asset of minified) {
  const saved = asset.before - asset.after;
  const percent = asset.before > 0 ? Math.round((saved / asset.before) * 100) : 0;
  console.log(
    `Minified ${asset.file}: ${(asset.before / 1024).toFixed(1)} KB -> ${(asset.after / 1024).toFixed(1)} KB (${percent}% smaller).`
  );
}

if (optimizedPngs.length > 0) {
  const before = optimizedPngs.reduce((sum, asset) => sum + asset.before, 0);
  const after = optimizedPngs.reduce((sum, asset) => sum + asset.after, 0);
  const percent = before > 0 ? Math.round(((before - after) / before) * 100) : 0;
  console.log(
    `Optimized ${optimizedPngs.length} PNG fallback asset(s): ${(before / 1024).toFixed(1)} KB -> ${(after / 1024).toFixed(1)} KB (${percent}% smaller).`
  );
}
