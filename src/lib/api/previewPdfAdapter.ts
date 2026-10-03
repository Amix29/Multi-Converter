import type { MultiConverterApi, OcrProgressV1 } from "./contracts";
import {
  PREVIEW_PDF_SHA256,
  previewPdfDigitizeResult,
  previewPdfEditableCopyResult,
  previewPdfOcrResult,
  previewPdfPage,
  previewPdfSaveResult,
  previewPdfSession,
  previewPdfSvg,
} from "./previewPdfFixtures";

type PdfMethods = Pick<
  MultiConverterApi,
  | "pdfEditorOpen"
  | "pdfEditorInspectPages"
  | "pdfEditorRenderPage"
  | "pdfEditorRecognizePage"
  | "pdfEditorDigitize"
  | "pdfEditorSaveAs"
  | "pdfEditorCreateEditableCopy"
  | "pdfEditorClose"
>;

export function createPreviewPdfController(
  params: URLSearchParams,
  ocrListeners: Set<(payload: OcrProgressV1) => void>,
  canceledJobs: Set<string>,
) {
  let open = false;
  let hash = PREVIEW_PDF_SHA256;
  let pageCount = 8;
  let saveGeneration = 0;
  let docMdp = params.get("mockPdfDocMdp");
  let contentKind: "digital" | "scanned" | "digitized" = "digital";

  const methods: PdfMethods = {
    async pdfEditorOpen(sourcePath, password) {
      if (params.get("mockEncryptedPdf") === "1" && !password) {
        throw new Error("PDF_EDITOR_PASSWORD_REQUIRED:Ce PDF requiert un mot de passe.");
      }
      if (params.get("mockEncryptedPdf") === "1" && password !== "vellum") {
        throw new Error("PDF_EDITOR_PASSWORD_INVALID:Le mot de passe est incorrect.");
      }
      open = true;
      hash = PREVIEW_PDF_SHA256;
      pageCount = 8;
      saveGeneration = 0;
      docMdp = params.get("mockPdfDocMdp");
      contentKind = params.get("mockScannedPdf") === "1" ? "scanned" : "digital";
      return previewPdfSession(
        sourcePath.split(/[\\/]/).pop() || "Contrat-local.pdf",
        hash,
        pageCount,
        docMdp,
        contentKind,
      );
    },
    async pdfEditorInspectPages(_sessionId, sourceSha256, pageStart, requestedCount) {
      ensureHash(sourceSha256, hash);
      const end = Math.min(pageCount, pageStart + requestedCount - 1);
      return {
        schemaVersion: 1,
        sourceSha256,
        pageCount,
        pages: Array.from({ length: Math.max(0, end - pageStart + 1) }, (_, index) =>
          previewPdfPage(pageStart + index, contentKind === "scanned")),
      };
    },
    async pdfEditorRenderPage(_sessionId, sourceSha256, pageNumber) {
      ensureHash(sourceSha256, hash);
      return {
        schemaVersion: 1,
        sourceSha256,
        pageNumber,
        mimeType: "image/svg+xml",
        bytes: Array.from(new TextEncoder().encode(previewPdfSvg(pageNumber))),
        widthPoints: 595,
        heightPoints: 842,
      };
    },
    async pdfEditorRecognizePage(_sessionId, sourceSha256, pageNumber, jobId) {
      ensureHash(sourceSha256, hash);
      ocrListeners.forEach((listener) => listener({
        schemaVersion: 1,
        jobId,
        progress: 72,
        phase: "recognizing",
        pageNumber,
        pageCount: 1,
      }));
      if (params.get("mockSlowOcr") === "1") {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
      if (canceledJobs.delete(jobId)) throw new Error("OCR annulé");
      return previewPdfOcrResult(pageNumber, jobId);
    },
    async pdfEditorDigitize(_sessionId, sourceSha256, patches, attemptedPages) {
      ensureHash(sourceSha256, hash);
      const expectedPages = Array.from({ length: pageCount }, (_, index) => index + 1);
      if (contentKind !== "scanned"
        || attemptedPages.join(",") !== expectedPages.join(",")
        || !patches.length
        || patches.some((patch) => patch.operation !== "addOcrTextLayer")) {
        throw new Error("PDF_EDITOR_DIGITIZE_INVALID:La numérisation est incomplète.");
      }
      saveGeneration += 1;
      const sourceHash = hash;
      hash = saveGeneration.toString(16).padStart(64, "d").slice(-64);
      contentKind = "digitized";
      return previewPdfDigitizeResult(
        sourceHash,
        hash,
        pageCount,
        new Set(patches.map((patch) => patch.pageNumber)).size,
      );
    },
    async pdfEditorSaveAs(_sessionId, sourceSha256, patches) {
      if (params.get("mockPdfSaveCancel") === "1") return null;
      ensureHash(sourceSha256, hash);
      pageCount = patches.reduce((count, patch) => {
        if (patch.operation === "insertPage" || patch.operation === "duplicatePage") return count + 1;
        if (patch.operation === "deletePage") return Math.max(1, count - 1);
        return count;
      }, pageCount);
      saveGeneration += 1;
      const sourceHash = hash;
      hash = saveGeneration.toString(16).padStart(64, "a").slice(-64);
      return previewPdfSaveResult(sourceHash, hash, pageCount, patches.length, docMdp, contentKind);
    },
    async pdfEditorCreateEditableCopy(_sessionId, sourceSha256) {
      if (params.get("mockPdfEditableCopyCancel") === "1") return null;
      ensureHash(sourceSha256, hash);
      if (docMdp === null) {
        throw new Error("PDF_EDITOR_UNSIGNED_COPY_NOT_SIGNED:Ce PDF ne contient aucune signature ou restriction DocMDP.");
      }
      saveGeneration += 1;
      const sourceHash = hash;
      hash = saveGeneration.toString(16).padStart(64, "b").slice(-64);
      docMdp = null;
      return previewPdfEditableCopyResult(sourceHash, hash, pageCount);
    },
    async pdfEditorClose() {
      open = false;
      return true;
    },
  };

  return { isOpen: () => open, methods };
}

function ensureHash(candidate: string, expected: string) {
  if (candidate !== expected) {
    throw new Error("PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé.");
  }
}
