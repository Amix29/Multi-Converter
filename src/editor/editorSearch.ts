import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";

export function findNext(editor: Editor, query: string) {
  if (!query) return false;
  const start = editor.state.selection.to;
  const matches: Array<{ from: number; to: number }> = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    const index = node.text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    if (index < 0) return;
    matches.push({ from: position + index, to: position + index + query.length });
  });
  const selected = matches.find((item) => item.from >= start) ?? matches[0];
  if (!selected) return false;
  editor.view.dispatch(
    editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, selected.from, selected.to))
      .scrollIntoView(),
  );
  editor.commands.focus();
  return true;
}

export function replaceSelection(editor: Editor, query: string, replacement: string) {
  const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);
  if (selected.toLocaleLowerCase() !== query.toLocaleLowerCase() && !findNext(editor, query)) return;
  editor.chain().focus().insertContent(replacement).run();
}
