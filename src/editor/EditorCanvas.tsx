import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import type { EditorDocumentV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { findNext, replaceSelection } from "./editorSearch";
import { EditorZoomControl } from "./EditorZoomControl";
import { useEditorZoom } from "./useEditorZoom";

const pageSizes: Record<EditorDocumentV1["page"]["format"], { width: number; height: number }> = {
  a3: { width: 1123, height: 1587 },
  a4: { width: 794, height: 1123 },
  a5: { width: 559, height: 794 },
  letter: { width: 816, height: 1056 },
  legal: { width: 816, height: 1345 },
};

interface EditorCanvasProps {
  language: LanguageCode;
  document: EditorDocumentV1;
  editor: Editor;
  searchOpen: boolean;
  onCloseSearch(): void;
  onHeaderFooter(kind: "header" | "footer"): void;
}

export function EditorCanvas(props: EditorCanvasProps) {
  const [pageCount, setPageCount] = useState(1);
  const { zoomPercent, setZoom, canvasScrollRef } = useEditorZoom();
  const [search, setSearch] = useState("");
  const [replacement, setReplacement] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.searchOpen) searchRef.current?.focus();
  }, [props.searchOpen]);

  useEffect(() => {
    const target = canvasScrollRef.current;
    if (!target) return;
    const onPagination = (event: Event) => {
      const detail = (event as CustomEvent<{ pageCount?: number }>).detail;
      if (detail?.pageCount) setPageCount(detail.pageCount);
    };
    target.addEventListener("editor-pagination", onPagination);
    return () => target.removeEventListener("editor-pagination", onPagination);
  }, [props.editor]);

  useEffect(() => {
    const container = canvasScrollRef.current;
    const paper = container?.querySelector<HTMLElement>(".editor-page-paper");
    const scale = container?.querySelector<HTMLElement>(".editor-page-scale");
    if (!paper || !scale) return;
    const measure = () => scale.style.setProperty("--editor-rendered-height", `${paper.offsetHeight}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    measure();
    return () => observer.disconnect();
  }, [props.editor]);

  const canvasStyle = createCanvasStyle(props.document, zoomPercent / 100);

  return (
    <>
      {props.document.warnings.length > 0 && (
        <div className="editor-compatibility-warning" role="status">
          <strong>!</strong><span>{props.document.warnings.map((warning) => warning.message).join(" ")}</span>
        </div>
      )}

      {props.searchOpen && (
        <div className="editor-searchbar" data-density="compact">
          <input ref={searchRef} autoFocus value={search} aria-label={t(props.language, "editor.find")} onChange={(event) => setSearch(event.target.value)} placeholder={t(props.language, "editor.find")} onKeyDown={(event) => { if (event.key === "Enter") findNext(props.editor, search); if (event.key === "Escape") { event.stopPropagation(); props.onCloseSearch(); props.editor.commands.focus(); } }} />
          <input value={replacement} aria-label={t(props.language, "editor.replaceWith")} onChange={(event) => setReplacement(event.target.value)} placeholder={t(props.language, "editor.replaceWith")} />
          <button type="button" onClick={() => findNext(props.editor, search)}>{t(props.language, "editor.next")}</button>
          <button type="button" onClick={() => replaceSelection(props.editor, search, replacement)}>{t(props.language, "editor.replace")}</button>
          <button type="button" onClick={props.onCloseSearch} aria-label={t(props.language, "common.close")}>×</button>
        </div>
      )}

      <div
        ref={canvasScrollRef}
        className="editor-canvas-scroll"
        onDoubleClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(".page-header-zone")) props.onHeaderFooter("header");
          if (target.closest(".page-footer-zone")) props.onHeaderFooter("footer");
        }}
      >
        <div className="editor-page-scale" style={canvasStyle}>
          <div className="editor-page-paper">
            <button className="page-header-zone" type="button" onClick={() => props.onHeaderFooter("header")}>{t(props.language, "editor.header")}</button>
            <EditorContent editor={props.editor} />
            <button className="page-footer-zone" type="button" onClick={() => props.onHeaderFooter("footer")}>{t(props.language, "editor.footer")}</button>
          </div>
        </div>
      </div>

      <div className="editor-statusbar" data-density="compact">
        <span>{t(props.language, "editor.pageCount", { current: 1, total: pageCount })}</span>
        <span>{t(props.language, "editor.wordCount", { count: props.editor.storage.characterCount.words() })}</span>
        <EditorZoomControl language={props.language} value={zoomPercent} onChange={setZoom} />
      </div>
    </>
  );
}

function createCanvasStyle(document: EditorDocumentV1, zoom: number): CSSProperties {
  const page = pageSizes[document.page.format];
  const dimensions = document.page.orientation === "landscape" ? { width: page.height, height: page.width } : page;
  const verticalMargins = (document.page.marginsMm.top + document.page.marginsMm.bottom) * (96 / 25.4);
  return {
    "--editor-page-width": `${dimensions.width}px`,
    "--editor-page-height": `${dimensions.height}px`,
    "--editor-page-content-height": `${Math.max(180, dimensions.height - verticalMargins)}px`,
    "--editor-margin-top": `${document.page.marginsMm.top * (96 / 25.4)}px`,
    "--editor-margin-right": `${document.page.marginsMm.right * (96 / 25.4)}px`,
    "--editor-margin-bottom": `${document.page.marginsMm.bottom * (96 / 25.4)}px`,
    "--editor-margin-left": `${document.page.marginsMm.left * (96 / 25.4)}px`,
    "--editor-zoom": String(zoom),
  } as CSSProperties;
}
