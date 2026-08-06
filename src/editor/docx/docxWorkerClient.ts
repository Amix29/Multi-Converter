import type { EditorDocumentV1 } from "../../lib/api";
import { loadDocxAssets } from "./docxAssets";
import { generateDocx } from "./generateDocx";
import type { DocxWorkerAsset, DocxWorkerRequest, DocxWorkerResponse } from "./docxWorkerProtocol";
import type { AssetReader, DocxGenerationResult } from "./types";

export interface DocxWorkerGenerationOptions {
  signal?: AbortSignal;
  onProgress?(progress: number): void;
}

export async function generateDocxOffThread(
  document: EditorDocumentV1,
  readAsset: AssetReader,
  options: DocxWorkerGenerationOptions = {},
): Promise<DocxGenerationResult> {
  options.signal?.throwIfAborted();
  const worker = createDocxWorker();
  if (!worker) return generateDocx(document, readAsset, options);

  try {
    const loaded = await loadDocxAssets(document, readAsset, {
      signal: options.signal,
      onProgress: (progress) => options.onProgress?.(0.28 * progress),
    });
    options.signal?.throwIfAborted();
    const assets = loaded.assets.map(toWorkerAsset);
    const request: DocxWorkerRequest = {
      type: "generate",
      document,
      assets,
      warnings: loaded.warnings,
    };
    const transfer = assets.map((asset) => asset.buffer);
    return await waitForWorker(worker, request, transfer, options);
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

function createDocxWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./docxGeneration.worker.ts", import.meta.url), {
      type: "module",
      name: "multi-converter-docx",
    });
  } catch {
    return null;
  }
}

function waitForWorker(
  worker: Worker,
  request: DocxWorkerRequest,
  transfer: ArrayBuffer[],
  options: DocxWorkerGenerationOptions,
): Promise<DocxGenerationResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      callback();
    };
    const onAbort = () => finish(() => reject(abortReason(options.signal)));
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<DocxWorkerResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        options.onProgress?.(0.28 + 0.72 * clampProgress(response.progress));
        return;
      }
      if (response.type === "success") {
        finish(() => resolve({
          bytes: new Uint8Array(response.buffer),
          warnings: response.warnings,
        }));
        return;
      }
      const failure = new Error(response.message);
      failure.name = response.name;
      finish(() => reject(failure));
    };
    worker.onerror = (event) => {
      finish(() => reject(new Error(`EDITOR_DOCX_WORKER_FAILED:${event.message || "La génération DOCX a échoué."}`)));
    };
    try {
      worker.postMessage(request, transfer);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function toWorkerAsset(asset: Awaited<ReturnType<typeof loadDocxAssets>>["assets"][number]): DocxWorkerAsset {
  const buffer = asset.bytes.buffer as ArrayBuffer;
  return {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    buffer,
  };
}

function clampProgress(progress: number): number {
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}

function abortReason(signal?: AbortSignal): Error | DOMException {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("L’export DOCX a été annulé.", "AbortError");
}
