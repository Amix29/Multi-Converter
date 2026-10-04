import { useEffect, useState } from "react";
import { t, type LanguageCode } from "../i18n";
import { EditorToolbarIcon } from "./EditorToolbarIcons";
import { clampEditorZoom, sliderToZoom, zoomToSlider } from "./editorZoom";

export function EditorZoomControl(props: { language: LanguageCode; value: number; onChange(value: number): void }) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);
  function commit() {
    const value = Number(draft.replace("%", "").trim());
    if (draft.trim() && Number.isFinite(value)) props.onChange(clampEditorZoom(value));
    else setDraft(String(props.value));
  }
  return (
    <div className="editor-zoom-control">
      <button type="button" aria-label={t(props.language, "editor.zoomOut")} title="Ctrl+−" disabled={props.value === 10} onClick={() => props.onChange(props.value - 10)}><EditorToolbarIcon name="zoomOut" /></button>
      <div className="editor-zoom-track">
        <input type="range" min="0" max="100" step="0.5" value={zoomToSlider(props.value)} aria-label={t(props.language, "editor.zoom")} aria-valuemin={10} aria-valuemax={500} aria-valuenow={props.value} aria-valuetext={`${props.value}%`} onChange={(event) => props.onChange(sliderToZoom(Number(event.target.value)))} />
        <span className="editor-zoom-default-mark" aria-hidden="true" />
      </div>
      <button type="button" aria-label={t(props.language, "editor.zoomIn")} title="Ctrl++" disabled={props.value === 500} onClick={() => props.onChange(props.value + 10)}><EditorToolbarIcon name="zoomIn" /></button>
      <label className="editor-zoom-value">
        <input type="text" inputMode="numeric" value={draft} aria-label={t(props.language, "editor.zoomPercent")} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); commit(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(String(props.value)); }
        }} /><span aria-hidden="true">%</span>
      </label>
      <button className="editor-zoom-reset" type="button" aria-label={t(props.language, "editor.resetZoom")} title={`${t(props.language, "editor.resetZoom")} (Ctrl+0)`} onClick={() => props.onChange(100)}>100%</button>
    </div>
  );
}
