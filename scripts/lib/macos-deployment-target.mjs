import fs from "node:fs";
import path from "node:path";

// https://github.com/apple-oss-distributions/xnu/blob/main/EXTERNAL_HEADERS/mach-o/loader.h
const ARM64 = 0x0100000c;
const HEADER_LIMIT = 1024 * 1024;

export function readMacosMinimum(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  const size = fs.fstatSync(descriptor).size;
  const read = (offset, length) => {
    if (!Number.isSafeInteger(offset) || offset < 0 || length > HEADER_LIMIT || offset + length > size) {
      throw new Error("Truncated or oversized Mach-O header");
    }
    const bytes = Buffer.alloc(length);
    if (fs.readSync(descriptor, bytes, 0, length, offset) !== length) throw new Error("Incomplete Mach-O header");
    return bytes;
  };
  try {
    if (size < 4) return null;
    const magic = read(0, 4).readUInt32BE();
    if (magic === 0xcafebabe || magic === 0xcafebabf) {
      const count = read(0, 8).readUInt32BE(4);
      if (count < 1 || count > 32) throw new Error("Invalid universal Mach-O architecture count");
      const wide = magic === 0xcafebabf;
      const entries = read(8, count * (wide ? 32 : 20));
      const versions = [];
      for (let index = 0; index < count; index += 1) {
        const entry = index * (wide ? 32 : 20);
        if (entries.readUInt32BE(entry) !== ARM64) continue;
        const offset = wide ? Number(entries.readBigUInt64BE(entry + 8)) : entries.readUInt32BE(entry + 8);
        const sliceSize = wide ? Number(entries.readBigUInt64BE(entry + 16)) : entries.readUInt32BE(entry + 12);
        if (!Number.isSafeInteger(sliceSize) || sliceSize < 32 || !Number.isSafeInteger(offset) || offset + sliceSize > size) {
          throw new Error("Invalid universal Mach-O slice bounds");
        }
        versions.push(readThinMinimum((position, length) => {
          if (position < offset || position + length > offset + sliceSize) throw new Error("Truncated universal Mach-O slice");
          return read(position, length);
        }, offset));
      }
      if (!versions.length) throw new Error("Intel-only Mach-O runtime is unsupported");
      return Math.max(...versions);
    }
    if (magic === 0xcffaedfe) return readThinMinimum(read, 0);
    if ([0xfeedfacf, 0xfeedface, 0xcefaedfe, 0xbebafeca, 0xbfbafeca].includes(magic)) {
      throw new Error("Unsupported Mach-O runtime header");
    }
    return null;
  } finally {
    fs.closeSync(descriptor);
  }
}

function readThinMinimum(read, offset) {
  const header = read(offset, 32);
  if (header.readUInt32LE() !== 0xfeedfacf || header.readUInt32LE(4) !== ARM64) {
    throw new Error("Expected a native arm64 Mach-O runtime");
  }
  const count = header.readUInt32LE(16);
  const bytes = read(offset + 32, header.readUInt32LE(20));
  if (count > 4096) throw new Error("Invalid Mach-O load command count");
  let position = 0;
  let minimum = null;
  for (let index = 0; index < count; index += 1) {
    if (position + 8 > bytes.length) throw new Error("Truncated Mach-O load command");
    const command = bytes.readUInt32LE(position);
    const length = bytes.readUInt32LE(position + 4);
    if (length < 8 || position + length > bytes.length) throw new Error("Invalid Mach-O load command size");
    if (command === 0x32) {
      if (length < 24 || bytes.readUInt32LE(position + 8) !== 1) throw new Error("Expected a macOS build-version command");
      minimum = Math.max(minimum ?? 0, bytes.readUInt32LE(position + 12));
    } else if (command === 0x24) {
      if (length < 16) throw new Error("Truncated macOS minimum-version command");
      minimum = Math.max(minimum ?? 0, bytes.readUInt32LE(position + 8));
    }
    position += length;
  }
  if (minimum === null) throw new Error("Missing macOS minimum-version command");
  return minimum;
}

export function validateMacosDeploymentTargets(roots, target) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(target)) throw new Error("Explicit macOS deployment target required");
  const [major, minor, patch = 0] = target.split(".").map(Number);
  const maximum = major * 65536 + minor * 256 + patch;
  const errors = [];
  const pending = [...roots];
  while (pending.length) {
    const filePath = pending.pop();
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      pending.push(...fs.readdirSync(filePath).map((name) => path.join(filePath, name)));
    } else if (stat.isFile()) {
      try {
        const minimum = readMacosMinimum(filePath);
        if (minimum !== null && minimum > maximum) {
          const version = `${minimum >>> 16}.${(minimum >>> 8) & 255}.${minimum & 255}`;
          errors.push(`${filePath}: requires macOS ${version}, advertised minimum ${target}`);
        }
      } catch (error) {
        errors.push(`${filePath}: ${error.message}`);
      }
    }
  }
  return errors;
}
