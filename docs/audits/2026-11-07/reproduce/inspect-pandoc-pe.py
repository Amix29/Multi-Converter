"""Read-only PE inspection and streaming compression, without producing a binary."""
import hashlib
import json
import struct
import time
import zlib
from pathlib import Path

source = Path('src-tauri/bundled-engines/pandoc/compatible/bin/pandoc.exe')
with source.open('rb') as stream:
    header = stream.read(65536)
    pe = struct.unpack_from('<I', header, 60)[0]
    section_count, symbol_pointer, symbol_count, optional_size = (
        struct.unpack_from('<H', header, pe + 6)[0],
        struct.unpack_from('<I', header, pe + 12)[0],
        struct.unpack_from('<I', header, pe + 16)[0],
        struct.unpack_from('<H', header, pe + 20)[0],
    )
    strings_pointer = symbol_pointer + symbol_count * 18
    stream.seek(strings_pointer)
    strings_bytes = struct.unpack('<I', stream.read(4))[0]
    sections = []
    for index in range(section_count):
        offset = pe + 24 + optional_size + 40 * index
        name = header[offset:offset + 8].split(b'\0')[0].decode('ascii')
        if name.startswith('/'):
            stream.seek(strings_pointer + int(name[1:]))
            name = stream.read(256).split(b'\0')[0].decode('ascii')
        sections.append({'name': name, 'rawBytes': struct.unpack_from('<I', header, offset + 16)[0],
                         'fileOffset': struct.unpack_from('<I', header, offset + 20)[0]})
    security_directory = pe + 24 + 112 + 4 * 8
    certificate_offset, certificate_bytes = struct.unpack_from('<II', header, security_directory)

size = source.stat().st_size
coff_bytes = symbol_count * 18 + strings_bytes
trailing_bytes = size - (symbol_pointer + coff_bytes)
assert trailing_bytes >= 0, f'COFF tables extend beyond file: {trailing_bytes}'
assert symbol_pointer == max(section['rawBytes'] + section['fileOffset'] for section in sections)

def compression_count(limit):
    started = time.perf_counter()
    compressor = zlib.compressobj(level=9)
    count = 0
    remaining = limit
    digest = hashlib.sha256()
    with source.open('rb') as stream:
        while remaining:
            data = stream.read(min(1024 * 1024, remaining))
            if not data:
                raise RuntimeError('Unexpected end of input')
            digest.update(data)
            count += len(compressor.compress(data))
            remaining -= len(data)
    count += len(compressor.flush())
    return {'inputBytes': limit, 'zlib9Bytes': count, 'inputSha256': digest.hexdigest(),
            'durationSeconds': round(time.perf_counter() - started, 3)}

original = compression_count(size)
prefix = compression_count(symbol_pointer)
report = {
    'source': str(source), 'bytes': size, 'coffSymbolCount': symbol_count,
    'coffSymbolTableBytes': symbol_count * 18, 'coffStringTableBytes': strings_bytes,
    'coffCombinedBytes': coff_bytes, 'trailingDataBytes': trailing_bytes, 'certificateOffset': certificate_offset, 'certificateBytes': certificate_bytes,
    'sections': sections, 'originalCompression': original, 'prefixCompression': prefix,
    'compressedDifferenceBytes': original['zlib9Bytes'] - prefix['zlib9Bytes'],
    'method': 'Read-only PE headers/COFF tables and streaming zlib compression to a byte counter. No archive or executable created or modified.',
    'limits': 'Prefix is a compression simulation, not a valid stripped executable or NSIS measurement. Proper tool-based stripping and functional conversion parity still required.',
}
Path('docs/audits/2026-11-07/pandoc-pe-compression.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key != 'sections'}, indent=2), flush=True)
