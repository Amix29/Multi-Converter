import fs from "node:fs";

const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46];
const ELF_CLASS_64 = 0x02;
const ELF_DATA_LITTLE_ENDIAN = 0x01;
const ELF_MACHINE_X86_64 = 0x3e;

export function readElfHeader(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 20);
  const isElf = header.length >= 20 && ELF_MAGIC.every((value, index) => header[index] === value);
  return {
    isElf,
    is64Bit: isElf && header[4] === ELF_CLASS_64,
    isLittleEndian: isElf && header[5] === ELF_DATA_LITTLE_ENDIAN,
    machine: isElf ? header[18] | (header[19] << 8) : null,
  };
}

export function isX86_64Elf(filePath) {
  const header = readElfHeader(filePath);
  return header.isElf && header.is64Bit && header.isLittleEndian && header.machine === ELF_MACHINE_X86_64;
}
