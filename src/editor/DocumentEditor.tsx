import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import FileHandler from "@tiptap/extension-file-handler";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { api, type EditorAssetStoreResult, type EditorDocumentV1, type EditorFormat } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { DocumentCommandRow } from "./DocumentCommandRow";
import { DocumentOperationDialog, type DocumentOperation } from "./DocumentOperationDialog";
import { EditorCanvas } from "./EditorCanvas";
import { EditorToolbar } from "./EditorToolbar";
import { HeaderFooterDialog } from "./HeaderFooterDialog";
import { isUntitledDocument, normalizedDocumentTitle } from "./documentNaming";
import { writeGeneratedDocx } from "./docx/generatedDocxWriter";
import { insertImageFiles } from "./editorAssets";
import { EditorColorPreview } from "./editorColorState";
import { DocumentImage, DocumentLayout, PageBreak, UnsupportedObject } from "./extensions";
import { sanitizeImportedHtml } from "./htmlSanitizer";
import { Pagination } from "./pagination";
import { ParagraphLineHeight } from "./paragraphLineHeight";
import { prepareDocumentForPdf } from "./pdfFontPolicy";
import { ResizableTableRow, TableResizeHandles } from "./tableResize";
import { useEditorFocusMode } from "./useEditorFocusMode";
import "./editor-table-resize.css";

interface DocumentEditorProps {
  language: LanguageCode;
  document: EditorDocumentV1;
  importedHtml: string | null;
  onDocument(document: EditorDocumentV1): void;
  onClose(): Promise<void> | void;
  onNotice(tone: "info" | "success" | "error", message: string): void;
}

export function DocumentEditor(props: DocumentEditorProps) {
  const [document, setDocument] = useState(props.document);
  const documentRef = useRef(document);
  const [dirty, setDirty] = useState(Boolean(props.importedHtml));
  const dirtyRef = useRef(dirty);
  const revisionRef = useRef(dirty ? 1 : 0);
  const saveInFlight = useRef<Promise<EditorDocumentV1 | null> | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportFormat, setExportFormat] = useState<EditorFormat>("md");
  const [searchOpen, setSearchOpen] = useState(false);
  const [headerFooter, setHeaderFooter] = useState<"header" | "footer" | null>(null);
  const [toolbarRevision, setToolbarRevision] = useState(0);
  const [operation, setOperation] = useState<DocumentOperation>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const pendingOverwrite = useRef<{ document: EditorDocumentV1; format: EditorFormat } | null>(null);
  const exportAbortController = useRef<AbortController | null>(null);
  const { focusMode, focusButtonRef, toggleFocusMode } = useEditorFocusMode();

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      TextStyleKit.configure({ lineHeight: false }),
      ParagraphLineHeight,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: true }, tableRow: false }),
      ResizableTableRow,
      TableResizeHandles,
      DocumentImage.configure({ documentId: document.id }),
      FileHandler.configure({
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
        consumePasteEvent: true,
        onPaste(editor, files) {
          void insertImageFiles(editor, files, document.id, mergeStoredAsset, reportImageError);
        },
        onDrop(editor, files, position) {
          void insertImageFiles(editor, files, document.id, mergeStoredAsset, reportImageError, position);
        },
      }),
      CharacterCount,
      Placeholder.configure({ placeholder: t(props.language, "editor.placeholder") }),
      Typography,
      EditorColorPreview,
      PageBreak,
      DocumentLayout,
      UnsupportedObject,
      Pagination,
    ],
    [document.id, props.language],
  );

  const editor = useEditor({
    extensions,
    content: document.content,
    autofocus: "end",
    editorProps: {
      transformPastedHTML: (html) => sanitizeImportedHtml(html, {
        allowedAssetIds: new Set(documentRef.current.assets.map((asset) => asset.id)),
      }),
    },
    onUpdate: () => {
      markDirty();
      setToolbarRevision((value) => value + 1);
    },
    onSelectionUpdate: () => setToolbarRevision((value) => value + 1),
  });
  void toolbarRevision;

  useEffect(() => {
    if (!editor || !props.importedHtml) return;
    editor.commands.setContent(props.importedHtml);
    markDirty();
  }, [editor, markDirty, props.importedHtml]);

  const currentDocument = useCallback((): EditorDocumentV1 => ({
    ...documentRef.current,
    content: (editor?.getJSON() ?? documentRef.current.content) as Record<string, unknown>,
  }), [editor]);

  const autosave = useCallback(async (): Promise<EditorDocumentV1 | null> => {
    if (!editor) return null;
    while (dirtyRef.current) {
      const pending = saveInFlight.current;
      if (pending) {
        await pending;
        continue;
      }

      const revision = revisionRef.current;
      const snapshot = currentDocument();
      const task = (async () => {
        let saved = await api.editorSaveDraft(snapshot);
        saved = await api.editorPruneAssets(saved.id);
        if (revision === revisionRef.current) {
          documentRef.current = saved;
          dirtyRef.current = false;
          setDocument(saved);
          setDirty(false);
          props.onDocument(saved);
        }
        return saved;
      })();
      saveInFlight.current = task;
      try {
        await task;
      } finally {
        if (saveInFlight.current === task) saveInFlight.current = null;
      }
    }
    return documentRef.current;
  }, [currentDocument, editor, props.onDocument]);

  useEffect(() => {
    if (!dirty || !editor) return;
    const timeout = window.setTimeout(() => {
      void autosave().catch((error) => props.onNotice("error", editorError(error)));
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [autosave, dirty, editor, props.onNotice]);

  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) void autosave().catch(() => undefined);
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [autosave]);

  if (!editor) return <div className="editor-loading">{t(props.language, "editor.loading")}</div>;

  function updateDocument(patch: Partial<EditorDocumentV1>) {
    const next = { ...documentRef.current, ...patch };
    documentRef.current = next;
    setDocument(next);
    markDirty();
  }

  function mergeStoredAsset(result: EditorAssetStoreResult) {
    const next = { ...documentRef.current, assets: result.document.assets };
    documentRef.current = next;
    setDocument(next);
    markDirty();
  }

  function reportImageError(error: unknown) {
    props.onNotice("error", editorError(error));
  }

  async function closeDocument() {
    setSaving(true);
    editor.setEditable(false);
    try {
      await autosave();
      await props.onClose();
    } catch (error) {
      editor.setEditable(true);
      props.onNotice("error", editorError(error));
    } finally {
      setSaving(false);
    }
  }

  async function save(mode: "save" | "saveAs") {
    setSaving(true);
    try {
      const latest = await autosave() ?? currentDocument();
      const format = mode === "save" && latest.source ? latest.source.format : exportFormat;
      const overwriteBlocked = latest.warnings.some((warning) => warning.blocksOverwrite);
      if (mode === "save" && overwriteBlocked) {
        props.onNotice("info", latest.warnings.find((warning) => warning.blocksOverwrite)?.message || t(props.language, "editor.compatibilityWarning"));
        await performSave(latest, format, "saveAs");
        return;
      }
      if (mode === "save" && latest.source) {
        pendingOverwrite.current = { document: latest, format };
        setOperation("overwrite");
        return;
      }
      await performSave(latest, format, mode);
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setSaving(false);
    }
  }

  function requestExport() {
    if (isUntitledDocument(documentRef.current.title)) {
      setTitleDraft("");
      setOperation("name");
      return;
    }
    void exportDocument();
  }

  async function exportDocument(title?: string) {
    if (title !== undefined) updateDocument({ title });
    const abortController = exportFormat === "docx" ? new AbortController() : null;
    exportAbortController.current = abortController;
    setExportProgress(abortController ? 0 : null);
    setSaving(true);
    setOperation("exporting");
    try {
      const latest = await autosave() ?? currentDocument();
      if ((exportFormat === "txt" || exportFormat === "md") && (latest.header || latest.footer || latest.page.numbering !== "none")) {
        props.onNotice("info", t(props.language, "editor.flatFormatLayoutWarning"));
      }
      const prepared = exportFormat === "pdf"
        ? await prepareDocumentForPdf(api, latest)
        : { document: latest, warnings: [] as string[] };
      for (const warning of prepared.warnings) props.onNotice("info", warning);
      const request = { document: prepared.document, targetFormat: exportFormat };
      const result = exportFormat === "docx"
        ? await writeGeneratedDocx(api, request, "export", {
          signal: abortController?.signal,
          onProgress: setExportProgress,
        })
        : await api.editorExportDocument(request);
      if (result) {
        acceptSavedDocument(exportFormat === "pdf" ? latest : result.document);
        props.onNotice("success", t(props.language, "editor.exported", { path: result.path }));
      }
    } catch (error) {
      if (!isAbortError(error)) props.onNotice("error", editorError(error));
    } finally {
      if (exportAbortController.current === abortController) {
        exportAbortController.current = null;
      }
      setExportProgress(null);
      setSaving(false);
      setOperation(null);
    }
  }

  async function performSave(latest: EditorDocumentV1, format: EditorFormat, mode: "save" | "saveAs") {
    const prepared = format === "pdf"
      ? await prepareDocumentForPdf(api, latest)
      : { document: latest, warnings: [] as string[] };
    for (const warning of prepared.warnings) props.onNotice("info", warning);
    const request = { document: prepared.document, targetFormat: format };
    const result = format === "docx"
      ? await writeGeneratedDocx(api, request, mode)
      : mode === "save" && latest.source
        ? await api.editorSaveDocument(request)
        : await api.editorSaveAs(request);
    if (!result) return;
    acceptSavedDocument(format === "pdf" ? latest : result.document);
    props.onNotice("success", t(props.language, "editor.saved", { name: result.document.title }));
  }

  async function confirmOverwrite() {
    const pending = pendingOverwrite.current;
    if (!pending) {
      setOperation(null);
      return;
    }
    setOperation(null);
    setSaving(true);
    try {
      await performSave(pending.document, pending.format, "save");
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      pendingOverwrite.current = null;
      setSaving(false);
    }
  }

  function cancelOperation() {
    if (operation === "exporting") {
      exportAbortController.current?.abort(new DOMException("L’export DOCX a été annulé.", "AbortError"));
      return;
    }
    pendingOverwrite.current = null;
    setOperation(null);
  }

  function confirmExportTitle() {
    const title = normalizedDocumentTitle(titleDraft);
    if (!title) return;
    void exportDocument(title);
  }

  function acceptSavedDocument(saved: EditorDocumentV1) {
    documentRef.current = saved;
    dirtyRef.current = false;
    setDocument(saved);
    setDirty(false);
    props.onDocument(saved);
  }

  return (
    <div
      className={`document-editor-shell ${focusMode ? "is-focus-mode" : ""}`}
      data-focus-mode={focusMode ? "true" : "false"}
    >
      <DocumentCommandRow
        language={props.language}
        title={document.title}
        dirty={dirty}
        saving={saving}
        focusMode={focusMode}
        focusButtonRef={focusButtonRef}
        exportFormat={exportFormat}
        onBack={() => void closeDocument()}
        onFocusMode={toggleFocusMode}
        onTitle={(title) => updateDocument({ title })}
        onSave={(mode) => void save(mode)}
        onExport={requestExport}
        onExportFormat={setExportFormat}
      />
      <EditorToolbar
        editor={editor}
        language={props.language}
        document={document}
        searchOpen={searchOpen}
        onSearch={() => setSearchOpen((value) => !value)}
        onHeaderFooter={setHeaderFooter}
        onPage={(pagePatch) => updateDocument({ page: { ...document.page, ...pagePatch } })}
        onInsertImages={(files) => void insertImageFiles(editor, files, document.id, mergeStoredAsset, reportImageError)}
      />
      <EditorCanvas
        language={props.language}
        document={document}
        editor={editor}
        searchOpen={searchOpen}
        onCloseSearch={() => setSearchOpen(false)}
        onHeaderFooter={setHeaderFooter}
      />
      {headerFooter && (
        <HeaderFooterDialog
          language={props.language}
          kind={headerFooter}
          content={headerFooter === "header" ? document.header : document.footer}
          documentId={document.id}
          assetIds={document.assets.map((asset) => asset.id)}
          onClose={() => setHeaderFooter(null)}
          onSave={(content) => {
            updateDocument(headerFooter === "header" ? { header: content } : { footer: content });
            setHeaderFooter(null);
          }}
        />
      )}
      <DocumentOperationDialog
        language={props.language}
        operation={operation}
        title={pendingOverwrite.current?.document.title ?? document.title}
        titleDraft={titleDraft}
        format={exportFormat}
        progress={exportProgress}
        cancellable={operation === "exporting" && exportAbortController.current !== null}
        onTitleDraft={setTitleDraft}
        onCancel={cancelOperation}
        onConfirmOverwrite={() => void confirmOverwrite()}
        onConfirmTitle={confirmExportTitle}
      />
    </div>
  );
}

function editorError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^[A-Z][A-Z0-9_]+:/, "");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
