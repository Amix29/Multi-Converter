import { useEffect, useEffectEvent } from "react";
import type { Editor } from "@tiptap/react";

interface EditorShortcutOptions {
  editor: Editor | null;
  blocked: boolean;
  onSave(mode: "save" | "saveAs"): void;
  onSearch(): void;
  onLink(): void;
  onHelp(): void;
}

export function useEditorShortcuts(options: EditorShortcutOptions) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const editor = options.editor;
    if (!editor || options.blocked || event.defaultPrevented || event.isComposing || event.altKey) return;
    if (!(event.ctrlKey || event.metaKey) || document.body.classList.contains("has-open-modal")) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest(".document-editor-shell")) return;
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      if (!event.repeat) options.onSave(event.shiftKey ? "saveAs" : "save");
      return;
    }
    if (key === "f" || key === "h") {
      event.preventDefault();
      options.onSearch();
      document.querySelector<HTMLInputElement>(".editor-searchbar input")?.focus();
      return;
    }
    if (target.closest("input, select, textarea, [role=dialog]")) return;
    if (key === "/") {
      event.preventDefault();
      options.onHelp();
    } else if (key === "k") {
      event.preventDefault();
      options.onLink();
    } else if (!event.shiftKey && ["l", "e", "r", "j"].includes(key)) {
      event.preventDefault();
      const alignment = { l: "left", e: "center", r: "right", j: "justify" } as const;
      editor.chain().focus().setTextAlign(alignment[key as keyof typeof alignment]).run();
    } else if (key === "enter") {
      event.preventDefault();
      editor.chain().focus().setPageBreak().run();
    } else if (key === " " && !event.shiftKey) {
      event.preventDefault();
      editor.chain().focus().unsetAllMarks().run();
    }
  });
  useEffect(() => {
    // Capture app commands before ProseMirror's built-in shortcut handlers.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
