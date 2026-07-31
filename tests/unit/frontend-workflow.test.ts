/// <reference types="vite/client" />

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { TargetFormat } from "../../src/lib/api";
import {
  createPreviewEditorState,
  makePreviewEditorDocument,
  makePreviewFile,
  removePreviewDocument,
  upsertPreviewDocument,
} from "../../src/lib/api/previewFixtures";
import type { ConversionIntent, FileItem } from "../../src/app/types";

let workflow: typeof import("../../src/app/conversion/model");

beforeAll(async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
  workflow = await import("../../src/app/conversion/model");
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
});

describe("preview state fixtures", () => {
  it("creates isolated editor state and immutably upserts then removes drafts", () => {
    const empty = createPreviewEditorState();
    const seeded = createPreviewEditorState(true);
    const document = makePreviewEditorDocument("Plan Phase 2");
    const withDocument = upsertPreviewDocument(empty.documents, document);
    document.title = "Mutation extérieure";

    expect(empty.documents).toEqual([]);
    expect(empty.assets.size).toBe(0);
    expect(seeded.documents).toHaveLength(1);
    expect(seeded.documents[0].title).toBe("Brouillon de test");
    expect(withDocument).toHaveLength(1);
    expect(withDocument[0].title).toBe("Plan Phase 2");
    expect(removePreviewDocument(withDocument, withDocument[0].id)).toEqual([]);
  });

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
