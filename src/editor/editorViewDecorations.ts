import { Extension } from "@tiptap/core";
import type { Node as DocumentNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const formattingMarksKey = new PluginKey<{ enabled: boolean; decorations: DecorationSet }>("formattingMarks");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    formattingMarks: { toggleFormattingMarks: () => ReturnType };
  }
}

export interface FormattingMark { position: number; symbol: string }

export function collectFormattingMarks(doc: DocumentNode): FormattingMark[] {
  const marks: FormattingMark[] = [];
  doc.descendants((node, position) => {
    if (node.isText && node.text) {
      for (let offset = 0; offset < node.text.length; offset += 1) {
        const character = node.text[offset];
        if (character === " " || character === "\u00a0" || character === "\t") {
          marks.push({ position: position + offset, symbol: character === "\t" ? "→" : character === "\u00a0" ? "°" : "·" });
        }
      }
    } else if (node.type.name === "hardBreak") {
      marks.push({ position, symbol: "↵" });
    }
    if (node.isTextblock) marks.push({ position: position + node.nodeSize - 1, symbol: "¶" });
    return true;
  });
  return marks;
}

function markDecorations(doc: DocumentNode): DecorationSet {
  return DecorationSet.create(doc, collectFormattingMarks(doc).map(({ position, symbol }) =>
    Decoration.widget(position, () => {
      const marker = document.createElement("span");
      marker.className = "editor-formatting-mark";
      marker.contentEditable = "false";
      marker.setAttribute("aria-hidden", "true");
      const glyph = document.createElement("span");
      glyph.textContent = symbol;
      marker.append(glyph);
      return marker;
    }, { side: -1, key: `${position}:${symbol}`, ignoreSelection: true })));
}

export const FormattingMarks = Extension.create({
  name: "formattingMarks",
  addCommands() {
    return {
      toggleFormattingMarks: () => ({ tr, state, dispatch }) => {
        if (dispatch) tr.setMeta(formattingMarksKey, !formattingMarksKey.getState(state)?.enabled);
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: formattingMarksKey,
      state: {
        init: () => ({ enabled: false, decorations: DecorationSet.empty }),
        apply(tr, previous) {
          const enabled = tr.getMeta(formattingMarksKey) ?? previous.enabled;
          if (!enabled) return { enabled, decorations: DecorationSet.empty };
          return {
            enabled,
            decorations: tr.docChanged || enabled !== previous.enabled ? markDecorations(tr.doc) : previous.decorations,
          };
        },
      },
      props: { decorations: (state) => formattingMarksKey.getState(state)?.decorations },
    })];
  },
});

// Browser selection painting disappears when a toolbar input takes keyboard focus.
// This view-only decoration retains the current ProseMirror text selection.
export const PersistentSelection = Extension.create({
  name: "persistentSelection",
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations: (state) => {
          const { selection } = state;
          if (this.editor.isFocused || selection.empty || !(selection instanceof TextSelection)) return null;
          return DecorationSet.create(state.doc, [Decoration.inline(selection.from, selection.to, { class: "editor-retained-selection" })]);
        },
      },
    })];
  },
});
