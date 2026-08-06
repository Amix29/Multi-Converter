import type { RefObject } from "react";
import type { PdfEditorSessionV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";

interface PdfEditorToolbarProps {
  language: LanguageCode;
  session: PdfEditorSessionV1;
  activePage: number;
  zoom: number;
  focusMode: boolean;
  focusButtonRef: RefObject<HTMLButtonElement | null>;
  pendingPatchCount: number;
  inspectorOpen: boolean;
  saving: boolean;
  onClose(): void;
  onPage(page: number): void;
  onZoom(zoom: number): void;
  onRotate(): void;
  onReset(): void;
  onToggleFocus(): void;
  onToggleInspector(): void;
  onSaveAs(): void;
}

export function PdfEditorToolbar(props: PdfEditorToolbarProps) {
  const canRotate = props.session.permissions.canAssemble;
  return (
    <header className="pdf-editor-toolbar">
      <div className="pdf-editor-title">
        <button
          className="editor-back-button"
          type="button"
          aria-label={t(props.language, "editor.backToDocuments")}
          onClick={props.onClose}
        >
          <BackIcon />
          <span>{t(props.language, "editor.backToDocuments")}</span>
        </button>
        <div>
          <span className="pdf-editor-kicker">{t(props.language, "pdfEditor.structural")}</span>
          <h1 title={props.session.sourceName}>{props.session.sourceName}</h1>
          <span
            className="pdf-editor-change-state"
            aria-label={t(props.language, "pdfEditor.pending", { count: props.pendingPatchCount })}
            title={t(props.language, "pdfEditor.pending", { count: props.pendingPatchCount })}
          >
            <span aria-hidden="true">{props.pendingPatchCount}</span>
          </span>
        </div>
      </div>

      <div className="pdf-page-navigation" aria-label={t(props.language, "pdfEditor.pageNavigation")}>
        <button type="button" disabled={props.activePage <= 1} onClick={() => props.onPage(props.activePage - 1)} aria-label={t(props.language, "pdfEditor.previousPage")}>
          ‹
        </button>
        <label>
          <span className="visually-hidden">{t(props.language, "pdfEditor.page")}</span>
          <input
            type="number"
            min={1}
            max={props.session.pageCount}
            value={props.activePage}
            onChange={(event) => props.onPage(Number(event.target.value))}
          />
          <span>/ {props.session.pageCount}</span>
        </label>
        <button type="button" disabled={props.activePage >= props.session.pageCount} onClick={() => props.onPage(props.activePage + 1)} aria-label={t(props.language, "pdfEditor.nextPage")}>
          ›
        </button>
      </div>

      <div className="pdf-editor-tools" role="toolbar" aria-label={t(props.language, "pdfEditor.tools")}>
        <label className="pdf-zoom-control">
          <span>{t(props.language, "editor.zoom")}</span>
          <input
            type="range"
            aria-label={t(props.language, "editor.zoom")}
            min="0.35"
            max="2"
            step="0.05"
            value={props.zoom}
            onChange={(event) => props.onZoom(Number(event.target.value))}
          />
          <output>{Math.round(props.zoom * 100)}%</output>
        </label>
        <button
          type="button"
          aria-label={t(props.language, "pdfEditor.rotate")}
          disabled={!canRotate}
          onClick={props.onRotate}
          title={canRotate ? undefined : t(props.language, "pdfEditor.permissionBlocked")}
        >
          <RotateIcon />
          <span>{t(props.language, "pdfEditor.rotate")}</span>
        </button>
        <button
          type="button"
          aria-label={t(props.language, "pdfEditor.resetChanges")}
          disabled={!props.pendingPatchCount || props.saving}
          onClick={props.onReset}
        >
          <ResetIcon />
          <span>{t(props.language, "pdfEditor.resetChanges")}</span>
        </button>
        <button
          ref={props.focusButtonRef}
          type="button"
          aria-label={t(props.language, props.focusMode ? "editor.exitFocusMode" : "editor.enterFocusMode")}
          aria-pressed={props.focusMode}
          onClick={props.onToggleFocus}
        >
          <FocusIcon active={props.focusMode} />
          <span>{t(props.language, props.focusMode ? "editor.exitFocusMode" : "editor.enterFocusMode")}</span>
        </button>
        <button
          className="pdf-inspector-toggle"
          type="button"
          aria-label={t(props.language, "pdfEditor.inspector")}
          aria-expanded={props.inspectorOpen}
          aria-controls="pdf-editor-inspector"
          onClick={props.onToggleInspector}
        >
          <InspectorIcon />
          <span>{t(props.language, "pdfEditor.inspector")}</span>
        </button>
        <button
          className="pdf-save-as"
          type="button"
          aria-label={props.saving ? t(props.language, "pdfEditor.saving") : t(props.language, "editor.saveAs")}
          disabled={!props.pendingPatchCount || props.saving}
          onClick={props.onSaveAs}
        >
          <SaveAsIcon />
          <span>{props.saving ? t(props.language, "pdfEditor.saving") : t(props.language, "editor.saveAs")}</span>
        </button>
      </div>
    </header>
  );
}

function BackIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>;
}

function RotateIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8V3l-2 2a8 8 0 1 0 2.2 8" /><path d="M19 3h-5" /></svg>;
}

function ResetIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M5 5a9 9 0 1 1-1 11" /></svg>;
}

function SaveAsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z" /><path d="M9 3v6h6V3M9 17h6m-3-3v6" /></svg>;
}

function FocusIcon(props: { active: boolean }) {
  return props.active ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6" /></svg>
  );
}

function InspectorIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16M7 8h4M7 12h4M7 16h3" /></svg>;
}
