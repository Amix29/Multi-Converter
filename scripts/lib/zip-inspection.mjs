import { spawnSync } from "node:child_process";
import process from "node:process";

export function inspectZipEntries(archivePath) {
  if (process.platform !== "win32") throw new Error("L'inspection ZIP PDFium Phase 7 exige Windows.");
  const script = [
    "Add-Type -AssemblyName System.IO.Compression",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$archive = ${quote(archivePath)}`,
    "$zip = [System.IO.Compression.ZipFile]::OpenRead($archive)",
    "try {",
    "  $items = @($zip.Entries | ForEach-Object { [pscustomobject]@{ name = $_.FullName; length = $_.Length; compressedLength = $_.CompressedLength; externalAttributes = $_.ExternalAttributes } })",
    "  ConvertTo-Json -Compress -Depth 3 -InputObject $items",
    "} finally { $zip.Dispose() }",
  ].join("\n");
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Archive ZIP PDFium illisible: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout.trim() || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
