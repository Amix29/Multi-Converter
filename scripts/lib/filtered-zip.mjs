import fs from "node:fs/promises";

// Reuse verified compressed records. Never inflate a runtime tree to repackage it.
export async function inspectFilterableZip(file) {
  const input = await fs.open(file, "r");
  try {
    const size = (await input.stat()).size;
    const tail = Buffer.alloc(Math.min(size, 65557));
    await readExact(input, tail, size - tail.length);
    let end = tail.length - 22;
    while (end >= 0 && !(tail.readUInt32LE(end) === 0x06054b50
      && end + 22 + tail.readUInt16LE(end + 20) === tail.length)) end--;
    if (end < 0) throw Error("ZIP end record missing");
    const count = tail.readUInt16LE(end + 10);
    const centralSize = tail.readUInt32LE(end + 12);
    const centralOffset = tail.readUInt32LE(end + 16);
    if (tail.readUInt32LE(end + 4) !== 0 || count !== tail.readUInt16LE(end + 8)
      || count === 65535 || centralOffset === 0xffffffff || centralSize === 0xffffffff
      || count > 50000 || centralSize > 64 * 1024 * 1024
      || centralOffset + centralSize !== size - tail.length + end) {
      throw Error("Only single-disk, non-ZIP64 engine archives are supported");
    }
    const central = Buffer.alloc(centralSize);
    await readExact(input, central, centralOffset);
    const entries = [];
    const names = new Set();
    let offset = 0;
    for (let index = 0; index < count; index++) {
      if (offset + 46 > central.length || central.readUInt32LE(offset) !== 0x02014b50) throw Error("Invalid ZIP directory");
      const nameLength = central.readUInt16LE(offset + 28);
      const length = 46 + nameLength + central.readUInt16LE(offset + 30) + central.readUInt16LE(offset + 32);
      if (offset + length > central.length) throw Error("Truncated ZIP entry");
      const record = Buffer.from(central.subarray(offset, offset + length));
      const name = record.subarray(46, 46 + nameLength).toString("utf8").replaceAll("\\", "/");
      if (!name || name.includes("\0") || name.startsWith("/")
        || /^[A-Za-z]:/.test(name) || name.split("/").includes("..") || names.has(name.toLowerCase())) throw Error(`Unsafe or duplicate ZIP path: ${name}`);
      names.add(name.toLowerCase());
      if ((record.readUInt16LE(8) & 1) || record.readUInt16LE(34) !== 0
        || ((record.readUInt32LE(38) >>> 16) & 0xf000) === 0xa000) throw Error("Encrypted, linked or split ZIP entry refused");
      const bytes = record.readUInt32LE(24);
      const compressedBytes = record.readUInt32LE(20);
      const start = record.readUInt32LE(42);
      if ([bytes, compressedBytes, start].includes(0xffffffff)) throw Error("ZIP64 entry refused");
      entries.push({ name, bytes, compressedBytes, start, record });
      offset += length;
    }
    if (offset !== central.length) throw Error("Unexpected ZIP directory data");
    const ordered = [...entries].sort((a, b) => a.start - b.start);
    for (let index = 0; index < ordered.length; index++) {
      const entry = ordered[index];
      entry.end = ordered[index + 1]?.start ?? centralOffset;
      const header = Buffer.alloc(30);
      await readExact(input, header, entry.start);
      if (header.readUInt32LE(0) !== 0x04034b50
        || entry.start + 30 + header.readUInt16LE(26) + header.readUInt16LE(28) + entry.compressedBytes > entry.end) throw Error("Invalid ZIP local record");
    }
    return { entries, ordered, comment: tail.subarray(end + 22), size };
  } finally { await input.close(); }
}

export async function filterZip(source, destination, keep) {
  const archive = await inspectFilterableZip(source);
  const selected = archive.ordered.filter(entry => keep(entry.name));
  if (!selected.length) throw Error("Empty engine profile refused");
  const input = await fs.open(source, "r");
  let output;
  try {
    output = await fs.open(destination, "wx");
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    const locations = new Map();
    for (const entry of selected) {
      locations.set(entry.name, position);
      for (let cursor = entry.start; cursor < entry.end;) {
        const length = Math.min(buffer.length, entry.end - cursor);
        const block = buffer.subarray(0, length);
        await readExact(input, block, cursor);
        await writeExact(output, block, position);
        cursor += length;
        position += length;
      }
    }
    const centralOffset = position;
    for (const entry of archive.entries.filter(entry => locations.has(entry.name))) {
      const record = Buffer.from(entry.record);
      record.writeUInt32LE(locations.get(entry.name), 42);
      await writeExact(output, record, position);
      position += record.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(selected.length, 8);
    end.writeUInt16LE(selected.length, 10);
    end.writeUInt32LE(position - centralOffset, 12);
    end.writeUInt32LE(centralOffset, 16);
    end.writeUInt16LE(archive.comment.length, 20);
    await writeExact(output, Buffer.concat([end, archive.comment]), position);
    await output.sync();
    return {
      fileCount: selected.filter(entry => !entry.name.endsWith("/")).length,
      installedSizeBytes: selected.reduce((sum, entry) => sum + entry.bytes, 0),
      removedFiles: archive.entries.filter(entry => !locations.has(entry.name)).map(entry => entry.name),
    };
  } finally { await output?.close(); await input.close(); }
}

async function readExact(file, buffer, offset) {
  let cursor = 0;
  while (cursor < buffer.length) {
    const { bytesRead } = await file.read(buffer, cursor, buffer.length - cursor, offset + cursor);
    if (!bytesRead) throw Error("Truncated ZIP data");
    cursor += bytesRead;
  }
}

async function writeExact(file, buffer, offset) {
  let cursor = 0;
  while (cursor < buffer.length) {
    const { bytesWritten } = await file.write(buffer, cursor, buffer.length - cursor, offset + cursor);
    if (!bytesWritten) throw Error("ZIP write made no progress");
    cursor += bytesWritten;
  }
}
