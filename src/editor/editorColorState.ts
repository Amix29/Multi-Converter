import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { Mark } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type SelectionBookmark,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { normalizedHexColor } from "./editorFormatting";

export type EditorColorKind = "text" | "highlight";
export type SelectionColorState =
  | { kind: "unset"; color: null }
  | { kind: "uniform"; color: string }
  | { kind: "mixed"; color: null };

export interface ColorPreviewSnapshot {
  from: number;
  to: number;
  bookmark: SelectionBookmark;
  storedMarks: readonly Mark[] | null;
}

interface ColorPreviewMeta {
  kind: EditorColorKind;
  color: string | null;
  from: number;
  to: number;
}

const colorPreviewKey = new PluginKey<DecorationSet>("editorColorPreview");

export const EditorColorPreview = Extension.create({
  name: "editorColorPreview",
  addProseMirrorPlugins() {
    return [createEditorColorPreviewPlugin()];
  },
});

export function createEditorColorPreviewPlugin() {
  return new Plugin<DecorationSet>({
    key: colorPreviewKey,
    state: {
      init: () => DecorationSet.empty,
      apply(transaction, previous) {
        const mapped = previous.map(transaction.mapping, transaction.doc);
        const meta = transaction.getMeta(colorPreviewKey) as ColorPreviewMeta | null | undefined;
        if (meta === undefined) return mapped;
        if (meta === null || meta.from >= meta.to) return DecorationSet.empty;
        const maximum = transaction.doc.content.size;
        const from = Math.min(maximum, Math.max(0, meta.from));
        const to = Math.min(maximum, Math.max(from, meta.to));
        const color = normalizedHexColor(meta.color);
        const style = meta.kind === "text"
          ? `color: ${color ?? "inherit"} !important`
          : `background-color: ${color ?? "transparent"} !important`;
        return from < to
          ? DecorationSet.create(transaction.doc, [Decoration.inline(from, to, { style })])
          : DecorationSet.empty;
      },
    },
    props: {
      decorations: (state) => colorPreviewKey.getState(state) ?? DecorationSet.empty,
    },
  });
}

export function setEditorColorPreviewMeta(
  transaction: Transaction,
  meta: ColorPreviewMeta | null,
) {
  return transaction.setMeta(colorPreviewKey, meta);
}

interface ColorCommandChain {
  setColor(color: string): ColorCommandChain;
  unsetColor(): ColorCommandChain;
  setHighlight(attributes: { color: string }): ColorCommandChain;
  unsetHighlight(): ColorCommandChain;
  run(): boolean;
}

export function selectionColorState(
  state: EditorState,
  kind: EditorColorKind,
): SelectionColorState {
  const markName = kind === "text" ? "textStyle" : "highlight";
  const attribute = "color";
  const colors = new Set<string | null>();
  const { from, to, empty } = state.selection;

  if (empty) {
    const marks = state.storedMarks ?? state.selection.$from.marks();
    const mark = marks.find((candidate) => candidate.type.name === markName);
    const color = normalizedHexColor(mark?.attrs[attribute]);
    return color ? { kind: "uniform", color } : { kind: "unset", color: null };
  }

  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText || !node.text?.length) return;
    const mark = node.marks.find((candidate) => candidate.type.name === markName);
    colors.add(normalizedHexColor(mark?.attrs[attribute]));
  });

  if (colors.size === 0 || (colors.size === 1 && colors.has(null))) {
    return { kind: "unset", color: null };
  }
  if (colors.size === 1) {
    return { kind: "uniform", color: [...colors][0] as string };
  }
  return { kind: "mixed", color: null };
}

export function inheritedEditorTextColor(editor: Editor): string | null {
  if (typeof getComputedStyle !== "function") return null;
  return normalizedCssColor(getComputedStyle(editor.view.dom).color);
}

export function normalizedCssColor(source: unknown): string | null {
  const hex = normalizedHexColor(source);
  if (hex) return hex;
  if (typeof source !== "string") return null;
  const match = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*[\d.]+)?\s*\)$/i.exec(source.trim());
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function captureColorPreview(editor: Editor): ColorPreviewSnapshot {
  return {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
    bookmark: editor.state.selection.getBookmark(),
    storedMarks: editor.state.storedMarks ? [...editor.state.storedMarks] : null,
  };
}

export function previewColor(
  editor: Editor,
  snapshot: ColorPreviewSnapshot,
  kind: EditorColorKind,
  color: string | null,
) {
  const transaction = setEditorColorPreviewMeta(editor.state.tr, {
    kind,
    color,
    from: snapshot.from,
    to: snapshot.to,
  })
    .setMeta("addToHistory", false)
    .setMeta("preventUpdate", true);
  editor.view.dispatch(transaction);
}

export function applyPreviewColor(
  editor: Editor,
  snapshot: ColorPreviewSnapshot,
  kind: EditorColorKind,
  color: string | null,
) {
  restoreColorPreview(editor, snapshot);
  const chain = editor.chain().focus() as unknown as ColorCommandChain;
  if (kind === "text") {
    (color ? chain.setColor(color) : chain.unsetColor()).run();
  } else {
    (color ? chain.setHighlight({ color }) : chain.unsetHighlight()).run();
  }
}

export function restoreColorPreview(editor: Editor, snapshot: ColorPreviewSnapshot) {
  const transaction = editor.state.tr;
  try {
    transaction.setSelection(snapshot.bookmark.resolve(transaction.doc));
  } catch {
    const maximum = transaction.doc.content.size;
    const from = Math.min(maximum, Math.max(0, snapshot.from));
    const to = Math.min(maximum, Math.max(from, snapshot.to));
    transaction.setSelection(TextSelection.create(transaction.doc, from, to));
  }
  transaction.setStoredMarks(snapshot.storedMarks ? [...snapshot.storedMarks] : null);
  setEditorColorPreviewMeta(transaction, null);
  transaction.setMeta("addToHistory", false);
  transaction.setMeta("preventUpdate", true);
  editor.view.dispatch(transaction);
}
