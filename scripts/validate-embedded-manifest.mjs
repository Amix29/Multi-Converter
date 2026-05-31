import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const manifestPath = path.join(process.cwd(), "src-tauri", "engines-manifest.json");
const manifestText = await fs.readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);
const errors = [];

for (const engine of manifest.engines ?? []) {
  const url = String(engine.downloadUrl ?? "");
  const sha = String(engine.sha256 ?? "");
  const configured = !url.includes("REPLACE_WITH_RELEASE_BASE_URL") && !/^0{64}$/.test(sha);
  const explicitlyUnpublished = engine.published === false;

  if (/file:\/\//i.test(url) || /[A-Z]:\/Users\//i.test(url) || /[A-Z]:\\Users\\/i.test(url)) {
    errors.push(`${engine.id}: manifest embarqué contient un chemin local (${url})`);
  }

  if (!configured && !explicitlyUnpublished) {
    errors.push(`${engine.id}: placeholder/hash zero sans published:false`);
  }

  if (explicitlyUnpublished && engine.mode !== "qualityMax") {
    errors.push(`${engine.id}: seuls les moteurs qualityMax optionnels peuvent être unpublished`);
  }

  if (engine.mode !== "qualityMax") {
    errors.push(`${engine.id}: le manifeste runtime ne doit contenir que les moteurs qualityMax téléchargeables`);
  }
}

if (errors.length) {
  console.error("Embedded engine manifest validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Embedded engine manifest validation OK");
