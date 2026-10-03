import type { Ref } from "react";
import type { EditorFormat } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { EditorToolbarIcon } from "./EditorToolbarIcons";

const exportFormats: EditorFormat[] = ["docx", "odt", "rtf", "pdf", "html", "md", "txt"];

interface DocumentCommandRowProps {
  language: LanguageCode;
  title: string;
  dirty: boolean;
  saving: boolean;
  focusMode: boolean;
  focusButtonRef: Ref<HTMLButtonElement>;
  exportFormat: EditorFormat;
  onBack(): void;
  onFocusMode(): void;
  onTitle(title: string): void;
  onSave(mode: "save" | "saveAs"): void;
  onExport(): void;
  onExportFormat(format: EditorFormat): void;
}

export function DocumentCommandRow(props: DocumentCommandRowProps) {
  return (
    <div className="document-command-row" data-density="compact">
      <div className="document-identity">
        <button
          className="editor-back-button"
          type="button"
          disabled={props.saving}
          onClick={props.onBack}
          aria-label={t(props.language, "editor.backToDocuments")}
        >
          <EditorToolbarIcon name="arrowLeft" />
          <span>{t(props.language, "editor.documents")}</span>
        </button>
        <div className="document-title-stack">
          <input
            className="document-title-input"
            value={props.title}
            disabled={props.saving}
            aria-label={t(props.language, "editor.documentName")}
            onInput={(event) => props.onTitle(event.currentTarget.value.slice(0, 240))}
          />
          <span className={`document-save-state ${props.dirty ? "is-dirty" : ""}`} aria-live="polite">
            {props.saving ? t(props.language, "editor.saving") : props.dirty ? t(props.language, "editor.unsaved") : t(props.language, "editor.savedState")}
          </span>
        </div>
      </div>
      <div className="document-command-actions">
        <button
          ref={props.focusButtonRef}
          className="editor-focus-button"
          type="button"
          aria-pressed={props.focusMode}
          aria-label={t(
            props.language,
            props.focusMode ? "editor.exitFocusMode" : "editor.enterFocusMode",
          )}
          title={t(
            props.language,
            props.focusMode ? "editor.exitFocusMode" : "editor.enterFocusMode",
          )}
          onClick={props.onFocusMode}
        >
          <EditorToolbarIcon name={props.focusMode ? "fullscreenExit" : "fullscreen"} />
          <span>
            {t(
              props.language,
              props.focusMode ? "editor.exitFocusMode" : "editor.enterFocusMode",
            )}
          </span>
        </button>
        <div className="document-save-actions">
          <button type="button" onClick={() => props.onSave("save")} disabled={props.saving}>{t(props.language, "editor.save")}</button>
          <button type="button" onClick={() => props.onSave("saveAs")} disabled={props.saving}>{t(props.language, "editor.saveAs")}</button>
        </div>
        <div className="document-export-actions">
          <select disabled={props.saving} value={props.exportFormat} onChange={(event) => props.onExportFormat(event.target.value as EditorFormat)} aria-label={t(props.language, "editor.exportFormat")}>
            {exportFormats.map((format) => <option value={format} key={format}>{format.toUpperCase()}</option>)}
          </select>
          <button className="editor-export-button" type="button" onClick={props.onExport} disabled={props.saving}>{t(props.language, "editor.export")}</button>
        </div>
      </div>
    </div>
  );
}
