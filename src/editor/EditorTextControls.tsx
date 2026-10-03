import type { Editor } from "@tiptap/react";
import { t, type LanguageCode } from "../i18n";
import { EditorColorPopover } from "./EditorColorPopover";
import { EditorFontFamilyControl } from "./EditorFontFamilyControl";
import { EditorMetricCombobox } from "./EditorMetricCombobox";
import { EditorToolbarButton } from "./EditorToolbarButton";
import { inheritedEditorTextColor, selectionColorState } from "./editorColorState";
import {
  fontSizeSuggestions,
  lineHeightSuggestions,
  editorThemeColorColumns,
  lineHeightValue,
  maximumFontSizePt,
  maximumLineHeight,
  minimumFontSizePt,
  minimumLineHeight,
  normalizeFontSizeInput,
  normalizeLineHeightInput,
  pointSizeValue,
} from "./editorFormatting";
import "./editor-toolbar-controls.css";

interface EditorTextControlsProps {
  editor: Editor;
  language: LanguageCode;
}

export function EditorTextControls(props: EditorTextControlsProps) {
  const { editor, language } = props;
  const textStyle = editor.getAttributes("textStyle");
  const paragraph = editor.getAttributes("paragraph");
  const heading = editor.getAttributes("heading");
  const activeFont = String(textStyle.fontFamily || "Arial");
  const activeSize = pointSizeValue(textStyle.fontSize);
  const activeLineHeight = lineHeightValue(paragraph.lineHeight ?? heading.lineHeight);
  const textColor = selectionColorState(editor.state, "text");
  const highlightColor = selectionColorState(editor.state, "highlight");
  const inheritedTextColor = inheritedEditorTextColor(editor) ?? editorThemeColorColumns[0][5];

  return (
    <>
      <div className="toolbar-group toolbar-font-controls">
        <EditorFontFamilyControl editor={editor} language={language} activeFont={activeFont} />
        <EditorMetricCombobox
          className="toolbar-font-size"
          label={t(language, "editor.fontSize")}
          value={`${activeSize}pt`}
          unit="pt"
          description={`${minimumFontSizePt}–${maximumFontSizePt} pt`}
          options={fontSizeSuggestions.map((size) => ({ value: String(size) }))}
          normalize={normalizeFontSizeInput}
          displayValue={pointSizeValue}
          onCommit={(value) => editor.chain().focus().setFontSize(value).run()}
        />
        <EditorMetricCombobox
          className="toolbar-line-height"
          label={t(language, "editor.lineHeight")}
          value={activeLineHeight}
          description={`${minimumLineHeight}–${maximumLineHeight}`}
          options={lineHeightSuggestions.map((value) => ({
            value,
            label: value === "auto" ? t(language, "editor.lineHeightAuto") : value,
          }))}
          normalize={normalizeLineHeightInput}
          displayValue={(value) => value === "auto" ? t(language, "editor.lineHeightAuto") : value}
          onCommit={(value) => {
            if (value === "auto") editor.chain().focus().unsetParagraphLineHeight().run();
            else editor.chain().focus().setParagraphLineHeight(value).run();
          }}
        />
      </div>
      <div className="toolbar-group toolbar-mark-controls">
        <EditorToolbarButton active={editor.isActive("bold")} label={t(language, "editor.bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong aria-hidden="true">B</strong>
        </EditorToolbarButton>
        <EditorToolbarButton active={editor.isActive("italic")} label={t(language, "editor.italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em aria-hidden="true">I</em>
        </EditorToolbarButton>
        <EditorToolbarButton active={editor.isActive("underline")} label={t(language, "editor.underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <u aria-hidden="true">U</u>
        </EditorToolbarButton>
        <EditorToolbarButton active={editor.isActive("strike")} label={t(language, "editor.strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <s aria-hidden="true">S</s>
        </EditorToolbarButton>
        <EditorColorPopover editor={editor} language={language} kind="text" state={textColor} fallback={inheritedTextColor} />
        <EditorColorPopover editor={editor} language={language} kind="highlight" state={highlightColor} fallback="#fff3a3" />
      </div>
    </>
  );
}
