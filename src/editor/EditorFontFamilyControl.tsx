import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { api } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { orderedFontCatalog, rememberRecentFont } from "./editorFormatting";

const RECENT_FONTS_KEY = "multi-converter.editor.recent-fonts.v1";
const ROW_HEIGHT = 38;
const VIEWPORT_HEIGHT = 304;

interface FontRow {
  id: string;
  kind: "header" | "font";
  label: string;
  family?: string;
}

interface EditorFontFamilyControlProps {
  editor: Editor;
  language: LanguageCode;
  activeFont: string;
}

export function EditorFontFamilyControl(props: EditorFontFamilyControlProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [catalog, setCatalog] = useState({ defaultFamily: props.activeFont, families: [props.activeFont] });
  const [recentFonts, setRecentFonts] = useState(readRecentFonts);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [catalogError, setCatalogError] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let disposed = false;
    setCatalogLoading(true);
    setCatalogError(false);
    void api.editorListSystemFonts({ retry: reloadToken > 0 }).then((result) => {
      if (!disposed) {
        setCatalog({ defaultFamily: result.defaultFamily, families: result.families });
        setCatalogLoading(false);
      }
    }).catch(() => {
      if (!disposed) {
        setCatalogError(true);
        setCatalogLoading(false);
      }
    });
    return () => { disposed = true; };
  }, [reloadToken]);

  const ordered = useMemo(
    () => orderedFontCatalog(catalog.defaultFamily, recentFonts, catalog.families),
    [catalog, recentFonts],
  );
  const rows = useMemo(
    () => fontRows(ordered.defaultFont, ordered.recentFonts, ordered.allFonts, query, props.language),
    [ordered, props.language, query],
  );
  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 4;
  const visibleRows = rows.slice(firstVisible, firstVisible + visibleCount);

  useEffect(() => {
    if (!open) return;
    positionPanel();
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const reposition = () => positionPanel();
    const onModalOpen = () => close(false);
    window.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("multi-converter:modal-open", onModalOpen);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("multi-converter:modal-open", onModalOpen);
    };
  }, [open]);

  function positionPanel() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(340, window.innerWidth - 24);
    const estimatedHeight = 380;
    const below = rect.bottom + 8;
    setPosition({
      top: below + estimatedHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - estimatedHeight - 8),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    });
  }

  function show() {
    setOpen(true);
    setQuery("");
    setScrollTop(0);
    setActiveIndex(-1);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function choose(family: string) {
    props.editor.chain().focus().setFontFamily(family).run();
    const next = rememberRecentFont(family, recentFonts, ordered.defaultFont);
    setRecentFonts(next);
    writeRecentFonts(next);
    close(true);
  }

  function moveActive(delta: number) {
    const selectable = rows.map((row, index) => row.kind === "font" ? index : -1).filter((index) => index >= 0);
    if (!selectable.length) return;
    const current = selectable.indexOf(activeIndex);
    const next = selectable[(current + delta + selectable.length) % selectable.length];
    setActiveIndex(next);
    const nextScrollTop = Math.max(0, next * ROW_HEIGHT - VIEWPORT_HEIGHT / 2);
    setScrollTop(nextScrollTop);
    if (listRef.current) listRef.current.scrollTop = nextScrollTop;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="toolbar-font-family"
        aria-label={t(props.language, "editor.fontFamily")}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={props.activeFont}
        style={{ fontFamily: props.activeFont }}
        onClick={() => open ? close(false) : show()}
      >
        <span>{props.activeFont}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {open && createPortal(
        <div ref={panelRef} className="editor-font-popover" style={{ top: position.top, left: position.left }}>
          <label className="editor-font-search">
            <span className="visually-hidden">{t(props.language, "editor.searchFonts")}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5" /></svg>
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
              value={query}
              placeholder={t(props.language, "editor.searchFonts")}
              onChange={(event) => {
                setQuery(event.target.value);
                setScrollTop(0);
                if (listRef.current) listRef.current.scrollTop = 0;
                setActiveIndex(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveActive(event.key === "ArrowDown" ? 1 : -1);
                } else if (event.key === "Enter" && rows[activeIndex]?.family) {
                  event.preventDefault();
                  choose(rows[activeIndex].family as string);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  close(true);
                }
              }}
            />
          </label>
          {catalogError && (
            <div className="editor-font-enumeration-error" role="status">
              <span>{t(props.language, "editor.fontEnumerationError")}</span>
              <button type="button" onClick={() => setReloadToken((value) => value + 1)}>
                {t(props.language, "editor.retryFontEnumeration")}
              </button>
            </div>
          )}
          {catalogLoading && (
            <div className="editor-font-enumeration-loading" role="status">
              {t(props.language, "editor.loadingFonts")}
            </div>
          )}
          <div
            id={listboxId}
            ref={listRef}
            className="editor-font-list"
            role="listbox"
            aria-label={t(props.language, "editor.fontFamily")}
            aria-busy={catalogLoading}
            style={{ height: VIEWPORT_HEIGHT }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <div className="editor-font-list-spacer" style={{ height: rows.length * ROW_HEIGHT }}>
              {visibleRows.map((row, visibleIndex) => {
                const index = firstVisible + visibleIndex;
                return row.kind === "header" ? (
                  <div key={row.id} className="editor-font-group-label" style={{ transform: `translateY(${index * ROW_HEIGHT}px)` }}>
                    {row.label}
                  </div>
                ) : (
                  <button
                    id={`${listboxId}-option-${index}`}
                    key={row.id}
                    type="button"
                    role="option"
                    aria-selected={row.family === props.activeFont}
                    className={activeIndex === index ? "is-active" : ""}
                    style={{ transform: `translateY(${index * ROW_HEIGHT}px)`, fontFamily: row.family }}
                    onPointerEnter={() => setActiveIndex(index)}
                    onClick={() => choose(row.family as string)}
                  >
                    {row.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function fontRows(
  defaultFont: string,
  recentFonts: string[],
  allFonts: string[],
  query: string,
  language: LanguageCode,
): FontRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery) {
    return allFonts
      .filter((family) => family.toLocaleLowerCase().includes(normalizedQuery))
      .map((family) => ({ id: `all-${family}`, kind: "font", label: family, family }));
  }
  const rows: FontRow[] = [
    { id: "default-heading", kind: "header", label: t(language, "editor.defaultFont") },
    { id: `default-${defaultFont}`, kind: "font", label: defaultFont, family: defaultFont },
  ];
  if (recentFonts.length) {
    rows.push({ id: "recent-heading", kind: "header", label: t(language, "editor.recentFonts") });
    rows.push(...recentFonts.map((family) => ({ id: `recent-${family}`, kind: "font" as const, label: family, family })));
  }
  rows.push({ id: "all-heading", kind: "header", label: t(language, "editor.allFonts") });
  rows.push(...allFonts.map((family) => ({ id: `all-${family}`, kind: "font" as const, label: family, family })));
  return rows;
}

function readRecentFonts(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_FONTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

function writeRecentFonts(fonts: string[]) {
  try {
    localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(fonts.slice(0, 3)));
  } catch {
    // A private/locked-down WebView may reject storage; font selection remains usable.
  }
}
