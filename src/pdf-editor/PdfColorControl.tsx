import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { t, type LanguageCode } from "../i18n";
import {
  editorStandardColors,
  editorThemeColorColumns,
  normalizedHexColor,
} from "../editor/editorFormatting";
import { normalizePdfHex } from "./pdfEditorModel";

interface PdfColorControlProps {
  language: LanguageCode;
  label: string;
  value?: string | null;
  disabled?: boolean;
  onChange(color: string): void;
}

export function PdfColorControl(props: PdfColorControlProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(normalizePdfHex(props.value));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setDraft(normalizePdfHex(props.value)), [props.value]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  function choose(color: string) {
    setDraft(color);
    props.onChange(color);
    setOpen(false);
  }

  function moveGridFocus(event: ReactKeyboardEvent<HTMLButtonElement>, columns: number) {
    if (!/^(Arrow(?:Left|Right|Up|Down)|Home|End)$/.test(event.key)) return;
    const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.indexOf(event.currentTarget);
    const next = event.key === "ArrowRight" ? index + 1
      : event.key === "ArrowLeft" ? index - 1
        : event.key === "ArrowDown" ? index + columns
          : event.key === "ArrowUp" ? index - columns
            : event.key === "Home" ? 0 : buttons.length - 1;
    event.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, next))]?.focus();
  }

  return (
    <div className="pdf-color-control" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="pdf-color-trigger"
        disabled={props.disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" style={{ background: draft }} />
        {props.label}
      </button>
      {open && (
        <div className="pdf-color-popover" role="dialog" aria-label={props.label}>
          <strong>{props.label}</strong>
          <span>{t(props.language, "editor.themeColors")}</span>
          <div className="pdf-color-theme" role="grid">
            {editorThemeColorColumns.flat().map((color) => (
              <button
                key={color}
                type="button"
                role="gridcell"
                aria-label={color}
                aria-pressed={draft === color}
                style={{ background: color }}
                onKeyDown={(event) => moveGridFocus(event, 10)}
                onClick={() => choose(color)}
              />
            ))}
          </div>
          <span>{t(props.language, "editor.standardColors")}</span>
          <div className="pdf-color-standard" role="grid">
            {editorStandardColors.map((color) => (
              <button
                key={color}
                type="button"
                role="gridcell"
                aria-label={color}
                aria-pressed={draft === color}
                style={{ background: color }}
                onKeyDown={(event) => moveGridFocus(event, 10)}
                onClick={() => choose(color)}
              />
            ))}
          </div>
          <button className="pdf-color-custom-toggle" type="button" onClick={() => setCustom((value) => !value)}>
            {t(props.language, "editor.otherColors")}
          </button>
          {custom && (
            <div className="pdf-color-custom">
              <label>
                <span>{t(props.language, "editor.hexColor")}</span>
                <input
                  type="text"
                  value={draft}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(event) => setDraft(event.target.value.toUpperCase())}
                />
              </label>
              <input type="color" value={normalizePdfHex(draft)} onChange={(event) => setDraft(event.target.value.toUpperCase())} />
              <button type="button" disabled={!normalizedHexColor(draft)} onClick={() => choose(normalizedHexColor(draft) as string)}>
                {t(props.language, "editor.apply")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
