import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readMacosMinimum, validateMacosDeploymentTargets } from "./lib/macos-deployment-target.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "mc-macos-target-"));
function thin(minimum, legacy = false) {
  const bytes = Buffer.alloc(legacy ? 48 : 56);
  bytes.writeUInt32LE(0xfeedfacf); bytes.writeUInt32LE(0x0100000c, 4);
  bytes.writeUInt32LE(1, 16); bytes.writeUInt32LE(bytes.length - 32, 20);
  bytes.writeUInt32LE(legacy ? 0x24 : 0x32, 32); bytes.writeUInt32LE(bytes.length - 32, 36);
  if (legacy) bytes.writeUInt32LE(minimum, 40);
  else { bytes.writeUInt32LE(1, 40); bytes.writeUInt32LE(minimum, 44); }
  return bytes;
}
function write(name, bytes) { const file = path.join(root, name); fs.writeFileSync(file, bytes); return file; }
try {
  const current = write("vips", thin(15 * 65536));
  assert.equal(readMacosMinimum(current), 15 * 65536);
  assert.equal(readMacosMinimum(write("legacy", thin(12 * 65536 + 3 * 256, true))), 12 * 65536 + 3 * 256);
  assert.equal(readMacosMinimum(write("license.txt", Buffer.from("License text"))), null);
  assert.match(validateMacosDeploymentTargets([root], "11.0").join("\n"), /requires macOS 15\.0\.0/);
  assert.deepEqual(validateMacosDeploymentTargets([root], "15.0"), []);
  for (const wide of [false, true]) {
    const bytes = Buffer.alloc(512); bytes.writeUInt32BE(wide ? 0xcafebabf : 0xcafebabe);
    bytes.writeUInt32BE(2, 4); bytes.writeUInt32BE(0x01000007, 8);
    const entry = 8 + (wide ? 32 : 20); bytes.writeUInt32BE(0x0100000c, entry);
    if (wide) { bytes.writeBigUInt64BE(256n, entry + 8); bytes.writeBigUInt64BE(56n, entry + 16); }
    else { bytes.writeUInt32BE(256, entry + 8); bytes.writeUInt32BE(56, entry + 12); }
    thin(14 * 65536).copy(bytes, 256);
    assert.equal(readMacosMinimum(write(`universal-${wide}`, bytes)), 14 * 65536);
    if (wide) bytes.writeBigUInt64BE(8192n, entry + 16); else bytes.writeUInt32BE(8192, entry + 12);
    assert.throws(() => readMacosMinimum(write(`bad-slice-${wide}`, bytes)), /slice bounds/);
  }
  const intel = thin(15 * 65536); intel.writeUInt32LE(0x01000007, 4);
  assert.throws(() => readMacosMinimum(write("intel-only", intel)), /native arm64/);
  const broken = thin(15 * 65536); broken.writeUInt32LE(4096, 36);
  assert.throws(() => readMacosMinimum(write("bad-command", broken)), /command size/);
  assert.throws(() => readMacosMinimum(write("truncated", thin(15 * 65536).subarray(0, 40))), /Truncated/);
  console.log("Mach-O deployment target tests passed: thin/universal, legacy, incompatible and malformed runtime files.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
