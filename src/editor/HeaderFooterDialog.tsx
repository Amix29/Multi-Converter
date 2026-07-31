import { useRef } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { t, type LanguageCode } from "../i18n";
import { useModalAccessibility } from "../hooks/useModalAccessibility";
import { DocumentImage, UnsupportedObject } from "./extensions";
import { sanitizeImportedHtml } from "./htmlSanitizer";

interface HeaderFooterDialogProps {
  language: LanguageCode;
  kind: "header" | "footer";
  content: Record<string, unknown> | null;
  documentId: string;
  assetIds: string[];
  onClose(): void;
  onSave(content: Record<string, unknown>): void;
}

export function HeaderFooterDialog(props: HeaderFooterDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstToolRef = useRef<HTMLButtonElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["paragraph"] }),
      DocumentImage.configure({ documentId: props.documentId }),
      UnsupportedObject,
    ],
    content: props.content ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      transformPastedHTML: (html) =>
        sanitizeImportedHtml(html, {
          allowedAssetIds: new Set(props.assetIds),
        }),
    },
  });

  useModalAccessibility({
    isOpen: true,
    surfaceRef: dialogRef,
    initialFocusRef: firstToolRef,
    onEscape: props.onClose,
  });

  return createPortal(
    <div
      className="editor-modal-backdrop"
      role="presentation"
      onMouseDown={props.onClose}
    >
      <section
        ref={dialogRef}
        className="editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="header-footer-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="header-footer-title">
          {props.kind === "header"
            ? t(props.language, "editor.editHeader")
            : t(props.language, "editor.editFooter")}
        </h2>
        <div
          className="header-footer-toolbar"
          role="toolbar"
          aria-label={t(props.language, "editor.formattingTools")}
        >
          <button
            ref={firstToolRef}
            type="button"
            aria-label={t(props.language, "editor.bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            aria-label={t(props.language, "editor.italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            aria-label={t(props.language, "editor.align.center")}
            onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          >
            ≣
          </button>
          <button
            type="button"
            onClick={() =>
              editor?.chain().focus().insertContent("{page}/{total}").run()
            }
          >
            {t(props.language, "editor.insertPageNumber")}
          </button>
        </div>
        <div className="header-footer-content">
          <EditorContent editor={editor} />
        </div>
        <div className="editor-modal-actions">
          <button type="button" onClick={props.onClose}>
            {t(props.language, "common.cancel")}
          </button>
          <button
            className="editor-primary-button"
            type="button"
            onClick={() =>
              editor &&
              props.onSave(editor.getJSON() as Record<string, unknown>)
            }
          >
            {t(props.language, "common.save")}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
