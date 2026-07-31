import { useEffect, useRef, useState } from "react";
import type { EditorDocumentSummary } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import {
  DocumentSketchIcon,
  FolderIcon,
  MiniDocumentIcon,
} from "./EditorIcons";
import {
  RecentDocumentDialogs,
  type RecentDocumentDialog,
} from "./RecentDocumentDialogs";

interface EditorLandingProps {
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
}

export function EditorLanding(props: EditorLandingProps) {
  const [dragging, setDragging] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<RecentDocumentDialog | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const dragDepth = useRef(0);
  const dialogTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const menuId = openMenuId;
    function closeMenu(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const owner = target?.closest("[data-recent-menu]");
      if (owner?.getAttribute("data-recent-menu") !== menuId)
        setOpenMenuId(null);
    }
    function closeMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenMenuId(null);
        window.requestAnimationFrame(() => recentMenuTrigger(menuId)?.focus());
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target?.closest("[role='menu']")) return;
      const items = recentMenuItems(menuId);
      if (!items.length) return;
      event.preventDefault();
      const currentIndex = items.findIndex((item) => item === target);
      if (event.key === "Home") items[0].focus();
      else if (event.key === "End") items[items.length - 1].focus();
      else if (event.key === "ArrowDown")
        items[(currentIndex + 1 + items.length) % items.length].focus();
      else items[(currentIndex - 1 + items.length) % items.length].focus();
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenuWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenuWithKeyboard);
    };
  }, [openMenuId]);

  function openDialog(next: RecentDocumentDialog) {
    const owner = Array.from(
      document.querySelectorAll<HTMLElement>("[data-recent-menu]"),
    ).find((element) => element.dataset.recentMenu === next.item.id);
    dialogTrigger.current =
      owner?.querySelector<HTMLElement>(".recent-document-menu-trigger") ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    setOpenMenuId(null);
    setDialog(next);
  }

  function closeDialog() {
    setDialog(null);
    window.requestAnimationFrame(() => dialogTrigger.current?.focus());
  }

  function beginRename(item: EditorDocumentSummary) {
    setRenameTitle(item.title);
    openDialog({ type: "rename", item });
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
      <section
        className="editor-welcome-card"
        aria-labelledby="editor-welcome-title"
      >
        <div className="editor-welcome-visual">
          <DocumentSketchIcon />
        </div>
        <div className="editor-welcome-copy">
          <span className="editor-eyebrow">
            {t(props.language, "editor.localEyebrow")}
          </span>
          <h2 id="editor-welcome-title">
            {t(props.language, "editor.welcomeTitle")}
          </h2>
          <p className="editor-welcome-description">
            {t(props.language, "editor.welcomeDescription")}
          </p>
          <div className="editor-welcome-actions">
            <button
              className="editor-primary-button"
              type="button"
              disabled={props.busy}
              onClick={props.onCreate}
            >
              <span aria-hidden="true">＋</span>
              {t(props.language, "editor.newDocument")}
            </button>
            <button
              className="editor-secondary-button"
              type="button"
              disabled={props.busy}
              onClick={props.onOpen}
            >
              <FolderIcon />
              {t(props.language, "editor.openDocument")}
            </button>
          </div>
          <p className="editor-supported-formats">
            {t(props.language, "editor.supportedFormats")}
          </p>
        </div>
        <div className="editor-drop-hint">
          <span className="editor-drop-icon" aria-hidden="true">
            ↓
          </span>
          <span>
            <strong>
              {dragging
                ? t(props.language, "editor.releaseDocument")
                : t(props.language, "editor.dropDocument")}
            </strong>
            <small>{t(props.language, "editor.dropPrivacy")}</small>
          </span>
        </div>
      </section>

      <section
        className="recent-documents"
        aria-labelledby="recent-documents-title"
      >
        <div className="recent-documents-heading">
          <div>
            <span className="editor-eyebrow">
              {t(props.language, "editor.yourWorkspace")}
            </span>
            <h2 id="recent-documents-title">
              {t(props.language, "editor.recentDocuments")}
            </h2>
          </div>
          {!!props.recent.length && (
            <span className="recent-document-count">{props.recent.length}</span>
          )}
        </div>
        {!props.recent.length ? (
          <div className="editor-empty-recent">
            {t(props.language, "editor.noRecentDocuments")}
          </div>
        ) : (
          <div className="recent-document-grid">
            {props.recent.slice(0, 10).map((item) => (
              <article
                className={`recent-document-card ${openMenuId === item.id ? "is-menu-open" : ""}`}
                key={item.id}
              >
                <button
                  className="recent-document-open"
                  type="button"
                  onClick={() => props.onOpenRecent(item.id)}
                >
                  <MiniDocumentIcon format={item.format} />
                  <span className="recent-document-copy">
                    <strong>{item.title}</strong>
                    <small>
                      <span>{item.format.toUpperCase()}</span>
                      {formatRecentDate(item.updatedAt, props.language)}
                    </small>
                  </span>
                </button>
                <div
                  className="recent-document-menu"
                  data-recent-menu={item.id}
                >
                  <button
                    className="recent-document-menu-trigger"
                    type="button"
                    aria-label={t(props.language, "editor.documentActions", {
                      name: item.title,
                    })}
                    aria-haspopup="menu"
                    aria-expanded={openMenuId === item.id}
                    onClick={() =>
                      setOpenMenuId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowDown" && event.key !== "ArrowUp")
                        return;
                      event.preventDefault();
                      setOpenMenuId(item.id);
                      window.requestAnimationFrame(() => {
                        const items = recentMenuItems(item.id);
                        (event.key === "ArrowUp"
                          ? items[items.length - 1]
                          : items[0]
                        )?.focus();
                      });
                    }}
                  >
                    •••
                  </button>
                  {openMenuId === item.id && (
                    <div className="recent-document-menu-popover" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => beginRename(item)}
                      >
                        {t(props.language, "editor.rename")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuId(null);
                          props.onDuplicateRecent(item);
                        }}
                      >
                        {t(props.language, "editor.duplicate")}
                      </button>
                      <span />
                      <button
                        className="is-danger"
                        type="button"
                        role="menuitem"
                        onClick={() => openDialog({ type: "delete", item })}
                      >
                        {t(props.language, "editor.delete")}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {dragging && (
        <div className="editor-drop-overlay" aria-live="polite">
          <span>{t(props.language, "editor.releaseDocument")}</span>
        </div>
      )}
      <RecentDocumentDialogs
        language={props.language}
        dialog={dialog}
        renameTitle={renameTitle}
        onRenameTitle={setRenameTitle}
        onRename={props.onRenameRecent}
        onDelete={props.onDeleteRecent}
        onClose={closeDialog}
      />
    </div>
  );
}

function formatRecentDate(value: string, language: LanguageCode) {
  const numeric = Number(value);
  const date =
    Number.isFinite(numeric) && numeric > 0
      ? new Date(numeric * 1000)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
    date,
  );
}

function recentMenuOwner(id: string) {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-recent-menu]"),
  ).find((element) => element.dataset.recentMenu === id);
}

function recentMenuTrigger(id: string) {
  return (
    recentMenuOwner(id)?.querySelector<HTMLButtonElement>(
      ".recent-document-menu-trigger",
    ) ?? null
  );
}

function recentMenuItems(id: string) {
  return Array.from(
    recentMenuOwner(id)?.querySelectorAll<HTMLButtonElement>(
      "[role='menuitem']",
    ) ?? [],
  );
}
