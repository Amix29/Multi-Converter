import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const screenshotsDir = path.join(root, "public", "screenshots");
const outputDir = path.join(screenshotsDir, "optimized");
const widths = [640, 960, 1280, 1920, 2560];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function shouldWrite(sourcePath, outputPath) {
  if (!(await exists(outputPath))) {
    return true;
  }

  const [sourceStat, outputStat] = await Promise.all([fs.stat(sourcePath), fs.stat(outputPath)]);
  return outputStat.mtimeMs < sourceStat.mtimeMs;
}

async function optimizeScreenshot(fileName) {
  const sourcePath = path.join(screenshotsDir, fileName);
  const parsed = path.parse(fileName);
  const metadata = await sharp(sourcePath).metadata();
  const sourceWidth = metadata.width || 0;

  if (!sourceWidth) {
    return;
  }

  for (const width of widths.filter((candidate) => candidate <= sourceWidth)) {
    const basePipeline = sharp(sourcePath).resize({
      width,
      withoutEnlargement: true
    });
    const avifPath = path.join(outputDir, `${parsed.name}-${width}.avif`);
    const webpPath = path.join(outputDir, `${parsed.name}-${width}.webp`);

    if (await shouldWrite(sourcePath, avifPath)) {
      await basePipeline.clone().avif({ effort: 6, quality: 62 }).toFile(avifPath);
    }

    if (await shouldWrite(sourcePath, webpPath)) {
      await basePipeline.clone().webp({ effort: 6, quality: 86 }).toFile(webpPath);
    }
  }
}

await fs.mkdir(outputDir, { recursive: true });

const files = (await fs.readdir(screenshotsDir)).filter((file) => file.toLowerCase().endsWith(".png"));
await Promise.all(files.map(optimizeScreenshot));

console.log(`Optimized ${files.length} screenshot(s) into ${path.relative(root, outputDir)}.`);
