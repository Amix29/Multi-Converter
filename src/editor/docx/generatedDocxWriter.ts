import type {
  EditorCompatibilityWarning,
  EditorWriteRequest,
  EditorWriteResult,
  MultiConverterApi,
  GeneratedWriteMode,
} from "../../lib/api";
import { generateDocxOffThread } from "./docxWorkerClient";

export interface GeneratedDocxWriteOptions {
  signal?: AbortSignal;
  onProgress?(progress: number): void;
}

export async function writeGeneratedDocx(
  api: MultiConverterApi,
  request: EditorWriteRequest,
  mode: GeneratedWriteMode,
  options: GeneratedDocxWriteOptions = {},
): Promise<EditorWriteResult | null> {
  if (request.targetFormat !== "docx") throw new Error("EDITOR_GENERATED_FORMAT_UNSUPPORTED:Le générateur direct accepte uniquement DOCX.");
  options.signal?.throwIfAborted();
  options.onProgress?.(0.01);
  const generated = await generateDocxOffThread(request.document, api.editorReadAsset, {
    signal: options.signal,
    onProgress: (progress) => options.onProgress?.(0.01 + 0.59 * progress),
  });
  options.signal?.throwIfAborted();
  const generatedRequest: EditorWriteRequest = {
    ...request,
    document: {
      ...request.document,
      warnings: mergeWarnings(request.document.warnings, generated.warnings),
    },
  };
  options.onProgress?.(0.6);

  if (!isTauriRuntime()) {
    const result = mode === "save" && generatedRequest.document.source
      ? await api.editorSaveDocument(generatedRequest)
      : mode === "saveAs"
        ? await api.editorSaveAs(generatedRequest)
        : await api.editorExportDocument(generatedRequest);
    options.onProgress?.(1);
    return result;
  }

  const session = await api.editorBeginGeneratedWrite({ request: generatedRequest, mode });
  if (!session) return null;
  let abortPromise: Promise<boolean> | null = null;
  const abort = () => {
    abortPromise ??= api.editorAbortGeneratedWrite(session.sessionId).catch(() => false);
    return abortPromise;
  };
  const onAbort = () => { void abort(); };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    options.signal?.throwIfAborted();
    let offset = 0;
    while (offset < generated.bytes.byteLength) {
      options.signal?.throwIfAborted();
      const end = Math.min(generated.bytes.byteLength, offset + session.chunkSize);
      const chunk = generated.bytes.subarray(offset, end);
      const written = await api.editorAppendGeneratedWrite(
        session.sessionId,
        offset,
        Array.from(chunk),
      );
      if (written !== end) throw new Error("EDITOR_GENERATED_OFFSET_INVALID:Le moteur natif n’a pas confirmé tout le bloc DOCX.");
      offset = end;
      options.onProgress?.(0.6 + 0.36 * offset / generated.bytes.byteLength);
    }
    options.signal?.throwIfAborted();
    const result = await api.editorCommitGeneratedWrite(session.sessionId);
    options.onProgress?.(1);
    return result;
  } catch (error) {
    await abort();
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function mergeWarnings(
  existing: EditorCompatibilityWarning[],
  generated: Array<{ code: string; message: string }>,
): EditorCompatibilityWarning[] {
  const output = [...existing];
  for (const warning of generated) {
    if (output.some((item) => item.code === warning.code && item.message === warning.message)) continue;
    output.push({ ...warning, blocksOverwrite: false });
  }
  return output;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
