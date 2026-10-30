export function normalizeOcrLockHeader(source, platform) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.startsWith("#")) lines.shift();
  return [
    `# Locked with uv 0.11.21 for CPython 3.12.10 on ${platform}.`,
    "# PaddlePaddle 3.3.1 is resolved from its official platform wheel.",
    "# Regenerate through scripts/prepare-ocr-platform-locks.mjs; do not edit by hand.",
    ...lines,
  ].join("\n");
}
