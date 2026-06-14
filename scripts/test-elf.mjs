import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isX86_64Elf, readElfHeader } from "./lib/elf.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-elf-"));

try {
  const x64Elf = writeFixture("x64", fakeElf());
  assert.deepEqual(readElfHeader(x64Elf), {
    isElf: true,
    is64Bit: true,
    isLittleEndian: true,
    machine: 0x3e,
  });
  assert.equal(isX86_64Elf(x64Elf), true, "x86_64 ELF fixture must be accepted");

  const notElf = writeFixture("not-elf", Buffer.from("not an elf\n"));
  assert.equal(readElfHeader(notElf).isElf, false, "plain text fixture must not be detected as ELF");
  assert.equal(isX86_64Elf(notElf), false, "plain text fixture must be rejected");

  const elf32 = writeFixture("elf32", fakeElf({ elfClass: 0x01 }));
  assert.equal(isX86_64Elf(elf32), false, "32-bit ELF fixture must be rejected");

  const bigEndian = writeFixture("big-endian", fakeElf({ data: 0x02 }));
  assert.equal(isX86_64Elf(bigEndian), false, "big-endian ELF fixture must be rejected");

  const arm64 = writeFixture("arm64", fakeElf({ machine: 0xb7 }));
  assert.equal(isX86_64Elf(arm64), false, "ARM64 ELF fixture must be rejected for Linux x64 release checks");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("ELF parser tests passed.");

function writeFixture(name, bytes) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

function fakeElf(options = {}) {
  const header = Buffer.alloc(20);
  const elfClass = options.elfClass ?? 0x02;
  const data = options.data ?? 0x01;
  const machine = options.machine ?? 0x3e;
  header[0] = 0x7f;
  header[1] = 0x45;
  header[2] = 0x4c;
  header[3] = 0x46;
  header[4] = elfClass;
  header[5] = data;
  header[18] = machine & 0xff;
  header[19] = (machine >> 8) & 0xff;
  return Buffer.concat([header, Buffer.from("fixture\n", "utf8")]);
}
