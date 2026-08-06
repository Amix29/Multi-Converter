import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type EditorDocumentSummary,
  type EditorDocumentV1,
  type PdfEditorSessionV1,
} from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { PdfEditor } from "../pdf-editor/PdfEditor";
import { PdfPasswordDialog } from "../pdf-editor/PdfPasswordDialog";
import { DocumentEditor } from "./DocumentEditor";
import { EditorLanding } from "./EditorLanding";
import { normalizeLegacyDocumentAssets, prepareImportedHtmlAssets } from "./editorAssets";

interface EditorWorkspaceProps {
  isActive: boolean;
  language: LanguageCode;
  nativeDropRequest: { id: number; paths: string[] } | null;
  onNotice(tone: "info" | "success" | "error", message: string): void;
}

interface ImportedContent {
  documentId: string;
  html: string;
}

interface PdfPasswordRequest {
  path: string;
  sourceName: string;
  error: string | null;
}

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const [document, setDocument] = useState<EditorDocumentV1 | null>(null);
  const [pdfSession, setPdfSession] = useState<PdfEditorSessionV1 | null>(null);
  const [pdfPassword, setPdfPassword] = useState<PdfPasswordRequest | null>(null);
  const [recent, setRecent] = useState<EditorDocumentSummary[]>([]);
  const [imported, setImported] = useState<ImportedContent | null>(null);
  const [busy, setBusy] = useState(false);
  const lastNativeDropId = useRef<number | null>(null);
  const recentRefreshId = useRef(0);

  const refreshRecent = useCallback(async () => {
    const refreshId = recentRefreshId.current + 1;
    recentRefreshId.current = refreshId;
    try {
      const next = await api.editorListRecentDocuments();
      if (refreshId !== recentRefreshId.current) return false;
      setRecent(next);
      return true;
    } catch (error) {
      if (refreshId !== recentRefreshId.current) return false;
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!props.isActive) return;
    void refreshRecent().catch((error) => props.onNotice("error", editorError(error)));
  }, [props.isActive, props.onNotice, refreshRecent]);

  const openPdf = useCallback(async (path: string, password?: string | null) => {
    setBusy(true);
    try {
      const session = await api.pdfEditorOpen(path, password);
      setPdfSession(session);
      setDocument(null);
      setImported(null);
      setPdfPassword(null);
    } catch (error) {
      const code = editorErrorCode(error);
      if (code === "PDF_EDITOR_PASSWORD_REQUIRED" || code === "PDF_EDITOR_PASSWORD_INVALID") {
        setPdfPassword({
          path,
          sourceName: fileName(path),
          error: code === "PDF_EDITOR_PASSWORD_INVALID" ? editorError(error) : null,
        });
      } else {
        props.onNotice("error", editorError(error));
      }
    } finally {
      setBusy(false);
    }
  }, [props.onNotice]);

  const openPath = useCallback(async (path: string) => {
    if (isPdfPath(path)) {
      await openPdf(path);
      return;
    }
    setBusy(true);
    try {
      const result = await api.editorImportDocument(path);
      if (!result) return;
      let prepared = await normalizeLegacyDocumentAssets(result.document);
      let importedHtml: string | null = null;
      if (result.transientContent?.kind === "html") {
        const normalized = await prepareImportedHtmlAssets(prepared, result.transientContent.value);
        prepared = normalized.document;
        importedHtml = normalized.html;
      }
      setDocument(prepared);
      setPdfSession(null);
      setImported(importedHtml ? { documentId: prepared.id, html: importedHtml } : null);
      await refreshRecent();
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [openPdf, props.onNotice, refreshRecent]);

  const chooseDocument = useCallback(async () => {
    setBusy(true);
    try {
      const paths = await api.pickFilePaths();
      if (!paths.length) return;
      if (paths.length !== 1) {
        props.onNotice("info", t(props.language, "editor.dropOneDocument"));
        return;
      }
      await openPath(paths[0]);
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [openPath, props.language, props.onNotice]);

  useEffect(() => {
    const request = props.nativeDropRequest;
    if (!props.isActive || !request || lastNativeDropId.current === request.id) return;
    lastNativeDropId.current = request.id;
    if (request.paths.length !== 1) {
      props.onNotice("info", t(props.language, "editor.dropOneDocument"));
      return;
    }
    void openPath(request.paths[0]);
  }, [openPath, props.isActive, props.language, props.nativeDropRequest, props.onNotice]);

  const createDocument = useCallback(async () => {
    setBusy(true);
    try {
      const created = await api.editorCreateDocument();
      setDocument(created);
      setPdfSession(null);
      setImported(null);
      await refreshRecent();
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [props.onNotice, refreshRecent]);

  const loadRecent = useCallback(async (id: string) => {
    const summary = recent.find((item) => item.id === id);
    if (summary?.format.toLowerCase() === "pdf" && summary.sourcePath) {
      await openPath(summary.sourcePath);
      return;
    }
    setBusy(true);
    try {
      setDocument(await normalizeLegacyDocumentAssets(await api.editorLoadDocument(id)));
      setPdfSession(null);
      setImported(null);
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [openPath, props.onNotice, recent]);

  const renameRecent = useCallback(async (id: string, title: string) => {
    setBusy(true);
    try {
      await api.editorRenameDocument(id, title);
      await refreshRecent();
      props.onNotice("success", t(props.language, "editor.renamed"));
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [props.language, props.onNotice, refreshRecent]);

  const duplicateRecent = useCallback(async (item: EditorDocumentSummary) => {
    setBusy(true);
    try {
      await api.editorDuplicateDocument(item.id, `${item.title} — ${t(props.language, "editor.copySuffix")}`);
      await refreshRecent();
      props.onNotice("success", t(props.language, "editor.duplicated"));
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [props.language, props.onNotice, refreshRecent]);

  const deleteRecent = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await api.editorDeleteDraft(id);
      await refreshRecent();
      props.onNotice("success", t(props.language, "editor.deleted"));
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [props.language, props.onNotice, refreshRecent]);

  const deleteRecents = useCallback(async (ids: string[]) => {
    setBusy(true);
    const failed: string[] = [];
    try {
      for (const id of ids) {
        try {
          await api.editorDeleteDraft(id);
        } catch {
          failed.push(id);
        }
      }
      await refreshRecent();
      if (failed.length === 0) {
        props.onNotice("success", t(props.language, "editor.deletedMany", { count: ids.length }));
      } else {
        props.onNotice("error", t(props.language, "editor.deleteManyFailed", { count: failed.length }));
      }
      return failed;
    } finally {
      setBusy(false);
    }
  }, [props.language, props.onNotice, refreshRecent]);

  const closeDocument = useCallback(async () => {
    await refreshRecent();
    setDocument(null);
    setImported(null);
  }, [refreshRecent]);

  const closePdf = useCallback(async () => {
    const session = pdfSession;
    if (!session) return;
    try {
      await api.pdfEditorClose(session.sessionId);
      await refreshRecent();
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setPdfSession(null);
      setPdfPassword(null);
    }
  }, [pdfSession, props.onNotice, refreshRecent]);

  if (!props.isActive) return null;

  return (
    <section className="editor-workspace" aria-label={t(props.language, "editor.workspace")}>
      {!document && !pdfSession ? (
        <EditorLanding
          language={props.language}
          recent={recent}
          busy={busy}
          onCreate={() => void createDocument()}
          onOpen={() => void chooseDocument()}
          onOpenRecent={(id) => void loadRecent(id)}
          onRenameRecent={(id, title) => void renameRecent(id, title)}
          onDuplicateRecent={(item) => void duplicateRecent(item)}
          onDeleteRecent={(id) => void deleteRecent(id)}
          onDeleteRecents={deleteRecents}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            const path = file && "path" in file ? String((file as File & { path?: string }).path || "") : "";
            if (event.dataTransfer.files.length !== 1) {
              props.onNotice("info", t(props.language, "editor.dropOneDocument"));
            } else if (path) {
              void openPath(path);
            } else if (!("__TAURI_INTERNALS__" in window) && file) {
              void openPath(file.name);
            }
          }}
        />
      ) : pdfSession ? (
        <PdfEditor
          key={pdfSession.sessionId}
          language={props.language}
          session={pdfSession}
          onClose={() => void closePdf()}
          onNotice={props.onNotice}
        />
      ) : document ? (
        <DocumentEditor
          key={document.id}
          language={props.language}
          document={document}
          importedHtml={imported?.documentId === document.id ? imported.html : null}
          onDocument={setDocument}
          onClose={closeDocument}
          onNotice={props.onNotice}
        />
      ) : null}
      {pdfPassword && (
        <PdfPasswordDialog
          language={props.language}
          sourceName={pdfPassword.sourceName}
          busy={busy}
          error={pdfPassword.error}
          onCancel={() => setPdfPassword(null)}
          onSubmit={(password) => void openPdf(pdfPassword.path, password)}
        />
      )}
    </section>
  );
}

function isPdfPath(path: string) {
  return /\.pdf$/i.test(path.trim());
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || "document.pdf";
}

function editorErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /^([A-Z][A-Z0-9_]+):/.exec(message)?.[1] ?? "";
}

function editorError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^[A-Z][A-Z0-9_]+:/, "");
}
