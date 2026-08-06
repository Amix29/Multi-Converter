import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  api,
  type PdfEditPatchV1,
  type PdfEditableCopyResultV1,
  type PdfEditorSessionV1,
  type PdfObjectV1,
  type PdfPageV1,
  type PdfSaveResultV1,
} from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { useEditorFocusMode } from "../editor/useEditorFocusMode";
import { PdfEditorToolbar } from "./PdfEditorToolbar";
import { PdfDiscardDialog } from "./PdfDiscardDialog";
import { PdfDigitizeGate } from "./PdfDigitizeGate";
import { PdfInspector, type PdfActiveContentFinding } from "./PdfInspector";
import { PdfPageCanvas } from "./PdfPageCanvas";
import {
  canEditPdfObject,
  canApplyPdfPatch,
  canTransformPdfObject,
  clampPage,
  createPdfPatch,
  mergePdfPatch,
  pdfOcrBlocksToPage,
  transformPdfBounds,
  type PdfPatchOperation,
  type PdfPatchValues,
} from "./pdfEditorModel";
import {
  applyOptimisticPagePatch,
  createPdfPageOrder,
  duplicatePageSelector,
  hydrateLogicalPage,
  insertPageSelector,
  pageSelector,
} from "./pdfPageModel";
import {
  loadPdfLogicalWindow,
  replacePdfBackgrounds,
  type PdfBackgroundEntry,
} from "./pdfPageLoader";
import "./pdf-editor.css";
import { usePdfDigitization } from "./usePdfDigitization";

interface PdfEditorProps {
  language: LanguageCode;
  session: PdfEditorSessionV1;
  onClose(): void;
  onNotice(tone: "info" | "success" | "error", message: string): void;
}

export function PdfEditor(props: PdfEditorProps) {
  const [session, setSession] = useState(props.session);
  const [activePage, setActivePage] = useState(1);
  const [pageOrder, setPageOrder] = useState(() => createPdfPageOrder(props.session.pageCount));
  const [pages, setPages] = useState<PdfPageV1[]>([]);
  const [pageRevision, setPageRevision] = useState(0);
  const [backgrounds, setBackgrounds] = useState<Map<number, PdfBackgroundEntry>>(() => new Map());
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeContentFindings, setActiveContentFindings] = useState<PdfActiveContentFinding[]>([]);
  const [patches, setPatches] = useState<PdfEditPatchV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const [confirmClose, setConfirmClose] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const requestId = useRef(0);
  const ocrJobRef = useRef<string | null>(null);
  const committedSessionRef = useRef(props.session);
  const pageOrderRef = useRef(pageOrder);
  const patchesRef = useRef(patches);
  const backgroundRef = useRef(backgrounds);
  const { focusMode, focusButtonRef, toggleFocusMode } = useEditorFocusMode();
  const scanLocked = session.contentKind === "scanned";
  const effectiveSession = useMemo(() => scanLocked ? {
    ...session,
    permissions: {
      ...session.permissions,
      canModify: false,
      canAnnotate: false,
      canFillForms: false,
      canAssemble: false,
    },
  } : session, [scanLocked, session]);
  const digitization = usePdfDigitization({
    language: props.language,
    session,
    onRebase: rebaseEditor,
    onNotice: props.onNotice,
  });

  useEffect(() => { backgroundRef.current = backgrounds; }, [backgrounds]);
  useEffect(() => { pageOrderRef.current = pageOrder; }, [pageOrder]);
  useEffect(() => { patchesRef.current = patches; }, [patches]);
  useEffect(() => () => {
    for (const entry of backgroundRef.current.values()) URL.revokeObjectURL(entry.url);
  }, []);

  const loadWindow = useCallback(async (page: number) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const window = await loadPdfLogicalWindow(session, pageOrderRef.current, page);
      if (currentRequest !== requestId.current) return;
      const optimistic = patchesRef.current.reduce(optimisticPages, window.pages);
      setPages(optimistic);
      setActiveContentFindings((current) => mergeActiveContentFindings(current, window.pages));
      setPageOrder((current) => window.pages.reduce((order, inspected) => {
        const logical = order[inspected.pageNumber - 1];
        return logical ? hydrateLogicalPage(order, logical.pageId, inspected) : order;
      }, current));
      setSelectedObjectId(null);
      setBackgrounds((current) => replacePdfBackgrounds(current, window.renders));
    } catch (cause) {
      if (currentRequest === requestId.current) setError(pdfError(cause));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadWindow(activePage); }, [activePage, loadWindow, pageRevision]);

  const selectedObject = useMemo(
    () => pages.flatMap((page) => page.objects).find((object) => object.objectId === selectedObjectId) ?? null,
    [pages, selectedObjectId],
  );

  function page(number: number) {
    setActivePage(clampPage(number, pageOrderRef.current.length));
  }

  function queueObjectPatch(
    operation: PdfPatchOperation,
    object: PdfObjectV1,
    values: PdfPatchValues = {},
  ) {
    if (!canEditPdfObject(effectiveSession.permissions, object)
      || !canApplyPdfPatch(effectiveSession.permissions, operation)) return;
    const patch = createPdfPatch(operation, activePage, object.objectId, values);
    setPatches((current) => mergePdfPatch(current, patch));
    setPages((current) => optimisticPages(current, patch));
    if (operation === "deleteObject" || operation === "deleteAnnotation") setSelectedObjectId(null);
  }

  function queuePagePatch(operation: PdfPatchOperation, values: PdfPatchValues = {}) {
    if (!canApplyPdfPatch(effectiveSession.permissions, operation)) return;
    const logical = pageOrderRef.current[activePage - 1];
    if (!logical) return;
    const generatedId = `local-${crypto.randomUUID()}`;
    const selector = operation === "insertPage"
      ? insertPageSelector(generatedId)
      : operation === "duplicatePage"
        ? duplicatePageSelector(logical.pageId, generatedId)
        : pageSelector(logical.pageId);
    const patch = createPdfPatch(operation, activePage, selector, values);
    setPatches((current) => mergePdfPatch(current, patch));
    if (["insertPage", "duplicatePage", "movePage", "deletePage", "rotatePage"].includes(operation)) {
      const update = applyOptimisticPagePatch(pageOrderRef.current, activePage, patch);
      pageOrderRef.current = update.pages;
      setPageOrder(update.pages);
      setSession((current) => ({ ...current, pageCount: update.pages.length }));
      setActivePage(update.activePage);
      setPageRevision((current) => current + 1);
    }
  }

  async function pickPdfImage(object?: PdfObjectV1) {
    try {
      const path = (await api.pickFilePaths())[0];
      if (!path) return;
      if (!/\.(?:png|jpe?g|webp|bmp|tiff?)$/i.test(path)) {
        props.onNotice("error", t(props.language, "pdfEditor.imageRequired"));
        return;
      }
      if (object) {
        queueObjectPatch("replaceImage", object, { imagePath: path });
        return;
      }
      const active = pages.find((item) => item.pageNumber === activePage);
      if (!active) return;
      queuePagePatch("insertImage", {
        imagePath: path,
        bounds: {
          x: active.widthPoints * 0.2,
          y: active.heightPoints * 0.35,
          width: active.widthPoints * 0.6,
          height: active.heightPoints * 0.3,
        },
      });
    } catch (cause) {
      props.onNotice("error", pdfError(cause));
    }
  }

  async function recognizePage() {
    const active = pages.find((item) => item.pageNumber === activePage);
    const logical = pageOrderRef.current[activePage - 1];
    if (!active || !logical || logical.sourcePageNumber === null || ocrJobRef.current) return;
    const jobId = `pdf-editor-${crypto.randomUUID()}`;
    ocrJobRef.current = jobId;
    setOcrProgress(0);
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await api.onOcrProgress((payload) => {
        if (payload.jobId === jobId) setOcrProgress(payload.progress);
      });
      const result = await api.pdfEditorRecognizePage(
        session.sessionId,
        session.sourceSha256,
        logical.sourcePageNumber,
        jobId,
      );
      if (ocrJobRef.current !== jobId) return;
      const ocrBlocks = pdfOcrBlocksToPage(active, result.pages[0]);
      if (!ocrBlocks.length) {
        props.onNotice("info", t(props.language, "pdfEditor.ocrEmpty"));
        return;
      }
      queuePagePatch("addOcrTextLayer", { ocrBlocks });
      props.onNotice("success", t(props.language, "pdfEditor.ocrLayerReady", { count: ocrBlocks.length }));
    } catch (cause) {
      if (ocrJobRef.current === jobId) props.onNotice("error", pdfError(cause));
    } finally {
      unlisten?.();
      if (ocrJobRef.current === jobId) {
        ocrJobRef.current = null;
        setOcrProgress(null);
      }
    }
  }

  async function cancelPageOcr() {
    const jobId = ocrJobRef.current;
    if (!jobId) return;
    ocrJobRef.current = null;
    setOcrProgress(null);
    try {
      await api.cancelOcr(jobId);
    } catch (cause) {
      props.onNotice("error", pdfError(cause));
    }
  }

  async function saveAs() {
    if (!patches.length) {
      props.onNotice("info", t(props.language, "pdfEditor.emptyPatches"));
      return;
    }
    setSaving(true);
    try {
      const result = await api.pdfEditorSaveAs(
        session.sessionId,
        session.sourceSha256,
        patches,
        null,
      );
      if (!result) return;
      verifySaveResult(result, session);
      rebaseEditor(result.rebasedSession);
      props.onNotice(
        result.hadExistingSignatures ? "info" : "success",
        t(props.language, result.hadExistingSignatures
          ? "pdfEditor.signatureValidityNotChecked"
          : "pdfEditor.saveSuccess"),
      );
    } catch (cause) {
      props.onNotice("error", pdfError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function createEditableCopy() {
    if (patches.length) {
      props.onNotice("info", t(props.language, "pdfEditor.editableCopyPendingBlocked"));
      return;
    }
    setSaving(true);
    try {
      const result = await api.pdfEditorCreateEditableCopy(
        session.sessionId,
        session.sourceSha256,
        null,
      );
      if (!result) return;
      verifyEditableCopyResult(result, session);
      rebaseEditor(result.rebasedSession);
      props.onNotice("success", t(props.language, "pdfEditor.editableCopyCreated"));
    } catch (cause) {
      props.onNotice("error", pdfError(cause));
    } finally {
      setSaving(false);
    }
  }

  function rebaseEditor(rebasedSession: PdfEditorSessionV1) {
    committedSessionRef.current = rebasedSession;
    const rebasedOrder = createPdfPageOrder(rebasedSession.pageCount);
    pageOrderRef.current = rebasedOrder;
    setSession(rebasedSession);
    setPageOrder(rebasedOrder);
    setActivePage((current) => clampPage(current, rebasedOrder.length));
    setPatches([]);
    setSelectedObjectId(null);
    setActiveContentFindings([]);
    setPages([]);
    setPageRevision((current) => current + 1);
  }

  function close() {
    if (patches.length) {
      setConfirmClose(true);
      return;
    }
    props.onClose();
  }

  if (error && !pages.length) {
    return <div className="pdf-editor-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadWindow(activePage)}>{t(props.language, "ocr.retry")}</button></div>;
  }

  return (
    <div className={`pdf-editor-shell ${focusMode ? "is-focus-mode" : ""}`} data-density="compact">
      <PdfEditorToolbar
        language={props.language}
        session={session}
        activePage={activePage}
        zoom={zoom}
        focusMode={focusMode}
        focusButtonRef={focusButtonRef}
        pendingPatchCount={patches.length}
        saving={saving}
        onClose={close}
        onPage={page}
        onZoom={setZoom}
        onRotate={() => queuePagePatch("rotatePage", { rotationDegrees: ((pages.find((item) => item.pageNumber === activePage)?.rotationDegrees ?? 0) + 90) % 360 })}
        onReset={() => {
          const committed = committedSessionRef.current;
          const resetOrder = createPdfPageOrder(committed.pageCount);
          pageOrderRef.current = resetOrder;
          setSession(committed);
          setPageOrder(resetOrder);
          setActivePage((current) => clampPage(current, resetOrder.length));
          setPatches([]);
          setPageRevision((current) => current + 1);
        }}
        onToggleFocus={toggleFocusMode}
        onSaveAs={() => void saveAs()}
      />
      <div className="pdf-editor-body">
        <main className="pdf-pages-viewport" aria-busy={loading}>
          <PdfDigitizeGate
            language={props.language}
            session={session}
            locked={digitization.locked}
            dialogOpen={digitization.dialogOpen}
            busy={digitization.busy}
            progress={digitization.progress}
            pageNumber={digitization.pageNumber}
            error={digitization.error}
            onOpen={digitization.open}
            onClose={digitization.close}
            onConfirm={() => void digitization.confirm()}
            onCancel={() => void digitization.cancel()}
          />
          {loading && <div className="pdf-window-loading" role="status">{t(props.language, "pdfEditor.rendering")}</div>}
          {error && <div className="pdf-window-error" role="alert">{error}</div>}
          <div className="pdf-pages-window">
            {pages.map((item) => (
              <PdfPageCanvas
                key={pageOrder[item.pageNumber - 1]?.pageId ?? item.pageNumber}
                language={props.language}
                page={item}
                backgroundUrl={backgrounds.get(item.pageNumber)?.url ?? null}
                zoom={zoom}
                selectedObjectId={selectedObjectId}
                isObjectEditable={(object) => canEditPdfObject(effectiveSession.permissions, object)}
                canTransformObject={(object) => canTransformPdfObject(effectiveSession.permissions, object)}
                onActivePage={page}
                onSelect={(object) => setSelectedObjectId(object?.objectId ?? null)}
                onTransform={(object, matrix) => queueObjectPatch("transformObject", object, { matrix })}
              />
            ))}
          </div>
        </main>
        <PdfInspector
          language={props.language}
          session={effectiveSession}
          activePage={pages.find((item) => item.pageNumber === activePage) ?? null}
          selectedObject={selectedObject}
          activeContentFindings={activeContentFindings}
          pendingPatchCount={patches.length}
          editableCopyBusy={saving}
          ocrProgress={ocrProgress}
          onObjectPatch={queueObjectPatch}
          onPagePatch={queuePagePatch}
          onInsertImage={() => void pickPdfImage()}
          onReplaceImage={(object) => void pickPdfImage(object)}
          onRecognizePage={() => void recognizePage()}
          onCancelOcr={() => void cancelPageOcr()}
          onCreateEditableCopy={() => void createEditableCopy()}
        />
      </div>
      {confirmClose && <PdfDiscardDialog
        language={props.language}
        onCancel={() => setConfirmClose(false)}
        onConfirm={props.onClose}
      />}
    </div>
  );
}

function verifySaveResult(result: PdfSaveResultV1, expected: PdfEditorSessionV1) {
  if (result.sourceSha256 !== expected.sourceSha256
    || result.rebasedSession.sessionId !== expected.sessionId
    || result.rebasedSession.sourceSha256.length !== 64
    || result.signatureValidity !== "not-cryptographically-checked") {
    throw new Error("PDF_EDITOR_SOURCE_CHANGED:La copie ne correspond pas à la session.");
  }
}

function verifyEditableCopyResult(result: PdfEditableCopyResultV1, expected: PdfEditorSessionV1) {
  if (result.sourceSha256 !== expected.sourceSha256
    || result.removedSignatureStructures < 1
    || result.rebasedSession.sessionId !== expected.sessionId
    || result.rebasedSession.sourceSha256.length !== 64
    || result.rebasedSession.signatures.length
    || result.rebasedSession.permissions.docMdpLevel !== null) {
    throw new Error("PDF_EDITOR_UNSIGNED_COPY_INVALID:La copie modifiable est incohérente.");
  }
}

function mergeActiveContentFindings(current: PdfActiveContentFinding[], pages: PdfPageV1[]) {
  const merged = new Map(current.map((finding) => [`${finding.pageNumber}:${finding.object.objectId}`, finding]));
  for (const page of pages) {
    for (const object of page.objects) {
      if (object.activeContent) merged.set(`${page.pageNumber}:${object.objectId}`, { pageNumber: page.pageNumber, object });
    }
  }
  return Array.from(merged.values()).sort((left, right) => left.pageNumber - right.pageNumber
    || left.object.objectId.localeCompare(right.object.objectId));
}

function optimisticPages(pages: PdfPageV1[], patch: PdfEditPatchV1) {
  return pages.map((page) => ({
    ...page,
    objects: page.objects.flatMap((object) => {
      if (object.objectId !== patch.objectId) return [object];
      if (patch.operation === "deleteObject" || patch.operation === "deleteAnnotation") return [];
      if (patch.operation === "setText" || patch.operation === "setAnnotationContents") return [{ ...object, text: patch.text }];
      if (patch.operation === "setFormValue") return [{ ...object, text: patch.text }];
      if (patch.operation === "setFillColor") return [{ ...object, fillColor: patch.color }];
      if (patch.operation === "setStrokeColor") return [{ ...object, strokeColor: patch.color }];
      if (patch.operation === "transformObject" && patch.matrix) return [{ ...object, bounds: transformPdfBounds(object.bounds, patch.matrix) }];
      return [object];
    }),
  })).map((page) => ({
    ...page,
    objects: reorderOptimisticObjects(page.objects, patch),
  }));
}

function reorderOptimisticObjects(objects: PdfObjectV1[], patch: PdfEditPatchV1) {
  if (!["moveObjectForward", "moveObjectBackward", "bringObjectFront", "sendObjectBack"].includes(patch.operation)) {
    return objects;
  }
  const index = objects.findIndex((object) => object.objectId === patch.objectId);
  if (index < 0) return objects;
  const next = objects.slice();
  const [selected] = next.splice(index, 1);
  if (!selected) return objects;
  const target = patch.operation === "moveObjectForward"
    ? Math.min(objects.length - 1, index + 1)
    : patch.operation === "moveObjectBackward"
      ? Math.max(0, index - 1)
      : patch.operation === "bringObjectFront" ? objects.length - 1 : 0;
  next.splice(target, 0, selected);
  return next;
}

function pdfError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^[A-Z][A-Z0-9_]+:/, "");
}
