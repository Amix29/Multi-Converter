import { useEffect, useRef, useState } from "react";
import type { PdfObjectV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { pdfInlineEditAction, pdfInlineTextStyle } from "./pdfInlineTextModel";

interface PdfInlineTextEditorProps {
  language: LanguageCode;
  object: PdfObjectV1;
  zoom: number;
  onCommit(text: string): void;
  onCancel(): void;
}

export function PdfInlineTextEditor(props: PdfInlineTextEditorProps) {
  const [draft, setDraft] = useState(props.object.text ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  useEffect(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      props.onCommit(draftRef.current);
    };
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [props]);

  return (
    <div
      ref={rootRef}
      className="pdf-inline-text-editor"
      data-pdf-inline-editor="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        ref={inputRef}
        aria-label={t(props.language, "pdfEditor.inlineTextLabel")}
        aria-describedby={`${props.object.objectId}-inline-shortcut`}
        value={draft}
        rows={1}
        spellCheck
        style={pdfInlineTextStyle(props.object, props.zoom)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          const action = pdfInlineEditAction(event.key, event.ctrlKey, event.metaKey);
          if (!action) return;
          event.preventDefault();
          event.stopPropagation();
          if (action === "commit") props.onCommit(draft);
          else props.onCancel();
        }}
      />
      <div className="pdf-inline-text-actions">
        <span id={`${props.object.objectId}-inline-shortcut`}>
          {t(props.language, "pdfEditor.inlineTextShortcut")}
        </span>
        <div>
          <button type="button" onClick={props.onCancel}>
            {t(props.language, "common.cancel")}
          </button>
          <button className="is-primary" type="button" onClick={() => props.onCommit(draft)}>
            {t(props.language, "editor.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
