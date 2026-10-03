import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalAccessibility } from "../hooks/useModalAccessibility";
import type { EditorDocumentSummary } from "../lib/api";
import { t, type LanguageCode } from "../i18n";

export type RecentDocumentDialog = {
  type: "rename" | "delete";
  item: EditorDocumentSummary;
} | {
  type: "deleteMany";
  items: EditorDocumentSummary[];
};

interface RecentDocumentDialogsProps {
  language: LanguageCode;
  dialog: RecentDocumentDialog | null;
  renameTitle: string;
  onRenameTitle(title: string): void;
  onRename(id: string, title: string): void;
  onDelete(id: string): void;
  onDeleteMany(ids: string[]): Promise<string[]>;
  onBatchDeleteComplete(failedIds: string[]): void;
  onClose(): void;
}

export function RecentDocumentDialogs(props: RecentDocumentDialogsProps) {
  const renameDialogRef = useRef<HTMLFormElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setSubmitting(false), [props.dialog]);

  useModalAccessibility({
    isOpen: props.dialog?.type === "rename",
    surfaceRef: renameDialogRef,
    onEscape: props.onClose,
  });
  useModalAccessibility({
    isOpen: props.dialog?.type === "delete" || props.dialog?.type === "deleteMany",
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

  const isRename = props.dialog.type === "rename";
  const batchItems = props.dialog.type === "deleteMany" ? props.dialog.items : [];
  const singleItem = props.dialog.type !== "deleteMany" ? props.dialog.item : null;
  const isBatch = batchItems.length > 0;
  const deleteCount = isBatch ? batchItems.length : 1;

  return createPortal(
    isRename ? (
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
            {isBatch
              ? t(props.language, "editor.deleteDocuments", { count: deleteCount })
              : t(props.language, "editor.deleteDocument")}
          </h2>
          <p>
            {isBatch
              ? t(props.language, "editor.deleteDocumentsConfirm", { count: deleteCount })
              : t(props.language, "editor.deleteDocumentConfirm", {
                  name: singleItem?.title ?? "",
                })}
          </p>
          <div className="editor-modal-actions">
            <button type="button" disabled={submitting} onClick={props.onClose}>
              {t(props.language, "common.cancel")}
            </button>
            <button
              className="editor-danger-button"
              type="button"
              disabled={submitting}
              onClick={() => {
                if (props.dialog?.type === "deleteMany") {
                  setSubmitting(true);
                  void props.onDeleteMany(props.dialog.items.map((item) => item.id)).then((failedIds) => {
                    props.onBatchDeleteComplete(failedIds);
                    props.onClose();
                  }).finally(() => setSubmitting(false));
                } else if (props.dialog?.type === "delete") {
                  props.onDelete(props.dialog.item.id);
                  props.onClose();
                }
              }}
            >
              {submitting ? t(props.language, "editor.deleting") : t(props.language, "editor.delete")}
            </button>
          </div>
        </div>
      </div>
    ),
    document.body,
  );
}
