export function nativeSidecarName(stem, platform = process.platform, arch = process.arch) {
  if (!["ffmpeg", "ffprobe", "pdfium-render"].includes(stem)) throw new Error(`Unknown native sidecar: ${stem}.`);
  const triple = platform === "win32" && arch === "x64" ? "x86_64-pc-windows-msvc.exe"
    : platform === "darwin" && arch === "arm64" ? "aarch64-apple-darwin"
    : platform === "linux" && arch === "x64" ? "x86_64-unknown-linux-gnu" : null;
  if (!triple) throw new Error(`Unsupported native sidecar host: ${platform}/${arch}.`);
  return `${stem}-${triple}`;
}
