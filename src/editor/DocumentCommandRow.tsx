import type { EditorFormat } from "../lib/api";
import { t, type LanguageCode } from "../i18n";

const exportFormats: EditorFormat[] = ["docx", "odt", "rtf", "pdf", "html", "md", "txt"];

interface DocumentCommandRowProps {
  language: LanguageCode;
  title: string;
  dirty: boolean;
  saving: boolean;
  exportFormat: EditorFormat;
  onBack(): void;
  onTitle(title: string): void;
  onSave(mode: "save" | "saveAs"): void;
  onExport(): void;
  onExportFormat(format: EditorFormat): void;
}

export function DocumentCommandRow(props: DocumentCommandRowProps) {
  return (
    <div className="document-command-row" data-density="compact">
      <button
        className="editor-back-button"
        type="button"
        disabled={props.saving}
        onClick={props.onBack}
        aria-label={t(props.language, "editor.backToDocuments")}
      >←</button>
      <input
        className="document-title-input"
        value={props.title}
        disabled={props.saving}
        aria-label={t(props.language, "editor.documentName")}
        onChange={(event) => props.onTitle(event.target.value.slice(0, 240))}
      />
      <span className={`document-save-state ${props.dirty ? "is-dirty" : ""}`} aria-live="polite">
        {props.saving ? t(props.language, "editor.saving") : props.dirty ? t(props.language, "editor.unsaved") : t(props.language, "editor.savedState")}
      </span>
      <div className="document-command-actions">
        <button type="button" onClick={() => props.onSave("save")} disabled={props.saving}>{t(props.language, "editor.save")}</button>
        <button type="button" onClick={() => props.onSave("saveAs")} disabled={props.saving}>{t(props.language, "editor.saveAs")}</button>
        <select disabled={props.saving} value={props.exportFormat} onChange={(event) => props.onExportFormat(event.target.value as EditorFormat)} aria-label={t(props.language, "editor.exportFormat")}>
          {exportFormats.map((format) => <option value={format} key={format}>{format.toUpperCase()}</option>)}
        </select>
        <button className="editor-export-button" type="button" onClick={props.onExport} disabled={props.saving}>{t(props.language, "editor.export")}</button>
      </div>
    </div>
  );
}
