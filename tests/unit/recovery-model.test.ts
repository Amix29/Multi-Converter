import { describe, expect, it } from "vitest";
import { recoveryPlan, restoredFiles } from "../../src/app/conversion/recoveryModel";
import { makePreviewFile } from "../../src/lib/api/previewFixtures";
import type { FileItem } from "../../src/app/types";

describe("batch recovery plans", () => {
  it("retains selections without carrying results, contents or error messages into the plan", () => {
    const source: FileItem = { ...makePreviewFile("source.mov", ".mov", 123), id: "old", jobId: "old-job", selectedFormat: "mkv",
      mediaMode: "copy", progress: 100, phase: "done", status: "done", result: { outputPath: "/temporary/private-result.mkv" }, convertedFormat: "mkv", error: "private error" };
    const plan = recoveryPlan([source], "high");
    expect(plan.files[0]).toMatchObject({ path: source.path, mediaMode: "copy", targetFormat: "mkv" });
    expect(JSON.stringify(plan)).not.toContain("private");
    const [restored] = restoredFiles([source], plan);
    expect(restored).toMatchObject({ status: "ready", selectedFormat: "mkv", mediaMode: "copy", progress: 0, result: null, error: null, jobId: "" });
    expect(restored.id).not.toBe(source.id);
  });

  it("requires a new choice when the original target is no longer available", () => {
    const source = makePreviewFile("source.mov", ".mov", 123);
    const plan = { schemaVersion: 1 as const, qualityProfile: "high" as const, files: [{ path: source.path, targetFormat: "mkv", mediaMode: "copy" as const, importOrigin: null }] };
    const [restored] = restoredFiles([{ ...source, targets: source.targets.filter((target) => target.format !== "mkv") }], plan);
    expect(restored).toMatchObject({ selectedFormat: null, status: "pending", mediaMode: "convert", result: null });
  });
});
