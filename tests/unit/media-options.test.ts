import { describe, expect, it } from "vitest";
import { updateMediaMode } from "../../src/app/conversion/mediaOptions";
import { makePreviewFile } from "../../src/lib/api/previewFixtures";
import type { FileItem } from "../../src/app/types";

describe("media choices", () => {
  it("invalidates an encoded result before switching to copy and rejects copy on images", () => {
    const file: FileItem = { ...makePreviewFile("source.mov", ".mov", 123), id: "file", jobId: "old",
      selectedFormat: "mkv", progress: 100, phase: "phase.done", status: "done",
      result: { outputPath: "/temporary/old.mkv" }, convertedFormat: "mkv", error: null };
    expect(updateMediaMode(file, "copy")).toMatchObject({ mediaMode: "copy", result: null,
      status: "ready", progress: 0, phase: "phase.waiting", jobId: "" });
    const image: FileItem = { ...file, ...makePreviewFile("source.png", ".png", 1), selectedFormat: "jpg" };
    expect(updateMediaMode(image, "copy")).toBe(image);
  });

  it("describes MOV and WAV as their actual families with relevant preview targets", () => {
    const video = makePreviewFile("source.MOV", ".MOV", 1);
    const audio = makePreviewFile("source.wav", ".wav", 1);
    expect(video.categoryId).toBe("video");
    expect(video.targets.some((target) => target.format === "mkv")).toBe(true);
    expect(audio.categoryId).toBe("audio");
    expect(audio.targets.some((target) => target.format === "flac")).toBe(true);
  });
});
