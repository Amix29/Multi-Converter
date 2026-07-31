import { useRef } from "react";
import { createPortal } from "react-dom";
import { useModalAccessibility } from "../hooks/useModalAccessibility";
import type { EditorDocumentSummary } from "../lib/api";
import { t, type LanguageCode } from "../i18n";

export type RecentDocumentDialog = {
  type: "rename" | "delete";
  item: EditorDocumentSummary;
};

interface RecentDocumentDialogsProps {
  language: LanguageCode;
  dialog: RecentDocumentDialog | null;
  renameTitle: string;
  onRenameTitle(title: string): void;
  onRename(id: string, title: string): void;
  onDelete(id: string): void;
  onClose(): void;
}

export function RecentDocumentDialogs(props: RecentDocumentDialogsProps) {
  const renameDialogRef = useRef<HTMLFormElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);

  useModalAccessibility({
    isOpen: props.dialog?.type === "rename",
    surfaceRef: renameDialogRef,
    onEscape: props.onClose,
  });
  useModalAccessibility({
    isOpen: props.dialog?.type === "delete",
    surfaceRef: deleteDialogRef,
    onEscape: props.onClose,
  });

  if (!props.dialog) return null;

  function submitRename(event: React.FormEvent) {
    event.preventDefault();
    const title = props.renameTitle.trim();
    if (!title || props.dialog?.type !== "rename") return;
    props.onRename(props.dialog.item.id, title);
    props.onClose();
  }

  return createPortal(
    props.dialog.type === "rename" ? (
      <div
        className="editor-modal-backdrop"
        role="presentation"
        onMouseDown={props.onClose}
      >
        <form
          ref={renameDialogRef}
          className="editor-modal editor-document-action-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-document-title"
          tabIndex={-1}
          onSubmit={submitRename}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <span className="editor-eyebrow">
            {t(props.language, "editor.documentSettings")}
          </span>
          <h2 id="rename-document-title">
            {t(props.language, "editor.renameDocument")}
          </h2>
          <label htmlFor="editor-rename-input">
            {t(props.language, "editor.documentName")}
          </label>
          <input
            id="editor-rename-input"
            autoFocus
            maxLength={240}
            value={props.renameTitle}
            onChange={(event) => props.onRenameTitle(event.target.value)}
          />
          <div className="editor-modal-actions">
            <button type="button" onClick={props.onClose}>
              {t(props.language, "common.cancel")}
            </button>
            <button
              className="editor-primary-button"
              type="submit"
              disabled={!props.renameTitle.trim()}
            >
              {t(props.language, "editor.rename")}
            </button>
          </div>
        </form>
      </div>
    ) : (
      <div
        className="editor-modal-backdrop"
        role="presentation"
        onMouseDown={props.onClose}
      >
        <div
          ref={deleteDialogRef}
          className="editor-modal editor-document-action-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-document-title"
          tabIndex={-1}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <span className="editor-eyebrow is-danger">
            {t(props.language, "editor.irreversibleAction")}
          </span>
          <h2 id="delete-document-title">
            {t(props.language, "editor.deleteDocument")}
          </h2>
          <p>
            {t(props.language, "editor.deleteDocumentConfirm", {
              name: props.dialog.item.title,
            })}
          </p>
          <div className="editor-modal-actions">
            <button type="button" onClick={props.onClose}>
              {t(props.language, "common.cancel")}
            </button>
            <button
              className="editor-danger-button"
              type="button"
              onClick={() => {
                props.onDelete(props.dialog!.item.id);
                props.onClose();
              }}
            >
              {t(props.language, "editor.delete")}
            </button>
          </div>
        </div>
      </div>
    ),
    document.body,
  );
}
