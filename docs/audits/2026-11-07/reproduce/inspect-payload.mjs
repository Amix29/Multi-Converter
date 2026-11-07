import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const localData = process.env.MC_AUDIT_LOCAL_DATA_DIR ?? process.env.LOCALAPPDATA;
if (!localData) throw Error('Set LOCALAPPDATA or MC_AUDIT_LOCAL_DATA_DIR');
const target = path.join(localData, 'Temp/mc-cargo-target-svelte-migration');
const nsisPath = `${target}/release/nsis/x64/installer.nsi`;
const text = fs.readFileSync(nsisPath, 'utf8');
const files = [];
for (const match of text.matchAll(/^\s*File \/a "\/oname=([^"]+)"\s+"([^"]+)"/gm)) {
  const destination = match[1].replaceAll('\\', '/');
  const source = path.resolve(match[2]);
  const stat = fs.statSync(source);
  const group = destination.startsWith('engines/') ? destination.split('/')[1]
    : destination.startsWith('engine-archives/') ? 'libreoffice-archive'
    : destination.startsWith('ocr/runtime/') ? 'ocr-runtime-archive'
    : destination.startsWith('ocr/models/') ? 'ocr-models'
    : /^(ffmpeg|ffprobe)\.exe$/.test(destination) ? 'ffmpeg-ffprobe'
    : 'licenses-other';
  files.push({ destination, source, bytes: stat.size, group });
}
files.push({ destination: 'multi-converter.exe', source: `${target}/release/multi-converter.exe`,
  bytes: fs.statSync(`${target}/release/multi-converter.exe`).size, group: 'application' });
const categories = {};
for (const file of files) {
  categories[file.group] ??= { bytes: 0, fileCount: 0 };
  categories[file.group].bytes += file.bytes;
  categories[file.group].fileCount++;
}
function tree(root, relative = '') {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) return tree(root, child);
    if (!entry.isFile()) return [];
    return [{ relative: child.split(path.sep).join('/'), bytes: fs.statSync(path.join(root, child)).size }];
  });
}
function directoryInventory(root, includeNames = false) {
  const entries = tree(root);
  const children = {};
  for (const entry of entries) {
    const child = entry.relative.split('/')[0];
    children[child] ??= { bytes: 0, fileCount: 0 };
    children[child].bytes += entry.bytes;
    children[child].fileCount++;
  }
  return { root, exists: fs.existsSync(root), bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), fileCount: entries.length, children,
    ...(includeNames ? { largestFiles: entries.sort((a, b) => b.bytes - a.bytes).slice(0, 20) } : {}) };
}
const installer = `${target}/release/bundle/nsis/Multi-Converter_1.0.7_x64-setup.exe`;
const report = {
  date: new Date().toISOString(), platform: process.platform, source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  method: 'Read-only stat of NSIS source file declarations; ZIP inspection performed separately without extraction. No copied engine trees or rebuilt installers.',
  installer: { path: installer, bytes: fs.statSync(installer).size },
  packagedBytesBeforeInstallerCompression: files.reduce((sum, entry) => sum + entry.bytes, 0), categories,
  largestPackagedFiles: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 25),
  engines: ['pdfium', 'pandoc', 'libvips'].map(name => directoryInventory(`src-tauri/bundled-engines/${name}`, true)),
  frontend: directoryInventory('dist', true),
  existingInstalledAndDataDirectories: [
    path.join(localData, 'Temp/mc-deep-qa-20260807-0020/install'),
    path.join(localData, 'Programs/Multi-Converter'),
    path.join(localData, 'com.multiconverter.desktop'),
    path.join(localData, 'Multi-Converter'),
  ].map(root => directoryInventory(root)),
  limitations: ['Per-category compressed bytes cannot be inferred from uncompressed sizes; NSIS compresses different inputs differently.', 'Existing installation/data directories may belong to earlier candidates and are not final-candidate installed acceptance.'],
};
function redact(value) {
  if (typeof value === 'string') {
    const normalized = value.replaceAll('\\', '/');
    for (const [prefix, label] of [[process.cwd(), '<repo>'], [localData, '%LOCALAPPDATA%']]) {
      const portable = prefix.replaceAll('\\', '/');
      if (normalized.toLowerCase().startsWith(portable.toLowerCase() + '/')) return label + normalized.slice(portable.length);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  return value;
}
fs.mkdirSync('docs/audits/2026-11-07', { recursive: true });
fs.writeFileSync('docs/audits/2026-11-07/engine-size-inventory.json', JSON.stringify(redact(report), null, 2) + '\n');
console.log(JSON.stringify({ installer: report.installer, packagedBytesBeforeInstallerCompression: report.packagedBytesBeforeInstallerCompression,
  categories, frontendBytes: report.frontend.bytes, existing: report.existingInstalledAndDataDirectories.map(({ children, ...entry }) => entry),
  largest: report.largestPackagedFiles.slice(0, 12).map(({ source, ...entry }) => entry) }, null, 2));
