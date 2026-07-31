import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import FileHandler from "@tiptap/extension-file-handler";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { TextSelection } from "@tiptap/pm/state";
import { api, type EditorAssetStoreResult, type EditorDocumentSummary, type EditorDocumentV1, type EditorFormat } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { DocumentImage, DocumentLayout, PageBreak, UnsupportedObject } from "./extensions";
import { Pagination } from "./pagination";

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

const pageSizes: Record<EditorDocumentV1["page"]["format"], { width: number; height: number }> = {
  a3: { width: 1123, height: 1587 },
  a4: { width: 794, height: 1123 },
  a5: { width: 559, height: 794 },
  letter: { width: 816, height: 1056 },
  legal: { width: 816, height: 1345 },
};

const exportFormats: EditorFormat[] = ["docx", "odt", "rtf", "pdf", "html", "md", "txt"];

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const [document, setDocument] = useState<EditorDocumentV1 | null>(null);
  const [recent, setRecent] = useState<EditorDocumentSummary[]>([]);
  const [imported, setImported] = useState<ImportedContent | null>(null);
  const [busy, setBusy] = useState(false);
  const lastNativeDropId = useRef<number | null>(null);

  const refreshRecent = useCallback(async () => {
    try {
      setRecent(await api.editorListRecentDocuments());
    } catch (error) {
      props.onNotice("error", editorError(error));
    }
  }, [props]);

  useEffect(() => {
    if (props.isActive) void refreshRecent();
  }, [props.isActive, refreshRecent]);

  const openPath = useCallback(async (path?: string | null) => {
    setBusy(true);
    try {
      const result = await api.editorImportDocument(path);
      if (!result) return;
      let prepared = await normalizeLegacyDocumentAssets(result.document);
      let importedHtml: string | null = null;
      if (result.transientContent?.kind === "html") {
        const normalized = await normalizeImportedHtmlAssets(prepared, sanitizeImportedHtml(result.transientContent.value));
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
  }, [props, refreshRecent]);

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

  async function createDocument() {
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
  }

  async function loadRecent(id: string) {
    setBusy(true);
    try {
      setDocument(await normalizeLegacyDocumentAssets(await api.editorLoadDocument(id)));
      setImported(null);
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setBusy(false);
    }
  }

  async function renameRecent(id: string, title: string) {
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
  }

  async function duplicateRecent(item: EditorDocumentSummary) {
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
  }

  async function deleteRecent(id: string) {
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
  }

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
          onDocument={(next) => {
            setDocument(next);
            void refreshRecent();
          }}
          onClose={() => {
            setDocument(null);
            setImported(null);
            void refreshRecent();
          }}
          onNotice={props.onNotice}
        />
      )}
    </section>
  );
}

function EditorLanding(props: {
  language: LanguageCode;
  recent: EditorDocumentSummary[];
  busy: boolean;
  onCreate(): void;
  onOpen(): void;
  onOpenRecent(id: string): void;
  onRenameRecent(id: string, title: string): void;
  onDuplicateRecent(item: EditorDocumentSummary): void;
  onDeleteRecent(id: string): void;
  onDrop(event: React.DragEvent<HTMLElement>): void;
}) {
  const [dragging, setDragging] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ type: "rename" | "delete"; item: EditorDocumentSummary } | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!openMenuId) return;
    function closeMenu(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(`[data-recent-menu="${openMenuId}"]`)) setOpenMenuId(null);
    }
    function closeMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenuWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenuWithKeyboard);
    };
  }, [openMenuId]);

  function beginRename(item: EditorDocumentSummary) {
    setOpenMenuId(null);
    setRenameTitle(item.title);
    setDialog({ type: "rename", item });
  }

  function submitRename(event: React.FormEvent) {
    event.preventDefault();
    const title = renameTitle.trim();
    if (!dialog || dialog.type !== "rename" || !title) return;
    props.onRenameRecent(dialog.item.id, title);
    setDialog(null);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    dragDepth.current = 0;
    setDragging(false);
    props.onDrop(event);
  }

  return (
    <div
      className={`editor-landing ${dragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <section className="editor-welcome-card" aria-labelledby="editor-welcome-title">
        <div className="editor-welcome-visual"><DocumentSketchIcon /></div>
        <div className="editor-welcome-copy">
          <span className="editor-eyebrow">{t(props.language, "editor.localEyebrow")}</span>
          <h2 id="editor-welcome-title">{t(props.language, "editor.welcomeTitle")}</h2>
          <p className="editor-welcome-description">{t(props.language, "editor.welcomeDescription")}</p>
          <div className="editor-welcome-actions">
            <button className="editor-primary-button" type="button" disabled={props.busy} onClick={props.onCreate}>
              <span aria-hidden="true">＋</span>{t(props.language, "editor.newDocument")}
            </button>
            <button className="editor-secondary-button" type="button" disabled={props.busy} onClick={props.onOpen}>
              <FolderIcon />{t(props.language, "editor.openDocument")}
            </button>
          </div>
          <p className="editor-supported-formats">{t(props.language, "editor.supportedFormats")}</p>
        </div>
        <div className="editor-drop-hint">
          <span className="editor-drop-icon" aria-hidden="true">↓</span>
          <span><strong>{dragging ? t(props.language, "editor.releaseDocument") : t(props.language, "editor.dropDocument")}</strong><small>{t(props.language, "editor.dropPrivacy")}</small></span>
        </div>
      </section>

      <section className="recent-documents" aria-labelledby="recent-documents-title">
        <div className="recent-documents-heading">
          <div>
            <span className="editor-eyebrow">{t(props.language, "editor.yourWorkspace")}</span>
            <h2 id="recent-documents-title">{t(props.language, "editor.recentDocuments")}</h2>
          </div>
          {!!props.recent.length && <span className="recent-document-count">{props.recent.length}</span>}
        </div>
        {!props.recent.length ? (
          <div className="editor-empty-recent">{t(props.language, "editor.noRecentDocuments")}</div>
        ) : (
          <div className="recent-document-grid">
            {props.recent.slice(0, 10).map((item) => (
              <article className={`recent-document-card ${openMenuId === item.id ? "is-menu-open" : ""}`} key={item.id}>
                <button className="recent-document-open" type="button" onClick={() => props.onOpenRecent(item.id)}>
                  <MiniDocumentIcon format={item.format} />
                  <span className="recent-document-copy">
                    <strong>{item.title}</strong>
                    <small><span>{item.format.toUpperCase()}</span>{formatRecentDate(item.updatedAt, props.language)}</small>
                  </span>
                </button>
                <div className="recent-document-menu" data-recent-menu={item.id}>
                  <button
                    className="recent-document-menu-trigger"
                    type="button"
                    aria-label={t(props.language, "editor.documentActions", { name: item.title })}
                    aria-haspopup="menu"
                    aria-expanded={openMenuId === item.id}
                    onClick={() => setOpenMenuId((current) => current === item.id ? null : item.id)}
                  >•••</button>
                  {openMenuId === item.id && (
                    <div className="recent-document-menu-popover" role="menu">
                      <button type="button" role="menuitem" onClick={() => beginRename(item)}>{t(props.language, "editor.rename")}</button>
                      <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); props.onDuplicateRecent(item); }}>{t(props.language, "editor.duplicate")}</button>
                      <span />
                      <button className="is-danger" type="button" role="menuitem" onClick={() => { setOpenMenuId(null); setDialog({ type: "delete", item }); }}>{t(props.language, "editor.delete")}</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {dragging && <div className="editor-drop-overlay" aria-live="polite"><span>{t(props.language, "editor.releaseDocument")}</span></div>}

      {createPortal(
        <>
          {dialog?.type === "rename" && (
            <div className="editor-modal-backdrop" role="presentation" onMouseDown={() => setDialog(null)}>
              <form className="editor-modal editor-document-action-modal" role="dialog" aria-modal="true" aria-labelledby="rename-document-title" onSubmit={submitRename} onMouseDown={(event) => event.stopPropagation()}>
                <span className="editor-eyebrow">{t(props.language, "editor.documentSettings")}</span>
                <h2 id="rename-document-title">{t(props.language, "editor.renameDocument")}</h2>
                <label htmlFor="editor-rename-input">{t(props.language, "editor.documentName")}</label>
                <input id="editor-rename-input" autoFocus maxLength={240} value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} />
                <div className="editor-modal-actions">
                  <button type="button" onClick={() => setDialog(null)}>{t(props.language, "common.cancel")}</button>
                  <button className="editor-primary-button" type="submit" disabled={!renameTitle.trim()}>{t(props.language, "editor.rename")}</button>
                </div>
              </form>
            </div>
          )}

          {dialog?.type === "delete" && (
            <div className="editor-modal-backdrop" role="presentation" onMouseDown={() => setDialog(null)}>
              <div className="editor-modal editor-document-action-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-document-title" onMouseDown={(event) => event.stopPropagation()}>
                <span className="editor-eyebrow is-danger">{t(props.language, "editor.irreversibleAction")}</span>
                <h2 id="delete-document-title">{t(props.language, "editor.deleteDocument")}</h2>
                <p>{t(props.language, "editor.deleteDocumentConfirm", { name: dialog.item.title })}</p>
                <div className="editor-modal-actions">
                  <button type="button" onClick={() => setDialog(null)}>{t(props.language, "common.cancel")}</button>
                  <button className="editor-danger-button" type="button" onClick={() => { props.onDeleteRecent(dialog.item.id); setDialog(null); }}>{t(props.language, "editor.delete")}</button>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body,
      )}
    </div>
  );
}

function DocumentEditor(props: {
  language: LanguageCode;
  document: EditorDocumentV1;
  importedHtml: string | null;
  onDocument(document: EditorDocumentV1): void;
  onClose(): void;
  onNotice(tone: "info" | "success" | "error", message: string): void;
}) {
  const [document, setDocument] = useState(props.document);
  const documentRef = useRef(document);
  const [dirty, setDirty] = useState(Boolean(props.importedHtml));
  const [saving, setSaving] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [zoom, setZoom] = useState(0.85);
  const [exportFormat, setExportFormat] = useState<EditorFormat>(document.source?.format ?? "docx");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [replacement, setReplacement] = useState("");
  const [headerFooter, setHeaderFooter] = useState<"header" | "footer" | null>(null);
  const [toolbarRevision, setToolbarRevision] = useState(0);
  const overwriteConfirmed = useRef(false);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      TextStyleKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: true } }),
      DocumentImage.configure({ documentId: document.id }),
      FileHandler.configure({
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
        consumePasteEvent: true,
        onPaste(editor, files) {
          void insertImageFiles(editor, files, document.id, mergeStoredAsset, reportImageError);
        },
        onDrop(editor, files, pos) {
          void insertImageFiles(editor, files, document.id, mergeStoredAsset, reportImageError, pos);
        },
      }),
      CharacterCount,
      Placeholder.configure({ placeholder: t(props.language, "editor.placeholder") }),
      Typography,
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
    onUpdate: () => {
      setDirty(true);
      setToolbarRevision((value) => value + 1);
    },
    onSelectionUpdate: () => setToolbarRevision((value) => value + 1),
  });
  void toolbarRevision;

  useEffect(() => {
    if (!editor || !props.importedHtml) return;
    editor.commands.setContent(props.importedHtml);
    setDirty(true);
  }, [editor, props.importedHtml]);

  useEffect(() => {
    const target = canvasScrollRef.current;
    if (!target) return;
    const onPagination = (event: Event) => {
      const detail = (event as CustomEvent<{ pageCount?: number }>).detail;
      if (detail?.pageCount) setPageCount(detail.pageCount);
    };
    target.addEventListener("editor-pagination", onPagination);
    return () => target.removeEventListener("editor-pagination", onPagination);
  }, [editor]);

  const currentDocument = useCallback((): EditorDocumentV1 => ({
    ...documentRef.current,
    content: (editor?.getJSON() ?? documentRef.current.content) as Record<string, unknown>,
  }), [editor]);

  const autosave = useCallback(async () => {
    if (!editor) return null;
    let saved = await api.editorSaveDraft(currentDocument());
    saved = await api.editorPruneAssets(saved.id);
    documentRef.current = saved;
    setDocument(saved);
    setDirty(false);
    props.onDocument(saved);
    return saved;
  }, [currentDocument, editor, props]);

  useEffect(() => {
    if (!dirty || !editor) return;
    const timeout = window.setTimeout(() => void autosave().catch((error) => props.onNotice("error", editorError(error))), 750);
    return () => window.clearTimeout(timeout);
  }, [autosave, dirty, editor, props]);

  useEffect(() => {
    const flush = () => {
      if (dirty) void autosave();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [autosave, dirty]);

  if (!editor) return <div className="editor-loading">{t(props.language, "editor.loading")}</div>;

  const page = pageSizes[document.page.format];
  const dimensions = document.page.orientation === "landscape" ? { width: page.height, height: page.width } : page;
  const verticalMargins = (document.page.marginsMm.top + document.page.marginsMm.bottom) * (96 / 25.4);
  const canvasStyle = {
    "--editor-page-width": `${dimensions.width}px`,
    "--editor-page-height": `${dimensions.height}px`,
    "--editor-page-content-height": `${Math.max(180, dimensions.height - verticalMargins)}px`,
    "--editor-margin-top": `${document.page.marginsMm.top * (96 / 25.4)}px`,
    "--editor-margin-right": `${document.page.marginsMm.right * (96 / 25.4)}px`,
    "--editor-margin-bottom": `${document.page.marginsMm.bottom * (96 / 25.4)}px`,
    "--editor-margin-left": `${document.page.marginsMm.left * (96 / 25.4)}px`,
    "--editor-zoom": String(zoom),
  } as CSSProperties;

  function updateDocument(patch: Partial<EditorDocumentV1>) {
    const next = { ...documentRef.current, ...patch };
    documentRef.current = next;
    setDocument(next);
    setDirty(true);
  }

  function mergeStoredAsset(result: EditorAssetStoreResult) {
    const next = { ...documentRef.current, assets: result.document.assets };
    documentRef.current = next;
    setDocument(next);
  }

  function reportImageError(error: unknown) {
    props.onNotice("error", editorError(error));
  }

  async function save(mode: "save" | "saveAs") {
    setSaving(true);
    try {
      const latest = await autosave() ?? currentDocument();
      const format = mode === "save" && latest.source ? latest.source.format : exportFormat;
      const overwriteBlocked = latest.warnings.some((warning) => warning.blocksOverwrite);
      if (mode === "save" && overwriteBlocked) {
        props.onNotice("info", latest.warnings.find((warning) => warning.blocksOverwrite)?.message || t(props.language, "editor.compatibilityWarning"));
        const result = await api.editorSaveAs({ document: latest, targetFormat: format });
        if (result) {
          documentRef.current = result.document;
          setDocument(result.document);
          props.onDocument(result.document);
          setDirty(false);
        }
        return;
      }
      if (mode === "save" && latest.source && !overwriteConfirmed.current) {
        if (!window.confirm(t(props.language, "editor.confirmOverwrite", { name: latest.title }))) return;
        overwriteConfirmed.current = true;
      }
      const request = { document: latest, targetFormat: format };
      const result = mode === "save" && latest.source
        ? await api.editorSaveDocument(request)
        : await api.editorSaveAs(request);
      if (!result) return;
      documentRef.current = result.document;
      setDocument(result.document);
      props.onDocument(result.document);
      setDirty(false);
      props.onNotice("success", t(props.language, "editor.saved", { name: result.document.title }));
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setSaving(false);
    }
  }

  async function exportDocument() {
    setSaving(true);
    try {
      const latest = await autosave() ?? currentDocument();
      if ((exportFormat === "txt" || exportFormat === "md") && (latest.header || latest.footer || latest.page.numbering !== "none")) {
        props.onNotice("info", t(props.language, "editor.flatFormatLayoutWarning"));
      }
      const result = await api.editorExportDocument({ document: latest, targetFormat: exportFormat });
      if (result) props.onNotice("success", t(props.language, "editor.exported", { path: result.path }));
    } catch (error) {
      props.onNotice("error", editorError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="document-editor-shell">
      <div className="document-command-row">
        <button className="editor-back-button" type="button" onClick={() => void autosave().finally(props.onClose)} aria-label={t(props.language, "editor.backToDocuments")}>←</button>
        <input
          className="document-title-input"
          value={document.title}
          aria-label={t(props.language, "editor.documentName")}
          onChange={(event) => updateDocument({ title: event.target.value.slice(0, 240) })}
        />
        <span className={`document-save-state ${dirty ? "is-dirty" : ""}`} aria-live="polite">
          {saving ? t(props.language, "editor.saving") : dirty ? t(props.language, "editor.unsaved") : t(props.language, "editor.savedState")}
        </span>
        <div className="document-command-actions">
          <button type="button" onClick={() => void save("save")} disabled={saving}>{t(props.language, "editor.save")}</button>
          <button type="button" onClick={() => void save("saveAs")} disabled={saving}>{t(props.language, "editor.saveAs")}</button>
          <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as EditorFormat)} aria-label={t(props.language, "editor.exportFormat")}>
            {exportFormats.map((format) => <option value={format} key={format}>{format.toUpperCase()}</option>)}
          </select>
          <button className="editor-export-button" type="button" onClick={() => void exportDocument()} disabled={saving}>{t(props.language, "editor.export")}</button>
        </div>
      </div>

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

      {document.warnings.length > 0 && (
        <div className="editor-compatibility-warning" role="status">
          <strong>!</strong><span>{document.warnings.map((warning) => warning.message).join(" ")}</span>
        </div>
      )}

      {searchOpen && (
        <div className="editor-searchbar">
          <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(props.language, "editor.find")} />
          <input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder={t(props.language, "editor.replaceWith")} />
          <button type="button" onClick={() => findNext(editor, search)}>{t(props.language, "editor.next")}</button>
          <button type="button" onClick={() => replaceSelection(editor, search, replacement)}>{t(props.language, "editor.replace")}</button>
          <button type="button" onClick={() => setSearchOpen(false)} aria-label={t(props.language, "common.close")}>×</button>
        </div>
      )}

      <div
        ref={canvasScrollRef}
        className="editor-canvas-scroll"
        onDoubleClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(".page-header-zone")) setHeaderFooter("header");
          if (target.closest(".page-footer-zone")) setHeaderFooter("footer");
        }}
      >
        <div className="editor-page-scale" style={canvasStyle}>
          <div className="editor-page-paper">
            <button className="page-header-zone" type="button" onClick={() => setHeaderFooter("header")}>{t(props.language, "editor.header")}</button>
            <EditorContent editor={editor} />
            <button className="page-footer-zone" type="button" onClick={() => setHeaderFooter("footer")}>{t(props.language, "editor.footer")}</button>
          </div>
        </div>
      </div>

      <div className="editor-statusbar">
        <span>{t(props.language, "editor.pageCount", { current: 1, total: pageCount })}</span>
        <span>{t(props.language, "editor.wordCount", { count: editor.storage.characterCount.words() })}</span>
        <div className="editor-zoom-control">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.1))}>−</button>
          <input type="range" min="25" max="200" step="5" value={Math.round(zoom * 100)} onChange={(event) => setZoom(Number(event.target.value) / 100)} aria-label={t(props.language, "editor.zoom")} />
          <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.1))}>＋</button>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {headerFooter && (
        <HeaderFooterDialog
          language={props.language}
          kind={headerFooter}
          content={headerFooter === "header" ? document.header : document.footer}
          documentId={document.id}
          onClose={() => setHeaderFooter(null)}
          onSave={(content) => {
            updateDocument(headerFooter === "header" ? { header: content } : { footer: content });
            setHeaderFooter(null);
          }}
        />
      )}
    </div>
  );
}

function EditorToolbar(props: {
  editor: Editor;
  language: LanguageCode;
  document: EditorDocumentV1;
  searchOpen: boolean;
  onSearch(): void;
  onHeaderFooter(kind: "header" | "footer"): void;
  onPage(patch: Partial<EditorDocumentV1["page"]>): void;
  onInsertImages(files: File[]): void;
}) {
  const { editor } = props;
  const imageInput = useRef<HTMLInputElement>(null);
  return (
    <div className="editor-toolbar" role="toolbar" aria-label={t(props.language, "editor.formattingTools")}>
      <div className="toolbar-group">
        <ToolButton label={t(props.language, "editor.undo")} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↶</ToolButton>
        <ToolButton label={t(props.language, "editor.redo")} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↷</ToolButton>
      </div>
      <div className="toolbar-group">
        <select aria-label={t(props.language, "editor.paragraphStyle")} value={activeHeading(editor)} onChange={(event) => applyHeading(editor, event.target.value)}>
          <option value="paragraph">{t(props.language, "editor.normal")}</option>
          {[1, 2, 3, 4, 5, 6].map((level) => <option value={`h${level}`} key={level}>{t(props.language, "editor.heading", { level })}</option>)}
        </select>
        <select aria-label={t(props.language, "editor.fontFamily")} value={editor.getAttributes("textStyle").fontFamily || "Arial"} onChange={(event) => editor.chain().focus().setFontFamily(event.target.value).run()}>
          {['Arial', 'Segoe UI', 'Georgia', 'Times New Roman', 'Courier New'].map((font) => <option value={font} key={font}>{font}</option>)}
        </select>
        <select aria-label={t(props.language, "editor.fontSize")} value={editor.getAttributes("textStyle").fontSize || "11pt"} onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}>
          {[8, 9, 10, 11, 12, 14, 16, 18, 24, 32, 48].map((size) => <option value={`${size}pt`} key={size}>{size}</option>)}
        </select>
      </div>
      <div className="toolbar-group">
        <ToolButton active={editor.isActive("bold")} label={t(props.language, "editor.bold")} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolButton>
        <ToolButton active={editor.isActive("italic")} label={t(props.language, "editor.italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolButton>
        <ToolButton active={editor.isActive("underline")} label={t(props.language, "editor.underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolButton>
        <ToolButton active={editor.isActive("strike")} label={t(props.language, "editor.strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolButton>
        <label className="toolbar-color" title={t(props.language, "editor.textColor")}><span>A</span><input type="color" value={editor.getAttributes("textStyle").color || "#1d241f"} onChange={(event) => editor.chain().focus().setColor(event.target.value).run()} /></label>
        <label className="toolbar-color" title={t(props.language, "editor.highlight")}><span>▰</span><input type="color" value={editor.getAttributes("highlight").color || "#fff0a8"} onChange={(event) => editor.chain().focus().toggleHighlight({ color: event.target.value }).run()} /></label>
      </div>
      <div className="toolbar-group">
        {(["left", "center", "right", "justify"] as const).map((align) => <ToolButton key={align} active={editor.isActive({ textAlign: align })} label={t(props.language, `editor.align.${align}`)} onClick={() => editor.chain().focus().setTextAlign(align).run()}>{alignIcon(align)}</ToolButton>)}
        <ToolButton active={editor.isActive("bulletList")} label={t(props.language, "editor.bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</ToolButton>
        <ToolButton active={editor.isActive("orderedList")} label={t(props.language, "editor.numberedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1≡</ToolButton>
      </div>
      <div className="toolbar-group">
        <ToolButton label={t(props.language, "editor.link")} onClick={() => {
          const href = window.prompt(t(props.language, "editor.linkPrompt"), editor.getAttributes("link").href || "https://");
          if (href === null) return;
          if (!href.trim()) editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
        }}>🔗</ToolButton>
        <ToolButton label={t(props.language, "editor.image")} onClick={() => imageInput.current?.click()}>▧</ToolButton>
        <input ref={imageInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => {
          props.onInsertImages(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }} />
        <ToolButton label={t(props.language, "editor.table")} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</ToolButton>
        <ToolButton label={t(props.language, "editor.pageBreak")} onClick={() => editor.chain().focus().setPageBreak().run()}>↵</ToolButton>
        <ToolButton active={props.searchOpen} label={t(props.language, "editor.findReplace")} onClick={props.onSearch}>⌕</ToolButton>
      </div>
      <div className="toolbar-group toolbar-page-settings">
        <select aria-label={t(props.language, "editor.pageFormat")} value={props.document.page.format} onChange={(event) => props.onPage({ format: event.target.value as EditorDocumentV1["page"]["format"] })}>
          {Object.keys(pageSizes).map((format) => <option value={format} key={format}>{format.toUpperCase()}</option>)}
        </select>
        <ToolButton active={props.document.page.orientation === "landscape"} label={t(props.language, "editor.orientation")} onClick={() => props.onPage({ orientation: props.document.page.orientation === "portrait" ? "landscape" : "portrait" })}>▱</ToolButton>
        <ToolButton label={t(props.language, "editor.header")} onClick={() => props.onHeaderFooter("header")}>H</ToolButton>
        <ToolButton label={t(props.language, "editor.footer")} onClick={() => props.onHeaderFooter("footer")}>F</ToolButton>
      </div>
    </div>
  );
}

function HeaderFooterDialog(props: {
  language: LanguageCode;
  kind: "header" | "footer";
  content: Record<string, unknown> | null;
  documentId: string;
  onClose(): void;
  onSave(content: Record<string, unknown>): void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["paragraph"] }),
      DocumentImage.configure({ documentId: props.documentId }),
      UnsupportedObject,
    ],
    content: props.content ?? { type: "doc", content: [{ type: "paragraph" }] },
  });
  return createPortal(
    <div className="editor-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="header-footer-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="header-footer-title">{props.kind === "header" ? t(props.language, "editor.editHeader") : t(props.language, "editor.editFooter")}</h2>
        <div className="header-footer-toolbar">
          <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
          <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
          <button type="button" onClick={() => editor?.chain().focus().setTextAlign("center").run()}>≣</button>
          <button type="button" onClick={() => editor?.chain().focus().insertContent("{page}/{total}").run()}>{t(props.language, "editor.insertPageNumber")}</button>
        </div>
        <div className="header-footer-content"><EditorContent editor={editor} /></div>
        <div className="editor-modal-actions">
          <button type="button" onClick={props.onClose}>{t(props.language, "common.cancel")}</button>
          <button className="editor-primary-button" type="button" onClick={() => editor && props.onSave(editor.getJSON() as Record<string, unknown>)}>{t(props.language, "common.save")}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ToolButton(props: { children: React.ReactNode; label: string; onClick(): void; active?: boolean; disabled?: boolean }) {
  return <button className={`toolbar-button ${props.active ? "is-active" : ""}`} type="button" title={props.label} aria-label={props.label} aria-pressed={props.active || undefined} disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
}

async function insertImageFiles(
  editor: Editor,
  files: File[],
  documentId: string,
  onStored: (result: EditorAssetStoreResult) => void,
  onError: (error: unknown) => void,
  position?: number,
) {
  for (const file of files.slice(0, 8)) {
    if (!file.type.startsWith("image/") || file.size > 24 * 1024 * 1024) continue;
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const result = await api.editorStoreAsset(documentId, file.name, file.type, bytes);
      onStored(result);
      const content = {
        type: "image",
        attrs: {
          assetId: result.asset.id,
          src: `mc-asset://${result.asset.id}`,
          alt: file.name,
          title: file.name,
          width: "auto",
          align: "center",
        },
      };
      if (typeof position === "number") editor.chain().focus().insertContentAt(position, content).run();
      else editor.chain().focus().insertContent(content).run();
    } catch (error) {
      onError(error);
    }
  }
}

async function normalizeLegacyDocumentAssets(document: EditorDocumentV1): Promise<EditorDocumentV1> {
  let working = structuredClone(document);
  let changed = false;
  let invalidImage = false;

  async function normalize(value: unknown): Promise<unknown> {
    if (Array.isArray(value)) return Promise.all(value.map(normalize));
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    const type = typeof object.type === "string" ? object.type : "";
    if (type === "image" || type === "documentImage") {
      const attrs = { ...((object.attrs && typeof object.attrs === "object" ? object.attrs : {}) as Record<string, unknown>) };
      const source = typeof attrs.src === "string" ? attrs.src : "";
      const assetId = typeof attrs.assetId === "string" ? attrs.assetId : "";
      if (assetId && source === `mc-asset://${assetId}` && working.assets.some((asset) => asset.id === assetId)) {
        return { ...object, attrs };
      }
      const decoded = decodeImageDataUrl(source);
      if (decoded) {
        const result = await api.editorStoreAsset(working.id, String(attrs.title || attrs.alt || "image"), decoded.mimeType, decoded.bytes);
        working = { ...working, assets: result.document.assets };
        changed = true;
        return {
          ...object,
          type: "image",
          attrs: { ...attrs, assetId: result.asset.id, src: `mc-asset://${result.asset.id}` },
        };
      }
      changed = true;
      invalidImage = true;
      return { type: "unsupportedObject", attrs: { label: "Image locale indisponible" } };
    }
    const normalized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(object)) normalized[key] = await normalize(child);
    return normalized;
  }

  working = {
    ...working,
    content: await normalize(working.content) as Record<string, unknown>,
    header: working.header ? await normalize(working.header) as Record<string, unknown> : null,
    footer: working.footer ? await normalize(working.footer) as Record<string, unknown> : null,
  };
  if (invalidImage && !working.warnings.some((warning) => warning.code === "missingLegacyImage")) {
    working.warnings = [...working.warnings, {
      code: "missingLegacyImage",
      message: "Une ancienne image locale n’était plus accessible et a été remplacée par un bloc explicite.",
      blocksOverwrite: true,
    }];
  }
  return changed ? api.editorSaveDraft(working) : working;
}

async function normalizeImportedHtmlAssets(document: EditorDocumentV1, html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  let working = document;
  for (const image of Array.from(parsed.querySelectorAll("img"))) {
    const source = image.getAttribute("src") || "";
    const decoded = decodeImageDataUrl(source);
    if (decoded) {
      const name = image.getAttribute("title") || image.getAttribute("alt") || "image";
      const result = await api.editorStoreAsset(working.id, name, decoded.mimeType, decoded.bytes);
      working = { ...working, assets: result.document.assets };
      image.setAttribute("src", `mc-asset://${result.asset.id}`);
      image.setAttribute("data-asset-id", result.asset.id);
      continue;
    }
    const assetId = image.getAttribute("data-asset-id") || "";
    if (!assetId || source !== `mc-asset://${assetId}` || !working.assets.some((asset) => asset.id === assetId)) {
      image.replaceWith(parsed.createTextNode("[Image distante ou inaccessible supprimée]"));
    }
  }
  return { document: working, html: parsed.body.innerHTML };
}

function decodeImageDataUrl(source: string): { mimeType: string; bytes: number[] } | null {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(source);
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ""));
    if (binary.length > 24 * 1024 * 1024) return null;
    return { mimeType: match[1].toLowerCase(), bytes: Array.from(binary, (character) => character.charCodeAt(0)) };
  } catch {
    return null;
  }
}

function sanitizeImportedHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script,style,iframe,object,embed,link,meta,form,input,button").forEach((element) => element.remove());
  parsed.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attribute.name);
    }
  });
  parsed.querySelectorAll("img").forEach((image) => {
    const source = image.getAttribute("src") || "";
    if (/^(https?:|javascript:|data:text)/i.test(source)) image.remove();
  });
  parsed.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (!/^(https?:|mailto:|#)/i.test(href)) link.removeAttribute("href");
  });
  return parsed.body.innerHTML;
}

function activeHeading(editor: Editor) {
  for (let level = 1; level <= 6; level += 1) if (editor.isActive("heading", { level })) return `h${level}`;
  return "paragraph";
}

function applyHeading(editor: Editor, value: string) {
  if (value === "paragraph") editor.chain().focus().setParagraph().run();
  else editor.chain().focus().toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
}

function findNext(editor: Editor, query: string) {
  if (!query) return false;
  const start = editor.state.selection.to;
  const matches: Array<{ from: number; to: number }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const index = node.text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    if (index < 0) return;
    matches.push({ from: pos + index, to: pos + index + query.length });
  });
  const selected = matches.find((item) => item.from >= start) ?? matches[0];
  if (!selected) return false;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, selected.from, selected.to)).scrollIntoView());
  editor.commands.focus();
  return true;
}

function replaceSelection(editor: Editor, query: string, replacement: string) {
  const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);
  if (selected.toLocaleLowerCase() !== query.toLocaleLowerCase()) {
    if (!findNext(editor, query)) return;
  }
  editor.chain().focus().insertContent(replacement).run();
}

function alignIcon(align: "left" | "center" | "right" | "justify") {
  return align === "left" ? "≡" : align === "center" ? "≣" : align === "right" ? "≡" : "▤";
}

function formatRecentDate(value: string, language: LanguageCode) {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date);
}

function editorError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^[A-Z][A-Z0-9_]+:/, "");
}

function DocumentSketchIcon() {
  return <svg className="editor-document-sketch" viewBox="0 0 96 116" aria-hidden="true"><path d="M18 5h42l22 22v80H18z"/><path d="M60 5v24h22M34 55h32M34 70h32M34 85h24"/><circle cx="76" cy="101" r="8"/></svg>;
}

function FolderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v10H3z"/></svg>;
}

function MiniDocumentIcon(props: { format: string }) {
  return <span className="mini-document-icon" aria-hidden="true"><span>—</span><span>—</span><small>{props.format.slice(0, 4).toUpperCase()}</small></span>;
}
