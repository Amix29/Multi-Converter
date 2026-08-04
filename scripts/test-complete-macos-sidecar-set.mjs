import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "mc-macos-sidecars-"));

try {
  const universal = Buffer.from("locked-universal-ffprobe");
  await fs.writeFile(path.join(temporary, "ffprobe-universal-apple-darwin"), universal);
  const first = run(temporary);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.deepEqual(await fs.readFile(path.join(temporary, "ffprobe-x86_64-apple-darwin")), universal);
  const digest = createHash("sha256").update(universal).digest("hex");
  assert.equal(
    await fs.readFile(path.join(temporary, "ffprobe-x86_64-apple-darwin.sha256"), "utf8"),
    `${digest}  ffprobe-x86_64-apple-darwin\n`,
  );

  const exactIntel = Buffer.from("exact-intel-ffprobe");
  await fs.writeFile(path.join(temporary, "ffprobe-x86_64-apple-darwin"), exactIntel);
  const second = run(temporary);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.deepEqual(await fs.readFile(path.join(temporary, "ffprobe-x86_64-apple-darwin")), exactIntel);

  await fs.rm(path.join(temporary, "ffprobe-x86_64-apple-darwin"));
  await fs.rm(path.join(temporary, "ffprobe-universal-apple-darwin"));
  const rejected = run(temporary);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Sidecars macOS incomplets/);
  console.log("macOS sidecar completion test passed: exact Intel input is preserved and locked universal fallback is bounded.");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

function run(assetDir) {
  return spawnSync(process.execPath, ["scripts/complete-macos-sidecar-set.mjs", "--asset-dir", assetDir], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
}
