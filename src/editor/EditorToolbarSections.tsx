import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import type { EditorDocumentV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { EditorToolbarButton } from "./EditorToolbarButton";
import { EditorToolbarIcon, type EditorToolbarIconName } from "./EditorToolbarIcons";
import { formattingMarksKey } from "./editorViewDecorations";

const pageFormats: EditorDocumentV1["page"]["format"][] = [
  "a3",
  "a4",
  "a5",
  "letter",
  "legal",
];

export function EditorHistoryControls(props: {
  editor: Editor;
  language: LanguageCode;
}) {
  return (
    <div className="toolbar-group">
      <EditorToolbarButton
        label={t(props.language, "editor.undo")}
        shortcut="Ctrl+Z"
        onClick={() => props.editor.chain().focus().undo().run()}
        disabled={!props.editor.can().undo()}
      >
        <EditorToolbarIcon name="undo" />
      </EditorToolbarButton>
      <EditorToolbarButton
        label={t(props.language, "editor.redo")}
        shortcut="Ctrl+Y / Ctrl+Shift+Z"
        onClick={() => props.editor.chain().focus().redo().run()}
        disabled={!props.editor.can().redo()}
      >
        <EditorToolbarIcon name="redo" />
      </EditorToolbarButton>
    </div>
  );
}

export function EditorParagraphControls(props: {
  editor: Editor;
  language: LanguageCode;
}) {
  const alignments: Array<{
    value: "left" | "center" | "right" | "justify";
    icon: EditorToolbarIconName;
  }> = [
    { value: "left", icon: "alignLeft" },
    { value: "center", icon: "alignCenter" },
    { value: "right", icon: "alignRight" },
    { value: "justify", icon: "alignJustify" },
  ];

  return (
    <div className="toolbar-group">
      {alignments.map((alignment) => (
        <EditorToolbarButton
          key={alignment.value}
          active={props.editor.isActive({ textAlign: alignment.value })}
          label={t(props.language, `editor.align.${alignment.value}`)}
          shortcut={{ left: "Ctrl+L", center: "Ctrl+E", right: "Ctrl+R", justify: "Ctrl+J" }[alignment.value]}
          onClick={() =>
            props.editor.chain().focus().setTextAlign(alignment.value).run()
          }
        >
          <EditorToolbarIcon name={alignment.icon} />
        </EditorToolbarButton>
      ))}
      <EditorToolbarButton
        active={props.editor.isActive("bulletList")}
        label={t(props.language, "editor.bulletList")}
        onClick={() => props.editor.chain().focus().toggleBulletList().run()}
      >
        <EditorToolbarIcon name="bulletList" />
      </EditorToolbarButton>
      <EditorToolbarButton
        active={props.editor.isActive("orderedList")}
        label={t(props.language, "editor.numberedList")}
        onClick={() => props.editor.chain().focus().toggleOrderedList().run()}
      >
        <EditorToolbarIcon name="numberedList" />
      </EditorToolbarButton>
      <EditorToolbarButton
        active={formattingMarksKey.getState(props.editor.state)?.enabled ?? false}
        label={t(props.language, "editor.formattingMarks")}
        shortcut="Ctrl+Shift+8"
        onClick={() => props.editor.chain().focus().toggleFormattingMarks().run()}
      ><EditorToolbarIcon name="pilcrow" /></EditorToolbarButton>
    </div>
  );
}

export function EditorInsertControls(props: {
  editor: Editor;
  language: LanguageCode;
  searchOpen: boolean;
  onSearch(): void;
  onInsertImages(files: File[]): void;
}) {
  const imageInput = useRef<HTMLInputElement>(null);

  return (
    <div className="toolbar-group">
      <EditorToolbarButton
        label={t(props.language, "editor.link")}
        shortcut="Ctrl+K"
        onClick={() => setEditorLink(props.editor, props.language)}
      >
        <EditorToolbarIcon name="link" />
      </EditorToolbarButton>
      <EditorToolbarButton
        label={t(props.language, "editor.image")}
        onClick={() => imageInput.current?.click()}
      >
        <EditorToolbarIcon name="image" />
      </EditorToolbarButton>
      <input
        ref={imageInput}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          props.onInsertImages(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <EditorToolbarButton
        label={t(props.language, "editor.table")}
        onClick={() =>
          props.editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        <EditorToolbarIcon name="table" />
      </EditorToolbarButton>
      <EditorToolbarButton
        label={t(props.language, "editor.pageBreak")}
        shortcut="Ctrl+Enter"
        onClick={() => props.editor.chain().focus().setPageBreak().run()}
      >
        <EditorToolbarIcon name="pageBreak" />
      </EditorToolbarButton>
      <EditorToolbarButton
        active={props.searchOpen}
        label={t(props.language, "editor.findReplace")}
        shortcut="Ctrl+F / Ctrl+H"
        onClick={props.onSearch}
      >
        <EditorToolbarIcon name="search" />
      </EditorToolbarButton>
    </div>
  );
}

export function EditorPageControls(props: {
  document: EditorDocumentV1;
  language: LanguageCode;
  onHeaderFooter(kind: "header" | "footer"): void;
  onPage(patch: Partial<EditorDocumentV1["page"]>): void;
}) {
  return (
    <div className="toolbar-group toolbar-page-settings">
      <select
        aria-label={t(props.language, "editor.pageFormat")}
        value={props.document.page.format}
        onChange={(event) =>
          props.onPage({
            format: event.target.value as EditorDocumentV1["page"]["format"],
          })
        }
      >
        {pageFormats.map((format) => (
          <option value={format} key={format}>
            {format.toUpperCase()}
          </option>
        ))}
      </select>
      <EditorToolbarButton
        active={props.document.page.orientation === "landscape"}
        label={t(props.language, "editor.orientation")}
        onClick={() =>
          props.onPage({
            orientation:
              props.document.page.orientation === "portrait"
                ? "landscape"
                : "portrait",
          })
        }
      >
        <EditorToolbarIcon name="orientation" />
      </EditorToolbarButton>
      <EditorToolbarButton
        label={t(props.language, "editor.header")}
        onClick={() => props.onHeaderFooter("header")}
      >
        <EditorToolbarIcon name="header" />
      </EditorToolbarButton>
      <EditorToolbarButton
        label={t(props.language, "editor.footer")}
        onClick={() => props.onHeaderFooter("footer")}
      >
        <EditorToolbarIcon name="footer" />
      </EditorToolbarButton>
    </div>
  );
}

export function setEditorLink(editor: Editor, language: LanguageCode) {
  const href = window.prompt(
    t(language, "editor.linkPrompt"),
    editor.getAttributes("link").href || "https://",
  );
  if (href === null) return;
  if (!href.trim()) {
    editor.chain().focus().unsetLink().run();
  } else if (/^(?:https?:|mailto:|#)/i.test(href.trim())) {
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: href.trim() })
      .run();
  }
}
