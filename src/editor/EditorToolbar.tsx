import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { EditorDocumentV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import {
  EditorHistoryControls,
  EditorInsertControls,
  EditorPageControls,
  EditorParagraphControls,
} from "./EditorToolbarSections";
import { EditorTableControls } from "./EditorTableControls";
import { EditorTextControls } from "./EditorTextControls";
import { EditorToolbarIcon } from "./EditorToolbarIcons";

interface EditorToolbarProps {
  editor: Editor;
  language: LanguageCode;
  document: EditorDocumentV1;
  searchOpen: boolean;
  onSearch(): void;
  onHeaderFooter(kind: "header" | "footer"): void;
  onPage(patch: Partial<EditorDocumentV1["page"]>): void;
  onInsertImages(files: File[]): void;
}

export function EditorToolbar(props: EditorToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ overflow: false, left: false, right: false });

  function updateScrollState() {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const overflow = toolbar.scrollWidth - toolbar.clientWidth > 2;
    const next = {
      overflow,
      left: overflow && toolbar.scrollLeft > 2,
      right: overflow && toolbar.scrollLeft + toolbar.clientWidth < toolbar.scrollWidth - 2,
    };
    setScrollState((current) => current.overflow === next.overflow
      && current.left === next.left
      && current.right === next.right
      ? current
      : next);
  }

  useLayoutEffect(updateScrollState);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(toolbar);
    toolbar.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      observer.disconnect();
      toolbar.removeEventListener("scroll", updateScrollState);
    };
  }, []);

  function scrollToolbar(direction: -1 | 1) {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    toolbar.scrollBy({ left: direction * Math.max(220, toolbar.clientWidth * 0.72), behavior: "smooth" });
  }

  return (
    <div className={`editor-toolbar-shell ${scrollState.overflow ? "has-overflow" : ""}`}>
      {scrollState.overflow && (
        <button className="editor-toolbar-scroll" type="button" disabled={!scrollState.left} aria-label={t(props.language, "editor.scrollToolsLeft")} onClick={() => scrollToolbar(-1)}>
          <EditorToolbarIcon name="arrowLeft" />
        </button>
      )}
      <div
        ref={toolbarRef}
        className="editor-toolbar"
        data-density="compact"
        role="toolbar"
        aria-label={t(props.language, "editor.formattingTools")}
      >
        <EditorHistoryControls editor={props.editor} language={props.language} />
        <EditorTextControls editor={props.editor} language={props.language} />
        <EditorParagraphControls editor={props.editor} language={props.language} />
        <EditorInsertControls
          editor={props.editor}
          language={props.language}
          searchOpen={props.searchOpen}
          onSearch={props.onSearch}
          onInsertImages={props.onInsertImages}
        />
        <EditorTableControls editor={props.editor} language={props.language} />
        <EditorPageControls
          document={props.document}
          language={props.language}
          onHeaderFooter={props.onHeaderFooter}
          onPage={props.onPage}
        />
      </div>
      {scrollState.overflow && (
        <button className="editor-toolbar-scroll" type="button" disabled={!scrollState.right} aria-label={t(props.language, "editor.scrollToolsRight")} onClick={() => scrollToolbar(1)}>
          <EditorToolbarIcon name="arrowLeft" style={{ transform: "rotate(180deg)" }} />
        </button>
      )}
    </div>
  );
}
