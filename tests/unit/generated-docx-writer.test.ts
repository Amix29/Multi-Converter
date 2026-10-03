import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorDocumentV1, EditorWriteResult, MultiConverterApi } from "../../src/lib/api";

vi.mock("../../src/editor/docx/docxWorkerClient", () => ({
  generateDocxOffThread: vi.fn(),
}));

import { generateDocxOffThread } from "../../src/editor/docx/docxWorkerClient";
import { writeGeneratedDocx } from "../../src/editor/docx/generatedDocxWriter";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("generated DOCX writer cancellation", () => {
  it("sends native cancellation while commit validation is still pending", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.mocked(generateDocxOffThread).mockResolvedValue({
      bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]),
      warnings: [],
    });
    let rejectCommit: ((reason: Error) => void) | undefined;
    const commit = vi.fn(() => new Promise<EditorWriteResult>((_resolve, reject) => {
      rejectCommit = reject;
    }));
    const abort = vi.fn(async () => {
      rejectCommit?.(new Error("EDITOR_GENERATED_CANCELLED:test"));
      return true;
    });
    const api = {
      editorReadAsset: vi.fn(),
      editorBeginGeneratedWrite: vi.fn().mockResolvedValue({ sessionId: "session-1", chunkSize: 4 }),
      editorAppendGeneratedWrite: vi.fn(async (_id: string, offset: number, bytes: number[]) => offset + bytes.length),
      editorCommitGeneratedWrite: commit,
      editorAbortGeneratedWrite: abort,
    } as unknown as MultiConverterApi;
    const controller = new AbortController();
    const writing = writeGeneratedDocx(api, {
      document: documentFixture(),
      targetFormat: "docx",
    }, "export", { signal: controller.signal });
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce());

    controller.abort(new DOMException("cancelled", "AbortError"));

    await expect(writing).rejects.toThrow("EDITOR_GENERATED_CANCELLED");
    expect(abort).toHaveBeenCalledWith("session-1");
  });
});

function documentFixture(): EditorDocumentV1 {
  return {
    schemaVersion: 1,
    id: "7c16d176-5877-4c47-9717-b44bf9354407",
    title: "Annulation DOCX",
    source: null,
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "test" }] }] },
    header: null,
    footer: null,
    page: {
      format: "a4",
      orientation: "portrait",
      marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
      numbering: "none",
    },
    assets: [],
    warnings: [],
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}
