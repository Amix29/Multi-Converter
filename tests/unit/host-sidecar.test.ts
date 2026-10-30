import { describe, expect, it } from "vitest";
import { nativeSidecarName } from "../../scripts/lib/host-sidecar.mjs";

describe("native test sidecars", () => {
  it("resolves architecture-qualified executables on all supported hosts", () => {
    expect(nativeSidecarName("ffprobe", "linux", "x64")).toBe("ffprobe-x86_64-unknown-linux-gnu");
    expect(nativeSidecarName("pdfium-render", "darwin", "arm64")).toBe("pdfium-render-aarch64-apple-darwin");
    expect(nativeSidecarName("ffmpeg", "win32", "x64")).toBe("ffmpeg-x86_64-pc-windows-msvc.exe");
    expect(() => nativeSidecarName("ffmpeg", "darwin", "x64")).toThrow("Unsupported");
    expect(() => nativeSidecarName("../private", "linux", "x64")).toThrow("Unknown");
  });
});
