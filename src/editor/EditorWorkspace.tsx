import { useCallback, useEffect, useRef, useState } from "react";
import { api, type EditorDocumentSummary, type EditorDocumentV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
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

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const [document, setDocument] = useState<EditorDocumentV1 | null>(null);
  const [recent, setRecent] = useState<EditorDocumentSummary[]>([]);
  const [imported, setImported] = useState<ImportedContent | null>(null);
  const [busy, setBusy] = useState(false);
  const lastNativeDropId = useRef<number | null>(null);

  const refreshRecent = useCallback(async () => {
    setRecent(await api.editorListRecentDocuments());
  }, []);

  useEffect(() => {
    if (!props.isActive) return;
    void refreshRecent().catch((error) => props.onNotice("error", editorError(error)));
  }, [props.isActive, props.onNotice, refreshRecent]);

  const openPath = useCallback(async (path?: string | null) => {
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
      setImported(importedHtml ? { documentId: prepared.id, html: importedHtml } : null);
      await refreshRecent();
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [props.onNotice, refreshRecent]);

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
      setImported(null);
      await refreshRecent();
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [props.onNotice, refreshRecent]);

  const loadRecent = useCallback(async (id: string) => {
    setBusy(true);
    try {
      setDocument(await normalizeLegacyDocumentAssets(await api.editorLoadDocument(id)));
      setImported(null);
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }, [props.onNotice]);

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

  const closeDocument = useCallback(async () => {
    await refreshRecent();
    setDocument(null);
    setImported(null);
  }, [refreshRecent]);

  if (!props.isActive) return null;

  return (
    <section className="editor-workspace" aria-label={t(props.language, "editor.workspace")}>
      {!document ? (
        <EditorLanding
          language={props.language}
          recent={recent}
          busy={busy}
          onCreate={() => void createDocument()}
          onOpen={() => void openPath()}
          onOpenRecent={(id) => void loadRecent(id)}
          onRenameRecent={(id, title) => void renameRecent(id, title)}
          onDuplicateRecent={(item) => void duplicateRecent(item)}
          onDeleteRecent={(id) => void deleteRecent(id)}
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
      ) : (
        <DocumentEditor
          key={document.id}
          language={props.language}
          document={document}
          importedHtml={imported?.documentId === document.id ? imported.html : null}
          onDocument={setDocument}
          onClose={closeDocument}
          onNotice={props.onNotice}
        />
      )}
    </section>
  );
}

function editorError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^[A-Z][A-Z0-9_]+:/, "");
}
