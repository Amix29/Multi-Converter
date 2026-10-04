import type { Editor } from "@tiptap/react";
import type { EditorDocumentV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { EditorHistoryControls, EditorInsertControls, EditorPageControls, EditorParagraphControls } from "./EditorToolbarSections";
import { EditorTableControls } from "./EditorTableControls";
import { EditorTextControls } from "./EditorTextControls";
import { EditorImageControls } from "./EditorImageControls";
import "./editor-ribbon.css";

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
  return (
    <div className="editor-toolbar-shell">
      <div className="editor-toolbar" data-density="compact" role="toolbar" aria-label={t(props.language, "editor.formattingTools")}>
        <section className="editor-ribbon-group editor-ribbon-history">
          <EditorHistoryControls editor={props.editor} language={props.language} />
          <span className="editor-ribbon-label">{t(props.language, "editor.historyGroup")}</span>
        </section>
        <section className="editor-ribbon-group editor-ribbon-font">
          <EditorTextControls editor={props.editor} language={props.language} />
          <span className="editor-ribbon-label">{t(props.language, "editor.fontFamily")}</span>
        </section>
        <section className="editor-ribbon-group editor-ribbon-paragraph">
          <EditorParagraphControls editor={props.editor} language={props.language} />
          <span className="editor-ribbon-label">{t(props.language, "editor.paragraphGroup")}</span>
        </section>
        <section className="editor-ribbon-group editor-ribbon-insert">
          <EditorInsertControls editor={props.editor} language={props.language} searchOpen={props.searchOpen} onSearch={props.onSearch} onInsertImages={props.onInsertImages} />
          <span className="editor-ribbon-label">{t(props.language, "editor.insertGroup")}</span>
        </section>
        <section className="editor-ribbon-group editor-ribbon-page">
          <EditorPageControls document={props.document} language={props.language} onHeaderFooter={props.onHeaderFooter} onPage={props.onPage} />
          <span className="editor-ribbon-label">{t(props.language, "editor.layoutGroup")}</span>
        </section>
        <EditorTableControls editor={props.editor} language={props.language} />
        <EditorImageControls editor={props.editor} language={props.language} />
      </div>
    </div>
  );
}
