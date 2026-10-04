import { useRef } from "react";
import { createPortal } from "react-dom";
import { useModalAccessibility } from "../hooks/useModalAccessibility";
import { t, type LanguageCode, type TranslationKey } from "../i18n";

const shortcuts: [string, TranslationKey][] = [
  ["Ctrl+S", "editor.save"], ["Ctrl+Shift+S", "editor.saveAs"],
  ["Ctrl+Z", "editor.undo"], ["Ctrl+Y / Ctrl+Shift+Z", "editor.redo"],
  ["Ctrl+B", "editor.bold"], ["Ctrl+I", "editor.italic"], ["Ctrl+U", "editor.underline"],
  ["Ctrl+L", "editor.align.left"], ["Ctrl+E", "editor.align.center"],
  ["Ctrl+R", "editor.align.right"], ["Ctrl+J", "editor.align.justify"],
  ["Ctrl+F / Ctrl+H", "editor.findReplace"], ["Ctrl+K", "editor.link"],
  ["Ctrl+Enter", "editor.pageBreak"], ["Ctrl+Space", "editor.clearFormatting"],
  ["Ctrl+Shift+8", "editor.formattingMarks"],
  ["Ctrl++ / Ctrl+−", "editor.zoom"], ["Ctrl+0", "editor.resetZoom"],
  ["F11 / Esc", "editor.enterFocusMode"], ["Ctrl+/", "editor.keyboardShortcuts"],
];

export function EditorShortcutsDialog(props: { language: LanguageCode; open: boolean; onClose(): void }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useModalAccessibility({ isOpen: props.open, surfaceRef, onEscape: props.onClose });
  if (!props.open) return null;
  return createPortal(
    <div className="editor-modal-backdrop" onMouseDown={props.onClose}>
      <div className="editor-modal editor-shortcuts-dialog" ref={surfaceRef} role="dialog" aria-modal="true" aria-labelledby="editor-shortcuts-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <header><h2 id="editor-shortcuts-title">{t(props.language, "editor.keyboardShortcuts")}</h2><button type="button" onClick={props.onClose} aria-label={t(props.language, "common.close")}>×</button></header>
        <p>{t(props.language, "editor.shortcutHint")}</p>
        <dl>{shortcuts.map(([shortcut, key]) => <div key={shortcut}><dt>{t(props.language, key)}</dt><dd><kbd>{shortcut}</kbd></dd></div>)}</dl>
      </div>
    </div>, document.body,
  );
}
