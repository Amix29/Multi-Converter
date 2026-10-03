import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorDocumentV1 } from "../../src/lib/api";
import { MAX_GENERATED_DOCX_BYTES } from "../../src/editor/docx/docxAssets";
import { generateDocxOffThread } from "../../src/editor/docx/docxWorkerClient";
import type { DocxWorkerRequest, DocxWorkerResponse } from "../../src/editor/docx/docxWorkerProtocol";

function documentFixture(withAsset = false): EditorDocumentV1 {
  return {
    schemaVersion: 1,
    id: "b17536bf-c231-4dc5-9451-0f7b646082ce",
    title: "Worker DOCX",
    source: null,
    content: {
      type: "doc",
      content: withAsset
        ? [{ type: "documentImage", attrs: { assetId: "asset-1", width: "20mm", height: "20mm" } }]
        : [{ type: "paragraph", content: [{ type: "text", text: "Génération locale" }] }],
    },
    header: null,
    footer: null,
    page: {
      format: "a4",
      orientation: "portrait",
      marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
      numbering: "none",
    },
    assets: withAsset
      ? [{ id: "asset-1", name: "pixel.png", mimeType: "image/png", size: 3, width: 1, height: 1 }]
      : [],
    warnings: [],
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("DOCX worker client", () => {
  it("falls back to direct generation when Worker is unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    const progress: number[] = [];
    const result = await generateDocxOffThread(
      documentFixture(),
      async () => { throw new Error("unexpected asset read"); },
      { onProgress: (value) => progress.push(value) },
    );
    expect(result.bytes.slice(0, 2)).toEqual(Uint8Array.from([0x50, 0x4b]));
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(true);
  });

  it("transfers owned asset buffers to the worker without a second byte-array payload", async () => {
    const worker = installWorker(({ request, transfer, respond }) => {
      expect(request.assets).toHaveLength(1);
      expect(transfer).toEqual([request.assets[0].buffer]);
      expect(new Uint8Array(request.assets[0].buffer)).toEqual(Uint8Array.from([1, 2, 3]));
      const output = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]).buffer;
      respond({ type: "success", buffer: output, warnings: [] });
    });

    const result = await generateDocxOffThread(
      documentFixture(true),
      async () => ({ mimeType: "image/png", bytes: [1, 2, 3] }),
    );
    expect(result.bytes).toEqual(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));
    expect(worker.terminated).toBe(true);
  });

  it("rejects declared assets above 128 MiB before reading their bytes", async () => {
    vi.stubGlobal("Worker", undefined);
    const document = documentFixture(true);
    document.assets[0].size = MAX_GENERATED_DOCX_BYTES + 1;
    const readAsset = vi.fn(async () => ({ mimeType: "image/png", bytes: [1] }));
    await expect(generateDocxOffThread(document, readAsset)).rejects.toThrow("EDITOR_DOCX_SIZE_LIMIT");
    expect(readAsset).not.toHaveBeenCalled();
  });

  it("terminates the worker as soon as the AbortSignal is cancelled", async () => {
    const worker = installWorker(() => undefined);
    const controller = new AbortController();
    const pending = generateDocxOffThread(
      documentFixture(),
      async () => { throw new Error("unexpected asset read"); },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(worker.posted).toBe(true));
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(true);
  });
});

type WorkerHandler = (input: {
  request: DocxWorkerRequest;
  transfer: ArrayBuffer[];
  respond(response: DocxWorkerResponse): void;
}) => void;

function installWorker(handler: WorkerHandler) {
  class FakeWorker {
    onmessage: ((event: MessageEvent<DocxWorkerResponse>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminated = false;
    posted = false;

    postMessage(request: DocxWorkerRequest, transfer: ArrayBuffer[] = []) {
      this.posted = true;
      handler({
        request,
        transfer,
        respond: (response) => queueMicrotask(() => this.onmessage?.({ data: response } as MessageEvent<DocxWorkerResponse>)),
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  const instance = new FakeWorker();
  vi.stubGlobal("Worker", class {
    constructor() {
      return instance;
    }
  });
  return instance;
}
