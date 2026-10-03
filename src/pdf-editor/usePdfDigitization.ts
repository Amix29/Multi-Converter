import { useEffect, useRef, useState } from "react";
import { api, type PdfEditPatchV1, type PdfEditorSessionV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { createPdfPatch, pdfOcrBlocksToPage } from "./pdfEditorModel";

interface UsePdfDigitizationOptions {
  language: LanguageCode;
  session: PdfEditorSessionV1;
  onRebase(session: PdfEditorSessionV1): void;
  onNotice(tone: "info" | "success" | "error", message: string): void;
}

export function usePdfDigitization(options: UsePdfDigitizationOptions) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pageNumber, setPageNumber] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const jobRef = useRef<string | null>(null);
  const pageRef = useRef(0);
  const canceledRef = useRef(false);

  useEffect(() => () => {
    canceledRef.current = true;
    if (jobRef.current) void api.cancelOcr(jobRef.current);
  }, []);

  function open() {
    setError(null);
    setDialogOpen(true);
  }

  function close() {
    if (!busy) setDialogOpen(false);
  }

  async function confirm() {
    if (busy || options.session.contentKind !== "scanned") return;
    canceledRef.current = false;
    setBusy(true);
    setError(null);
    setProgress(0);
    const patches: PdfEditPatchV1[] = [];
    const attemptedPages: number[] = [];
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await api.onOcrProgress((payload) => {
        if (payload.jobId !== jobRef.current) return;
        const completed = Math.max(0, pageRef.current - 1);
        setProgress(((completed + payload.progress / 100) / options.session.pageCount) * 100);
      });
      for (let page = 1; page <= options.session.pageCount; page += 1) {
        if (canceledRef.current) throw new Error("PDF_EDITOR_DIGITIZE_CANCELED");
        setPageNumber(page);
        pageRef.current = page;
        const window = await api.pdfEditorInspectPages(
          options.session.sessionId,
          options.session.sourceSha256,
          page,
          1,
        );
        const inspected = window.pages[0];
        if (!inspected) throw new Error("PDF_EDITOR_DIGITIZE_PAGE:Page PDF absente.");
        const jobId = `pdf-digitize-${crypto.randomUUID()}`;
        jobRef.current = jobId;
        const result = await api.pdfEditorRecognizePage(
          options.session.sessionId,
          options.session.sourceSha256,
          page,
          jobId,
        );
        attemptedPages.push(page);
        const blocks = pdfOcrBlocksToPage(inspected, result.pages[0]);
        if (blocks.length) {
          patches.push(createPdfPatch("addOcrTextLayer", page, `page=p${page}`, { ocrBlocks: blocks }));
        }
        setProgress((page / options.session.pageCount) * 100);
      }
      jobRef.current = null;
      if (!patches.length) throw new Error(t(options.language, "pdfEditor.digitizeEmpty"));
      const digitized = await api.pdfEditorDigitize(
        options.session.sessionId,
        options.session.sourceSha256,
        patches,
        attemptedPages,
      );
      verifyDigitizeResult(digitized, options.session);
      options.onRebase(digitized.rebasedSession);
      options.onNotice("success", t(options.language, "pdfEditor.digitizeSuccess", {
        count: digitized.recognizedPages,
      }));
      setDialogOpen(false);
    } catch (cause) {
      if (!canceledRef.current) setError(pdfDigitizeError(cause));
    } finally {
      unlisten?.();
      jobRef.current = null;
      setBusy(false);
      setPageNumber(0);
      pageRef.current = 0;
      if (canceledRef.current) setProgress(0);
    }
  }

  async function cancel() {
    canceledRef.current = true;
    const jobId = jobRef.current;
    if (jobId) await api.cancelOcr(jobId).catch(() => false);
  }

  return {
    locked: options.session.contentKind === "scanned",
    dialogOpen,
    busy,
    progress,
    pageNumber,
    error,
    open,
    close,
    confirm,
    cancel,
  };
}

function verifyDigitizeResult(
  result: Awaited<ReturnType<typeof api.pdfEditorDigitize>>,
  source: PdfEditorSessionV1,
) {
  if (result.sourceSha256 !== source.sourceSha256
    || result.attemptedPages !== source.pageCount
    || result.recognizedPages < 1
    || result.rebasedSession.sessionId !== source.sessionId
    || result.rebasedSession.contentKind !== "digitized") {
    throw new Error("PDF_EDITOR_DIGITIZE_INVALID:La copie numérisée est incohérente.");
  }
}

function pdfDigitizeError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.replace(/^[A-Z][A-Z0-9_]+:/, "");
}
