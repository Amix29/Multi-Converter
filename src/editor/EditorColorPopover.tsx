import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { t, type LanguageCode } from "../i18n";
import {
  applyPreviewColor,
  captureColorPreview,
  previewColor,
  restoreColorPreview,
  type ColorPreviewSnapshot,
  type EditorColorKind,
  type SelectionColorState,
} from "./editorColorState";
import {
  colorInputValue,
  editorStandardColors,
  editorThemeColorColumns,
  normalizedHexColor,
} from "./editorFormatting";
import { nextPaletteIndex, type PaletteShape } from "./colorPaletteNavigation";

interface EditorColorPopoverProps {
  editor: Editor;
  language: LanguageCode;
  kind: EditorColorKind;
  state: SelectionColorState;
  fallback: string;
}

export function EditorColorPopover(props: EditorColorPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<ColorPreviewSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState(props.state.color ?? props.fallback);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [activeThemeIndex, setActiveThemeIndex] = useState(0);
  const [activeStandardIndex, setActiveStandardIndex] = useState(0);
  const titleId = useId();
  const isHighlight = props.kind === "highlight";
  const label = t(props.language, isHighlight ? "editor.highlight" : "editor.textColor");

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(260, window.innerWidth - 24);
      const panelHeight = Math.min(
        panelRef.current?.scrollHeight ?? 520,
        window.innerHeight - 24,
      );
      const below = rect.bottom + 8;
      const top = below + panelHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - panelHeight - 8);
      setPosition({
        top,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) cancel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    const onModalOpen = () => cancel();
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("multi-converter:modal-open", onModalOpen);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("multi-converter:modal-open", onModalOpen);
    };
  }, [open]);

  function show() {
    if (open) {
      cancel();
      return;
    }
    snapshotRef.current = captureColorPreview(props.editor);
    setDraft(props.state.color ?? props.fallback);
    setCustomOpen(false);
    const normalized = normalizedHexColor(props.state.color);
    const themeIndex = editorThemeColorColumns.flat().findIndex((color) => color === normalized);
    const standardIndex = editorStandardColors.findIndex((color) => color === normalized);
    setActiveThemeIndex(Math.max(0, themeIndex));
    setActiveStandardIndex(Math.max(0, standardIndex));
    setOpen(true);
    window.setTimeout(() => panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
  }

  function select(color: string | null) {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    if (color) setDraft(color);
    previewColor(props.editor, snapshot, props.kind, color);
  }

  function apply(color: string | null = draft) {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    const normalized = color === null ? null : normalizedHexColor(color);
    if (color !== null && !normalized) return;
    applyPreviewColor(props.editor, snapshot, props.kind, normalized);
    close();
  }

  function cancel() {
    const snapshot = snapshotRef.current;
    if (snapshot) restoreColorPreview(props.editor, snapshot);
    close();
  }

  function close() {
    snapshotRef.current = null;
    setOpen(false);
    setCustomOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  const visibleColor = props.state.color ?? props.fallback;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`toolbar-color-trigger ${props.state.kind === "mixed" ? "is-mixed" : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-editor-tip={label}
        onClick={show}
      >
        <span
          className={`toolbar-color-glyph ${isHighlight ? "is-highlight" : ""}`}
          aria-hidden="true"
          style={isHighlight ? { backgroundColor: visibleColor, color: "#111111" } : undefined}
        >
          {isHighlight ? "H" : "A"}
        </span>
        {!isHighlight && (
          <span className="toolbar-color-swatch" aria-hidden="true" style={{ backgroundColor: visibleColor }} />
        )}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="editor-color-popover"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          style={{ top: position.top, left: position.left }}
        >
          <strong id={titleId}>{label}</strong>
          {props.state.kind === "mixed" && (
            <span className="editor-color-mixed">{t(props.language, "editor.mixedValue")}</span>
          )}
          {!isHighlight && (
            <button
              type="button"
              className="editor-color-none"
              onPointerEnter={() => select(null)}
              onFocus={() => select(null)}
              onClick={() => apply(null)}
            >
              <span className="editor-default-text-swatch" aria-hidden="true" />
              {t(props.language, "editor.defaultTextColor")}
            </button>
          )}
          {isHighlight && (
            <button
              type="button"
              className="editor-color-none"
              onPointerEnter={() => select(null)}
              onFocus={() => select(null)}
              onClick={() => apply(null)}
            >
              <span aria-hidden="true">∅</span>
              {t(props.language, "editor.noHighlight")}
            </button>
          )}
          <span className="editor-color-section-label">{t(props.language, "editor.themeColors")}</span>
          <div className="editor-color-theme-grid" role="grid" aria-label={t(props.language, "editor.themeColors")}>
            {editorThemeColorColumns.map((column, columnIndex) => (
              <div role="row" key={columnIndex}>
                {column.map((color, rowIndex) => {
                  const index = columnIndex * column.length + rowIndex;
                  return <ColorSwatch
                    key={color}
                    color={color}
                    selected={draft === color}
                    index={index}
                    activeIndex={activeThemeIndex}
                    shape={{ columns: editorThemeColorColumns.length, rows: column.length, order: "column-major" }}
                    onActivate={setActiveThemeIndex}
                    onPreview={select}
                    onApply={apply}
                  />;
                })}
              </div>
            ))}
          </div>
          <span className="editor-color-section-label">{t(props.language, "editor.standardColors")}</span>
          <div className="editor-color-standard-grid" role="row" aria-label={t(props.language, "editor.standardColors")}>
            {editorStandardColors.map((color, index) => <ColorSwatch
              key={color}
              color={color}
              selected={draft === color}
              index={index}
              activeIndex={activeStandardIndex}
              shape={{ columns: editorStandardColors.length, rows: 1, order: "row-major" }}
              onActivate={setActiveStandardIndex}
              onPreview={select}
              onApply={apply}
            />)}
          </div>
          <button type="button" className="editor-color-custom-toggle" aria-expanded={customOpen} onClick={() => setCustomOpen((value) => !value)}>
            <span aria-hidden="true">◉</span>
            {t(props.language, "editor.otherColors")}
          </button>
          {customOpen && (
            <div className="editor-color-custom">
              <label>
                <span>{t(props.language, "editor.hexColor")}</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="text"
                  value={draft}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    const color = normalizedHexColor(event.target.value);
                    if (color) select(color);
                  }}
                />
              </label>
              <input
                type="color"
                aria-label={t(props.language, "editor.otherColors")}
                value={colorInputValue(draft, props.fallback)}
                onChange={(event) => select(event.target.value)}
              />
              <button type="button" disabled={!normalizedHexColor(draft)} onClick={() => apply(normalizedHexColor(draft))}>
                {t(props.language, "editor.apply")}
              </button>
            </div>
          )}
          <div className="editor-color-actions">
            <button type="button" onClick={cancel}>{t(props.language, "common.cancel")}</button>
            <button
              type="button"
              className="is-primary"
              disabled={customOpen && !normalizedHexColor(draft)}
              onClick={() => apply()}
            >
              {t(props.language, "editor.apply")}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function ColorSwatch(props: {
  color: string;
  selected: boolean;
  index: number;
  activeIndex: number;
  shape: PaletteShape;
  onActivate(index: number): void;
  onPreview(color: string): void;
  onApply(color: string): void;
}) {
  return (
    <button
      type="button"
      role="gridcell"
      className={props.selected ? "is-selected" : ""}
      aria-label={props.color}
      aria-pressed={props.selected}
      tabIndex={props.index === props.activeIndex ? 0 : -1}
      data-palette-index={props.index}
      style={{ backgroundColor: props.color }}
      onPointerEnter={() => props.onPreview(props.color)}
      onFocus={() => {
        props.onActivate(props.index);
        props.onPreview(props.color);
      }}
      onKeyDown={(event) => {
        const next = nextPaletteIndex(props.index, event.key, props.shape.columns * props.shape.rows, props.shape);
        if (next === null) return;
        event.preventDefault();
        const palette = event.currentTarget.closest(".editor-color-theme-grid, .editor-color-standard-grid");
        props.onActivate(next);
        window.requestAnimationFrame(() => {
          palette
            ?.querySelector<HTMLButtonElement>(`[data-palette-index="${next}"]`)
            ?.focus({ preventScroll: true });
        });
      }}
      onClick={() => props.onApply(props.color)}
    />
  );
}
