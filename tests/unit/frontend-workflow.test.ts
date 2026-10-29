/// <reference types="vite/client" />

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { TargetFormat } from "../../src/lib/api";
import {
  makePreviewFile,
} from "../../src/lib/api/previewFixtures";
import type { ConversionIntent, FileItem } from "../../src/app/types";

let workflow: typeof import("../../src/app/conversion/model");
let largeList: typeof import("../../src/app/conversion/largeListModel");

beforeAll(async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
  workflow = await import("../../src/app/conversion/model");
  largeList = await import("../../src/app/conversion/largeListModel");
});

afterAll(() => vi.unstubAllGlobals());

describe("format selection and grouping", () => {
  it("changes the selected format and invalidates a stale converted result", () => {
    const file = fileItem("capture.png", ".png", 2_048, {
      selectedFormat: "jpg",
      convertedFormat: "jpg",
      status: "done",
      progress: 100,
      result: { outputPath: "C:\\Temp\\capture.jpg" },
    });

    const selected = workflow.updateFileSelection(file, "webp");

    expect(selected).toMatchObject({
      selectedFormat: "webp",
      convertedFormat: null,
      status: "ready",
      progress: 0,
      result: null,
      error: null,
    });
    expect(workflow.targetForFormat(selected, "webp")?.label).toBe("WebP");
  });

  it("keeps an already converted result when the same selection is applied", () => {
    const file = fileItem("capture.png", ".png", 2_048, {
      selectedFormat: "jpg",
      convertedFormat: "jpg",
      status: "done",
      progress: 100,
      result: { outputPath: "C:\\Temp\\capture.jpg" },
    });

    expect(workflow.updateFileSelection(file, "jpg")).toMatchObject({
      selectedFormat: "jpg",
      convertedFormat: "jpg",
      status: "done",
      progress: 100,
      result: { outputPath: "C:\\Temp\\capture.jpg" },
    });
  });

  it("groups files and exposes recommended image formats without duplicates", () => {
    const file = fileItem("capture.png", ".png");
    const options = workflow.groupedFormatOptions(file);
    const formats = [...options.recommended, ...options.other].map((intent) => intent.target.format);

    expect(workflow.fileGroupId(file)).toBe("images");
    expect(options.recommended.map((intent) => intent.target.format)).toEqual(
      expect.arrayContaining(["jpg", "png", "webp"]),
    );
    expect(new Set(formats).size).toBe(formats.length);
  });

  it("deduplicates intents by format and keeps the strongest priority ordering", () => {
    const jpg = fileItem("capture.png", ".png").targets.find((target) => target.format === "jpg")!;
    const webp = fileItem("capture.png", ".png").targets.find((target) => target.format === "webp")!;
    const intents: ConversionIntent[] = [
      intent(jpg, 40),
      intent(webp, 20),
      intent(jpg, 10),
    ];

    expect(workflow.uniqueIntents(intents).map(({ target, priority }) => [target.format, priority])).toEqual([
      ["jpg", 10],
      ["webp", 20],
    ]);
  });
});

describe("conversion concurrency and workflow transitions", () => {
  it("limits video and heavy batches while using available capacity for light files", () => {
    const lightImages = [1, 2, 3].map((index) => fileItem(`capture-${index}.png`, ".png", 1_024));
    const videos = [1, 2, 3].map((index) => fileItem(`clip-${index}.mp4`, ".mp4", 80 * 1024 * 1024));
    const heavyVideos = videos.map((file) => ({ ...file, size: 900 * 1024 * 1024 }));

    expect(workflow.conversionConcurrency(lightImages)).toBe(3);
    expect(workflow.conversionConcurrency(videos)).toBe(2);
    expect(workflow.conversionConcurrency(heavyVideos)).toBe(1);
    expect(workflow.conversionConcurrency(lightImages.slice(0, 1))).toBe(1);
  });

  it("never exceeds the requested worker count and processes every item", async () => {
    let active = 0;
    let peak = 0;
    const completed: number[] = [];

    await workflow.runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      completed.push(item);
      active -= 1;
    });

    expect(peak).toBe(2);
    expect(completed.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("distinguishes cached, pending and cleaned-output transitions", () => {
    const done = fileItem("capture.png", ".png", 1_024, {
      selectedFormat: "jpg",
      convertedFormat: "jpg",
      status: "done",
      progress: 100,
      result: { outputPath: "C:\\Temp\\capture.jpg" },
    });
    const pending = { ...done, status: "ready" as const, convertedFormat: null, result: null };

    expect(workflow.isConvertedForSelection(done)).toBe(true);
    expect(workflow.shouldConvertFile(done)).toBe(false);
    expect(workflow.shouldConvertFile(pending)).toBe(true);
    expect(workflow.shouldReconvertCleanedResult(done, true)).toBe(true);
    expect(workflow.shouldReconvertCleanedResult(done, false)).toBe(false);
    expect(workflow.getConvertedOutputPaths([pending, done])).toEqual(["C:\\Temp\\capture.jpg"]);
  });

  it("sends native cancellation only for jobs that have actually started", () => {
    const queued = fileItem("queued.png", ".png", 1_024, {
      selectedFormat: "jpg",
      status: "queued",
    });
    const working = fileItem("working.png", ".png", 1_024, {
      selectedFormat: "jpg",
      status: "working",
    });
    expect(workflow.nativeCancellationJobs([queued, working])).toEqual([working]);
  });
});

describe("large conversion collections", () => {
  it("keeps supported and unsupported files stable while prioritizing supported files", () => {
    const unsupportedA = fileItem("unsupported-a.xyz", ".xyz", 1_024, { status: "unsupported", targets: [] });
    const supportedA = fileItem("supported-a.png", ".png");
    const unsupportedB = fileItem("unsupported-b.xyz", ".xyz", 1_024, { status: "unsupported", targets: [] });
    const supportedB = fileItem("supported-b.png", ".png");

    expect(largeList.stablePartitionBySupport([
      unsupportedA,
      supportedA,
      unsupportedB,
      supportedB,
    ]).map((file) => file.id)).toEqual([
      supportedA.id,
      supportedB.id,
      unsupportedA.id,
      unsupportedB.id,
    ]);
  });

  it("removes every unsupported file in one pass", () => {
    const supported = fileItem("supported.png", ".png");
    const unsupported = fileItem("unsupported.xyz", ".xyz", 1_024, { status: "unsupported", targets: [] });

    expect(largeList.withoutUnsupportedFiles([unsupported, supported, unsupported]))
      .toEqual([supported]);
  });

  it("mounts only a bounded window for 2,000 output rows", () => {
    expect(largeList.calculateVirtualWindow({
      itemCount: 2_000,
      scrollTop: 92 * 1_200,
      viewportHeight: 460,
      rowHeight: 92,
    })).toEqual({
      startIndex: 1_196,
      endIndex: 1_209,
      offsetTop: 92 * 1_196,
      totalHeight: 92 * 2_000,
    });

    const lastWindow = largeList.calculateVirtualWindow({
      itemCount: 2_000,
      scrollTop: Number.MAX_SAFE_INTEGER,
      viewportHeight: 460,
      rowHeight: 92,
    });
    expect(lastWindow.endIndex).toBe(2_000);
    expect(lastWindow.endIndex - lastWindow.startIndex).toBeLessThan(20);
  });

  it("mounts only visible file-card rows for 2,000 imports", () => {
    const window = largeList.calculateVirtualGridWindow({
      itemCount: 2_000,
      scrollTop: 144 * 200,
      viewportHeight: 420,
      viewportWidth: 1_128,
      rowHeight: 144,
      minimumColumnWidth: 270,
      gap: 12,
      overscan: 1,
    });
    expect(window.columnCount).toBe(4);
    expect(window.endItemIndex - window.startItemIndex).toBeLessThanOrEqual(20);
    expect(window.endItemIndex).toBeLessThan(2_000);
  });

  it("enforces one global 2,000-file capacity across repeated imports", () => {
    const existing = Array.from({ length: 1_999 }, (_, index) => ({ path: `C:\\input\\${index}.txt` }));
    const selection = largeList.selectUniqueImports(existing, [
      { path: "C:\\input\\new-a.txt" },
      { path: "C:\\input\\new-b.txt" },
      { path: existing[0].path },
    ]);
    expect(selection.accepted.map(({ path }) => path)).toEqual(["C:\\input\\new-a.txt"]);
    expect(selection.rejected).toBe(1);
  });

  it("promotes a prior isolated import to deterministic folder provenance", () => {
    const isolated = {
      kind: "file" as const,
      rootId: "isolated",
      rootName: "rapport.docx",
      relativePath: "rapport.docx",
    };
    const folder = {
      kind: "folder" as const,
      rootId: "folder-work",
      rootName: "travail",
      relativePath: "documents/rapport.docx",
    };
    expect(largeList.preferredImportOrigin(isolated, folder)).toEqual(folder);
    expect(largeList.preferredImportOrigin(folder, isolated)).toEqual(folder);
  });

  it("filters output statuses without mutating the source order", () => {
    const working = fileItem("working.png", ".png", 1_024, { status: "working" });
    const done = fileItem("done.png", ".png", 1_024, { status: "done" });
    const error = fileItem("error.png", ".png", 1_024, { status: "error" });
    const files = [working, done, error];

    expect(largeList.filterOutputFiles(files, "running")).toEqual([working]);
    expect(largeList.filterOutputFiles(files, "done")).toEqual([done]);
    expect(largeList.filterOutputFiles(files, "errors")).toEqual([error]);
    expect(files).toEqual([working, done, error]);
  });

  it("batches 2,000 native progress updates into one indexed state replacement", () => {
    const files = Array.from({ length: 2_000 }, (_, index) => fileItem(
      `batch-${index}.png`,
      ".png",
      1_024,
      { jobId: `job-${index}`, status: "working" },
    ));
    const updated = largeList.applyProgressBatch(files, files.map((file, index) => ({
      jobId: file.jobId,
      progress: index % 101,
      phase: "phase.conversion",
    })));
    expect(updated).not.toBe(files);
    expect(updated).toHaveLength(2_000);
    expect(updated[1_999].progress).toBe(80);
    expect(largeList.applyProgressBatch(updated, [])).toBe(updated);
  });
});

describe("preview state fixtures", () => {
  it("builds the deterministic file capabilities used by preview workflows", () => {
    const file = makePreviewFile("note.md", ".md", 42);

    expect(file).toMatchObject({ categoryId: "documents", sourceFormat: "md", size: 42 });
    expect(file.targets.map((target) => target.format)).toEqual(["pdf", "html", "json"]);
    expect(file.targets.every((target) => target.engineAvailable)).toBe(true);
  });
});

function fileItem(
  name: string,
  extension: string,
  size = 1_024,
  patch: Partial<FileItem> = {},
): FileItem {
  const description = makePreviewFile(name, extension, size);
  return {
    ...description,
    id: `file-${name}`,
    jobId: `job-${name}`,
    selectedFormat: null,
    progress: 0,
    phase: "phase.waiting",
    status: "pending",
    result: null,
    convertedFormat: null,
    error: null,
    ...patch,
  };
}

function intent(target: TargetFormat, priority: number): ConversionIntent {
  return {
    id: `${target.format}-${priority}`,
    labelKey: "format.intent.other",
    target,
    priority,
  };
}
