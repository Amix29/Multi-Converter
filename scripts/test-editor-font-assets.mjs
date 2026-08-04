import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceFontRoot = path.join(root, "src", "assets", "fonts");
const complianceRoot = path.join(root, "public", "third-party", "fonts");
const verifyDistribution = process.argv.includes("--dist");
const manifest = JSON.parse(
  fs.readFileSync(path.join(complianceRoot, "fonts-manifest.json"), "utf8"),
);
const css = fs.readFileSync(
  path.join(root, "src", "editor", "editor-fonts.css"),
  "utf8",
);
const notices = fs.readFileSync(
  path.join(complianceRoot, "THIRD_PARTY_NOTICES.md"),
  "utf8",
);
const formatting = fs.readFileSync(
  path.join(root, "src", "editor", "editorFormatting.ts"),
  "utf8",
);
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);

assert.equal(manifest.schemaVersion, 1, "embedded font manifest schema changed");
assert.equal(manifest.runtimeNetworkRequired, false, "editor fonts must remain local");
assert.equal(manifest.families.length, 3, "three reviewed embedded families are required");
assert.equal(manifest.sourceAssetRoot, "src/assets/fonts");
assert.equal(manifest.distributionNoticesRoot, "third-party/fonts");
assert.equal(
  tauriConfig.build.frontendDist,
  "../dist",
  "Tauri packages must embed the verified dist directory",
);
assert.doesNotMatch(css, /https?:|@import/i, "font CSS must not load a remote resource");
assert.deepEqual(
  listFiles(complianceRoot).filter((file) => file.toLowerCase().endsWith(".woff2")),
  [],
  "public compliance files must not duplicate bundled WOFF2 assets",
);
verifyFile(complianceRoot, manifest.noticeFile, manifest.noticeSha256, null, () => {});

for (const family of manifest.families) {
  assert.equal(family.license, "OFL-1.1", `${family.family}: unexpected license`);
  assert.match(family.sourceCommit, /^[a-f0-9]{40}$/, `${family.family}: source commit is not pinned`);
  assert.match(
    family.sourceRepository,
    /^https:\/\/github\.com\/(?:adobe-fonts|googlefonts|JetBrains)\//,
    `${family.family}: source repository is not an approved upstream`,
  );
  assert.match(css, new RegExp(`font-family:\\s*"${escapeRegex(family.family)}"`));
  assert.match(formatting, new RegExp(`"${escapeRegex(family.family)}"`));
  assert.match(notices, new RegExp(escapeRegex(family.family)));

  verifyFile(complianceRoot, family.licenseFile, family.licenseSha256, null, (content) => {
    assert.match(
      content.toString("utf8"),
      /SIL OPEN FONT LICENSE Version 1\.1/,
      `${family.family}: OFL text is incomplete`,
    );
  });

  for (const file of family.files) {
    verifyFile(sourceFontRoot, file.path, file.sha256, file.bytes, (content) => {
      assert.equal(content.subarray(0, 4).toString("ascii"), "wOF2", `${file.path}: invalid WOFF2 signature`);
    });
    assert.match(css, new RegExp(escapeRegex(path.basename(file.path))));
  }
}

if (verifyDistribution) {
  verifyDist();
}

function verifyDist() {
  const distRoot = path.join(root, "dist");
  const distComplianceRoot = path.join(distRoot, "third-party", "fonts");
  assert.ok(fs.existsSync(distComplianceRoot), "dist is missing bundled font notices");

  const complianceFiles = [
    "fonts-manifest.json",
    manifest.noticeFile,
    ...manifest.families.map((family) => family.licenseFile),
  ].sort();
  assert.deepEqual(
    listFiles(distComplianceRoot).sort(),
    complianceFiles,
    "dist font notices differ from the reviewed public compliance set",
  );

  for (const relativePath of complianceFiles) {
    const source = fs.readFileSync(path.join(complianceRoot, ...relativePath.split("/")));
    const bundled = fs.readFileSync(path.join(distComplianceRoot, ...relativePath.split("/")));
    assert.deepEqual(bundled, source, `${relativePath}: dist copy differs from source`);
  }

  const distWoff2 = listFiles(distRoot)
    .filter((relativePath) => relativePath.toLowerCase().endsWith(".woff2"))
    .map((relativePath) => {
      const content = fs.readFileSync(path.join(distRoot, ...relativePath.split("/")));
      return {
        relativePath,
        content,
        sha256: hash(content),
      };
    });
  const expectedFonts = manifest.families.flatMap((family) => family.files);
  assert.equal(
    distWoff2.length,
    expectedFonts.length,
    "dist must contain each reviewed WOFF2 exactly once",
  );

  const distCss = listFiles(distRoot)
    .filter((relativePath) => relativePath.toLowerCase().endsWith(".css"))
    .map((relativePath) => fs.readFileSync(path.join(distRoot, ...relativePath.split("/")), "utf8"))
    .join("\n");

  for (const file of expectedFonts) {
    const matches = distWoff2.filter((candidate) => candidate.sha256 === file.sha256);
    assert.equal(matches.length, 1, `${file.path}: dist must contain one byte-identical WOFF2`);
    assert.equal(matches[0].content.byteLength, file.bytes, `${file.path}: dist size differs`);
    assert.equal(
      matches[0].content.subarray(0, 4).toString("ascii"),
      "wOF2",
      `${file.path}: dist asset is not WOFF2`,
    );
    assert.match(
      distCss,
      new RegExp(escapeRegex(path.basename(matches[0].relativePath))),
      `${file.path}: emitted CSS does not reference the dist asset`,
    );
  }
}

function verifyFile(basePath, relativePath, expectedHash, expectedBytes, inspect) {
  const absolutePath = path.join(basePath, ...relativePath.split("/"));
  const content = fs.readFileSync(absolutePath);
  if (expectedBytes !== null) {
    assert.equal(content.byteLength, expectedBytes, `${relativePath}: size differs from the lock`);
  }
  assert.equal(
    hash(content),
    expectedHash,
    `${relativePath}: SHA-256 differs from the lock`,
  );
  inspect(content);
}

function listFiles(basePath, currentPath = basePath) {
  return fs.readdirSync(currentPath, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      return listFiles(basePath, absolutePath);
    }
    assert.ok(entry.isFile(), `${absolutePath}: links and special files are forbidden`);
    return path.relative(basePath, absolutePath).split(path.sep).join("/");
  });
}

function hash(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

console.log(
  `Embedded editor font contract passed: 3 OFL families, 4 locked WOFF2 files, no runtime network${verifyDistribution ? ", dist notices and assets verified" : ""}.`,
);
