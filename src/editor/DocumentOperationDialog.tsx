import { useRef } from "react";
import { createPortal } from "react-dom";
import { useModalAccessibility } from "../hooks/useModalAccessibility";
import { t, type LanguageCode, type TranslationKey } from "../i18n";
import type { EditorFormat } from "../lib/api";
import "./editor-operations.css";

export type DocumentOperation = "overwrite" | "name" | "exporting" | null;

export function DocumentOperationDialog(props: {
  language: LanguageCode;
  operation: DocumentOperation;
  title: string;
  titleDraft: string;
  format: EditorFormat;
  progress: number | null;
  cancellable: boolean;
  onTitleDraft(value: string): void;
  onCancel(): void;
  onConfirmOverwrite(): void;
  onConfirmTitle(): void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const exporting = props.operation === "exporting";
  const canEscape = !exporting || props.cancellable;
  useModalAccessibility({
    isOpen: props.operation !== null,
    surfaceRef,
    initialFocusRef: props.operation === "name" ? titleInputRef : undefined,
    onEscape: canEscape ? props.onCancel : undefined,
  });
  if (!props.operation) return null;

  return createPortal(
    <div className="editor-modal-backdrop editor-operation-backdrop" role="presentation" onMouseDown={!exporting ? props.onCancel : undefined}>
      <div
        ref={surfaceRef}
        className="editor-modal editor-operation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-operation-title"
        aria-describedby={exporting ? "editor-operation-description" : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {props.operation === "overwrite" && (
          <>
            <span className="editor-eyebrow">{label(props.language, "editor.saveConfirmation")}</span>
            <h2 id="editor-operation-title">{label(props.language, "editor.overwriteTitle")}</h2>
            <p>{t(props.language, "editor.confirmOverwrite", { name: props.title })}</p>
            <div className="editor-modal-actions">
              <button type="button" onClick={props.onCancel}>{t(props.language, "common.cancel")}</button>
              <button className="editor-primary-button" type="button" onClick={props.onConfirmOverwrite}>{label(props.language, "editor.replaceFile")}</button>
            </div>
          </>
        )}

        {props.operation === "name" && (
          <form onSubmit={(event) => { event.preventDefault(); props.onConfirmTitle(); }}>
            <span className="editor-eyebrow">{label(props.language, "editor.exportPreparation")}</span>
            <h2 id="editor-operation-title">{label(props.language, "editor.nameBeforeExport")}</h2>
            <p>{label(props.language, "editor.nameBeforeExportDescription")}</p>
            <label htmlFor="editor-export-title">{t(props.language, "editor.documentName")}</label>
            <input
              ref={titleInputRef}
              id="editor-export-title"
              value={props.titleDraft}
              maxLength={240}
              onChange={(event) => props.onTitleDraft(event.target.value)}
            />
            <div className="editor-modal-actions">
              <button type="button" onClick={props.onCancel}>{t(props.language, "common.cancel")}</button>
              <button className="editor-primary-button" type="submit" disabled={!props.titleDraft.trim()}>{label(props.language, "editor.continueExport")}</button>
            </div>
          </form>
        )}

        {exporting && (
          <>
            <span className="editor-eyebrow">{label(props.language, "editor.exportingEyebrow")}</span>
            <h2 id="editor-operation-title">{label(props.language, "editor.exportingTitle")}</h2>
            <p id="editor-operation-description" aria-live="polite">
              {t(props.language, "editor.exportingDescription", { format: props.format.toUpperCase() })}
            </p>
            <div
              className={`editor-operation-progress ${props.progress === null ? "is-indeterminate" : ""}`}
              role="progressbar"
              aria-label={label(props.language, "editor.exportingTitle")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={props.progress === null ? undefined : Math.round(props.progress * 100)}
            >
              <span style={props.progress === null ? undefined : { width: `${Math.round(props.progress * 100)}%` }} />
            </div>
            {props.progress !== null && (
              <strong className="editor-operation-percentage" aria-live="polite">
                {Math.round(props.progress * 100)}%
              </strong>
            )}
            <small>{label(props.language, "editor.exportingKeepOpen")}</small>
            {props.cancellable && (
              <div className="editor-modal-actions">
                <button type="button" onClick={props.onCancel}>{t(props.language, "common.cancel")}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function label(language: LanguageCode, key: string) {
  return t(language, key as TranslationKey);
}
