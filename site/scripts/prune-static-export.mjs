import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "out");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, generatedDirs = new Set()) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith("__next.")) {
        generatedDirs.add(fullPath);
        continue;
      }

      const nested = await walk(fullPath, generatedDirs);
      files.push(...nested.files);
    } else {
      files.push(fullPath);
    }
  }

  return { files, generatedDirs };
}

function pruneNotFoundHtml(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<meta name="description"[^>]*>/gi, "")
    .replace(/<meta name="robots"[^>]*>/gi, "")
    .replace(/<meta name="googlebot"[^>]*>/gi, "")
    .replace(/<link rel="canonical"[^>]*>/gi, "")
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")
    .replace(
      "<head>",
      '<head><title>Page not found | Multi-Converter</title><meta name="robots" content="noindex, nofollow"/>'
    );
}

function pruneHtml(html, { isNotFound = false } = {}) {
  let pruned = html
    .replace(/<link[^>]+rel="preload"[^>]+as="script"[^>]+href="[^"]*\/_next\/static\/[^"]+\.js"[^>]*>/g, "")
    .replace(/<script[^>]+src="[^"]*\/_next\/static\/[^"]+\.js"[^>]*><\/script>/g, "")
    .replace(/<script>\s*self\.__next_f\s*=\s*self\.__next_f\s*\|\|\s*\[\]\s*<\/script>/g, "")
    .replace(/<script>\s*self\.__next_f\.push\([\s\S]*?<\/script>/g, "")
    .replace(/<script>\s*\(self\.__next_f\s*=\s*self\.__next_f\s*\|\|\s*\[\]\)\.push\([\s\S]*?<\/script>/g, "")
    .replace(/<script>\s*self\.__next_s\.push\([\s\S]*?<\/script>/g, "")
    .replace(/<script>\s*\(self\.__next_s\s*=\s*self\.__next_s\s*\|\|\s*\[\]\)\.push\([\s\S]*?<\/script>/g, "")
    .replace(
      /<template\b(?=[^>]*\bid="multi-converter-json-ld")(?=[^>]*\bdata-json-ld)[^>]*>([\s\S]*?)<\/template>/g,
      '<script type="application/ld+json">$1</script>'
    )
    .replace(/<div hidden=""><!--\$--><!--\/\$--><\/div>/g, "")
    .replace(/<!--\$--><!--\/\$-->/g, "");

  if (isNotFound) {
    pruned = pruneNotFoundHtml(pruned);
  }

  const siteScriptLink = (pruned.match(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="script")[^>]*\bhref="([^"]*site-interactions\.js)"[^>]*>/) || [])[1];
  if (siteScriptLink && !/<script\b(?=[^>]*\bsrc="[^"]*site-interactions\.js")/.test(pruned)) {
    const siteScriptSrc = siteScriptLink || "/site-interactions.js";
    pruned = pruned.replace("</body>", `<script src="${siteScriptSrc}" defer></script></body>`);
  }

  return pruned;
}

if (!(await exists(outDir))) {
  throw new Error("Missing out directory. Run next build before pruning.");
}

const { files, generatedDirs } = await walk(outDir);
let prunedHtmlCount = 0;
let removedFileCount = 0;

for (const file of files) {
  const name = path.basename(file);
  const relativeFile = path.relative(outDir, file).replaceAll("\\", "/");

  if (file.endsWith(".html")) {
    const html = await fs.readFile(file, "utf8");
    const pruned = pruneHtml(html, { isNotFound: relativeFile === "404.html" });

    if (pruned !== html) {
      await fs.writeFile(file, pruned);
      prunedHtmlCount += 1;
    }
  }

  if (
    file.endsWith(".js") &&
    relativeFile.startsWith("_next/static/")
  ) {
    await fs.rm(file);
    removedFileCount += 1;
  }

  if (name === "index.txt" || name.startsWith("__next.")) {
    await fs.rm(file);
    removedFileCount += 1;
  }
}

for (const dir of generatedDirs) {
  await fs.rm(dir, { force: true, recursive: true });
  removedFileCount += 1;
}

for (const routeDir of ["404", "_not-found"]) {
  const fullPath = path.join(outDir, routeDir);
  if (await exists(fullPath)) {
    await fs.rm(fullPath, { force: true, recursive: true });
    removedFileCount += 1;
  }
}

console.log(`Pruned ${prunedHtmlCount} HTML file(s) and removed ${removedFileCount} unused export file(s).`);
