import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { t, type LanguageCode } from "../i18n";
import { EditorToolbarButton } from "./EditorToolbarButton";
import { EditorToolbarIcon } from "./EditorToolbarIcons";
import {
  colorInputValue,
  editorFontFamilies,
  fontSizeSuggestions,
  maximumFontSizePt,
  minimumFontSizePt,
  normalizeFontSizeInput,
  pointSizeValue,
} from "./editorFormatting";

interface EditorTextControlsProps {
  editor: Editor;
  language: LanguageCode;
}

export function EditorTextControls(props: EditorTextControlsProps) {
  const { editor } = props;
  const textStyle = editor.getAttributes("textStyle");
  const activeFont = String(textStyle.fontFamily || "Arial");
  const activeSize = pointSizeValue(textStyle.fontSize);
  const activeTextColor = typeof textStyle.color === "string" ? textStyle.color : null;
  const highlight = editor.getAttributes("highlight");
  const activeHighlightColor = editor.isActive("highlight") && typeof highlight.color === "string"
    ? highlight.color
    : null;

  return (
    <>
      <div className="toolbar-group toolbar-font-controls">
        <FontFamilyControl editor={editor} language={props.language} activeFont={activeFont} />
        <FontSizeControl editor={editor} language={props.language} activeSize={activeSize} />
      </div>
      <div className="toolbar-group toolbar-mark-controls">
        <EditorToolbarButton
          active={editor.isActive("bold")}
          label={t(props.language, "editor.bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong aria-hidden="true">B</strong>
        </EditorToolbarButton>
        <EditorToolbarButton
          active={editor.isActive("italic")}
          label={t(props.language, "editor.italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em aria-hidden="true">I</em>
        </EditorToolbarButton>
        <EditorToolbarButton
          active={editor.isActive("underline")}
          label={t(props.language, "editor.underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <u aria-hidden="true">U</u>
        </EditorToolbarButton>
        <EditorToolbarButton
          active={editor.isActive("strike")}
          label={t(props.language, "editor.strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s aria-hidden="true">S</s>
        </EditorToolbarButton>
        <ColorControl
          kind="text"
          language={props.language}
          color={activeTextColor}
          fallback="#1d241f"
          onColor={(color) => editor.chain().focus().setColor(color).run()}
          onClear={() => editor.chain().focus().unsetColor().run()}
        />
        <ColorControl
          kind="highlight"
          language={props.language}
          color={activeHighlightColor}
          fallback="#fff0a8"
          onColor={(color) => editor.chain().focus().setHighlight({ color }).run()}
          onClear={() => editor.chain().focus().unsetHighlight().run()}
        />
      </div>
    </>
  );
}

function FontFamilyControl(props: {
  editor: Editor;
  language: LanguageCode;
  activeFont: string;
}) {
  const isKnown = editorFontFamilies.some((font) => font === props.activeFont);
  return (
    <select
      className="toolbar-font-family"
      aria-label={t(props.language, "editor.fontFamily")}
      value={props.activeFont}
      onChange={(event) =>
        props.editor.chain().focus().setFontFamily(event.target.value).run()
      }
    >
      {!isKnown && <option value={props.activeFont}>{props.activeFont}</option>}
      {editorFontFamilies.map((font) => (
        <option value={font} key={font} style={{ fontFamily: font }}>
          {font}
        </option>
      ))}
    </select>
  );
}

function FontSizeControl(props: {
  editor: Editor;
  language: LanguageCode;
  activeSize: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(props.activeSize);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(props.activeSize);
  }, [props.activeSize]);

  function commit() {
    const normalized = normalizeFontSizeInput(draft);
    if (!normalized) {
      setDraft(props.activeSize);
      return;
    }
    setDraft(pointSizeValue(normalized));
    props.editor.chain().focus().setFontSize(normalized).run();
  }

  return (
    <label className="toolbar-font-size" title={t(props.language, "editor.fontSize")}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        list="editor-font-size-suggestions"
        minLength={1}
        maxLength={6}
        value={draft}
        aria-label={t(props.language, "editor.fontSize")}
        aria-describedby="editor-font-size-unit"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDraft(props.activeSize);
            props.editor.chain().focus().run();
          }
        }}
      />
      <span id="editor-font-size-unit" aria-hidden="true">pt</span>
      <datalist id="editor-font-size-suggestions">
        {fontSizeSuggestions.map((size) => <option value={size} key={size} />)}
      </datalist>
      <span className="visually-hidden">
        {minimumFontSizePt}–{maximumFontSizePt} pt
      </span>
    </label>
  );
}

function ColorControl(props: {
  kind: "text" | "highlight";
  language: LanguageCode;
  color: string | null;
  fallback: string;
  onColor(color: string): void;
  onClear(): void;
}) {
  const isHighlight = props.kind === "highlight";
  const pickerLabel = t(props.language, isHighlight ? "editor.highlight" : "editor.textColor");
  const clearLabel = t(
    props.language,
    isHighlight ? "editor.noHighlight" : "editor.defaultTextColor",
  );
  const pickerColor = colorInputValue(props.color, props.fallback);

  return (
    <div className="toolbar-color-control" role="group" aria-label={pickerLabel}>
      <label className="toolbar-color-picker" title={pickerLabel}>
        <span
          className={`toolbar-color-glyph ${isHighlight ? "is-highlight" : ""}`}
          aria-hidden="true"
          style={isHighlight && props.color ? { color: pickerColor } : undefined}
        >
          {isHighlight ? "H" : "A"}
        </span>
        <span
          className="toolbar-color-swatch"
          aria-hidden="true"
          style={{ backgroundColor: props.color ? pickerColor : "#1d241f" }}
        />
        <input
          type="color"
          aria-label={pickerLabel}
          value={pickerColor}
          onChange={(event) => props.onColor(event.target.value)}
        />
      </label>
      <EditorToolbarButton label={clearLabel} onClick={props.onClear} disabled={!props.color}>
        <EditorToolbarIcon name="clear" />
      </EditorToolbarButton>
    </div>
  );
}
