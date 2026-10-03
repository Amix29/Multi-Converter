import { Extension } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphLineHeight: {
      setParagraphLineHeight: (lineHeight: string) => ReturnType;
      unsetParagraphLineHeight: () => ReturnType;
    };
  }
}

export const ParagraphLineHeight = Extension.create({
  name: "paragraphLineHeight",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (element) => element.style.lineHeight || null,
          renderHTML: (attributes) => attributes.lineHeight
            ? { style: `line-height: ${safeLineHeight(attributes.lineHeight)}` }
            : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setParagraphLineHeight: (lineHeight: string) => ({ state, tr, dispatch }) => {
        if (!dispatch) return true;
        updateSelectedTextBlocks(state, tr, safeLineHeight(lineHeight));
        dispatch(tr.scrollIntoView());
        return true;
      },
      unsetParagraphLineHeight: () => ({ state, tr, dispatch }) => {
        if (!dispatch) return true;
        updateSelectedTextBlocks(state, tr, null);
        dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
});

function updateSelectedTextBlocks(
  state: EditorState,
  tr: Transaction,
  lineHeight: string | null,
) {
  const positions = new Set<number>();
  const { from, to, $from } = state.selection;
  state.doc.nodesBetween(from, to, (node, position) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") positions.add(position);
  });
  if (!positions.size) {
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name === "paragraph" || node.type.name === "heading") {
        positions.add($from.before(depth));
        break;
      }
    }
  }
  for (const position of positions) {
    const node = tr.doc.nodeAt(position);
    if (!node) continue;
    tr.setNodeMarkup(position, undefined, { ...node.attrs, lineHeight });
  }
}

function safeLineHeight(source: unknown) {
  const value = Number(source);
  return Number.isFinite(value) ? String(Math.min(5, Math.max(0.8, value))) : "1.45";
}
