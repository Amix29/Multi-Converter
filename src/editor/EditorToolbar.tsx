import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import type { EditorDocumentV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";

const pageFormats: EditorDocumentV1["page"]["format"][] = [
  "a3",
  "a4",
  "a5",
  "letter",
  "legal",
];

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
  const { editor } = props;
  const imageInput = useRef<HTMLInputElement>(null);
  return (
    <div
      className="editor-toolbar"
      data-density="compact"
      role="toolbar"
      aria-label={t(props.language, "editor.formattingTools")}
    >
      <div className="toolbar-group">
        <ToolButton
          label={t(props.language, "editor.undo")}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          ↶
        </ToolButton>
        <ToolButton
          label={t(props.language, "editor.redo")}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          ↷
        </ToolButton>
      </div>
      <div className="toolbar-group">
        <select
          aria-label={t(props.language, "editor.paragraphStyle")}
          value={activeHeading(editor)}
          onChange={(event) => applyHeading(editor, event.target.value)}
        >
          <option value="paragraph">
            {t(props.language, "editor.normal")}
          </option>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <option value={`h${level}`} key={level}>
              {t(props.language, "editor.heading", { level })}
            </option>
          ))}
        </select>
        <select
          aria-label={t(props.language, "editor.fontFamily")}
          value={editor.getAttributes("textStyle").fontFamily || "Arial"}
          onChange={(event) =>
            editor.chain().focus().setFontFamily(event.target.value).run()
          }
        >
          {[
            "Arial",
            "Segoe UI",
            "Georgia",
            "Times New Roman",
            "Courier New",
          ].map((font) => (
            <option value={font} key={font}>
              {font}
            </option>
          ))}
        </select>
        <select
          aria-label={t(props.language, "editor.fontSize")}
          value={editor.getAttributes("textStyle").fontSize || "11pt"}
          onChange={(event) =>
            editor.chain().focus().setFontSize(event.target.value).run()
          }
        >
          {[8, 9, 10, 11, 12, 14, 16, 18, 24, 32, 48].map((size) => (
            <option value={`${size}pt`} key={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar-group">
        <ToolButton
          active={editor.isActive("bold")}
          label={t(props.language, "editor.bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolButton>
        <ToolButton
          active={editor.isActive("italic")}
          label={t(props.language, "editor.italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolButton>
        <ToolButton
          active={editor.isActive("underline")}
          label={t(props.language, "editor.underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <u>U</u>
        </ToolButton>
        <ToolButton
          active={editor.isActive("strike")}
          label={t(props.language, "editor.strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </ToolButton>
        <label
          className="toolbar-color"
          title={t(props.language, "editor.textColor")}
        >
          <span aria-hidden="true">A</span>
          <input
            type="color"
            aria-label={t(props.language, "editor.textColor")}
            value={editor.getAttributes("textStyle").color || "#1d241f"}
            onChange={(event) =>
              editor.chain().focus().setColor(event.target.value).run()
            }
          />
        </label>
        <label
          className="toolbar-color"
          title={t(props.language, "editor.highlight")}
        >
          <span aria-hidden="true">▰</span>
          <input
            type="color"
            aria-label={t(props.language, "editor.highlight")}
            value={editor.getAttributes("highlight").color || "#fff0a8"}
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .toggleHighlight({ color: event.target.value })
                .run()
            }
          />
        </label>
      </div>
      <div className="toolbar-group">
        {(["left", "center", "right", "justify"] as const).map((align) => (
          <ToolButton
            key={align}
            active={editor.isActive({ textAlign: align })}
            label={t(props.language, `editor.align.${align}`)}
            onClick={() => editor.chain().focus().setTextAlign(align).run()}
          >
            {alignIcon(align)}
          </ToolButton>
        ))}
        <ToolButton
          active={editor.isActive("bulletList")}
          label={t(props.language, "editor.bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •≡
        </ToolButton>
        <ToolButton
          active={editor.isActive("orderedList")}
          label={t(props.language, "editor.numberedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1≡
        </ToolButton>
      </div>
      <div className="toolbar-group">
        <ToolButton
          label={t(props.language, "editor.link")}
          onClick={() => {
            const href = window.prompt(
              t(props.language, "editor.linkPrompt"),
              editor.getAttributes("link").href || "https://",
            );
            if (href === null) return;
            if (!href.trim()) editor.chain().focus().unsetLink().run();
            else if (/^(?:https?:|mailto:|#)/i.test(href.trim()))
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: href.trim() })
                .run();
          }}
        >
          🔗
        </ToolButton>
        <ToolButton
          label={t(props.language, "editor.image")}
          onClick={() => imageInput.current?.click()}
        >
          ▧
        </ToolButton>
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
        <ToolButton
          label={t(props.language, "editor.table")}
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          ▦
        </ToolButton>
        <ToolButton
          label={t(props.language, "editor.pageBreak")}
          onClick={() => editor.chain().focus().setPageBreak().run()}
        >
          ↵
        </ToolButton>
        <ToolButton
          active={props.searchOpen}
          label={t(props.language, "editor.findReplace")}
          onClick={props.onSearch}
        >
          ⌕
        </ToolButton>
      </div>
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
        <ToolButton
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
          ▱
        </ToolButton>
        <ToolButton
          label={t(props.language, "editor.header")}
          onClick={() => props.onHeaderFooter("header")}
        >
          H
        </ToolButton>
        <ToolButton
          label={t(props.language, "editor.footer")}
          onClick={() => props.onHeaderFooter("footer")}
        >
          F
        </ToolButton>
      </div>
    </div>
  );
}

function ToolButton(props: {
  children: React.ReactNode;
  label: string;
  onClick(): void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`toolbar-button ${props.active ? "is-active" : ""}`}
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active || undefined}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function activeHeading(editor: Editor) {
  for (let level = 1; level <= 6; level += 1)
    if (editor.isActive("heading", { level })) return `h${level}`;
  return "paragraph";
}

function applyHeading(editor: Editor, value: string) {
  if (value === "paragraph") editor.chain().focus().setParagraph().run();
  else
    editor
      .chain()
      .focus()
      .toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 })
      .run();
}

function alignIcon(align: "left" | "center" | "right" | "justify") {
  return align === "left"
    ? "≡"
    : align === "center"
      ? "≣"
      : align === "right"
        ? "≡"
        : "▤";
}
