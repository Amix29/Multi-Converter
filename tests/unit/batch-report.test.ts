import { describe, expect, it } from "vitest";
import { batchReportRows } from "../../src/app/conversion/batchReport";
import { makePreviewFile } from "../../src/lib/api/previewFixtures";
import type { FileItem } from "../../src/app/types";

describe("local batch reports", () => {
  it("sends bounded metadata and output handles without source paths, contents or raw errors", () => {
    const file: FileItem = { ...makePreviewFile("source.mov", ".mov", 123), id: "file", jobId: "job",
      selectedFormat: "mkv", progress: 100, phase: "phase.done", status: "done", mediaMode: "copy",
      result: { outputPath: "/managed/result.mkv", mediaMode: "copy", qualityProfile: "high",
        warnings: [{ code: "track-warning", message: "private OCR content" }] }, convertedFormat: "mkv", error: "private error" };
    const rows = batchReportRows([file, { ...file, status: "error", result: null }, { ...file, selectedFormat: null }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sourceName: "source.mov", status: "done", qualityProfile: null, warningCodes: ["track-warning"] });
    expect(rows[1]).toMatchObject({ status: "error", outputPath: null });
    expect(JSON.stringify(rows)).not.toContain(file.path);
    expect(JSON.stringify(rows)).not.toContain("private");
  });
});
