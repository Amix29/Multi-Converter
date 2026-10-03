import { generateDocxFromLoadedAssets } from "./generateDocx";
import type { DocxWorkerRequest, DocxWorkerResponse } from "./docxWorkerProtocol";

interface WorkerScope {
  onmessage: ((event: MessageEvent<DocxWorkerRequest>) => void) | null;
  postMessage(message: DocxWorkerResponse, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.onmessage = (event) => {
  if (event.data.type !== "generate") return;
  void generate(event.data);
};

async function generate(request: DocxWorkerRequest): Promise<void> {
  try {
    post({ type: "progress", progress: 0.05 });
    const assets = request.assets.map((asset) => ({
      ...asset,
      bytes: new Uint8Array(asset.buffer),
    }));
    const result = await generateDocxFromLoadedAssets(
      request.document,
      assets,
      request.warnings,
      { onProgress: (progress) => post({ type: "progress", progress }) },
    );
    const buffer = exactBuffer(result.bytes);
    post({ type: "success", buffer, warnings: result.warnings }, [buffer]);
  } catch (error) {
    const failure = error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "Error", message: String(error) };
    post({ type: "failure", ...failure });
  }
}

function post(message: DocxWorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
