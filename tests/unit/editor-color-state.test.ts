import { Schema } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import type { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";

import {
  createEditorColorPreviewPlugin,
  captureColorPreview,
  normalizedCssColor,
  restoreColorPreview,
  selectionColorState,
  setEditorColorPreviewMeta,
} from "../../src/editor/editorColorState";

const schema = new Schema({
  nodes: {
    doc: { content: "(paragraph|image)+" },
    paragraph: { content: "text*", group: "block" },
    image: { group: "block", atom: true },
    text: { group: "inline" },
  },
  marks: {
    textStyle: { attrs: { color: { default: null } } },
    highlight: { attrs: { color: { default: null } } },
  },
});

function stateWith(parts: Array<{ text: string; color?: string; highlight?: string }>) {
  const content = parts.map((part) => {
    const marks = [];
    if (part.color) marks.push(schema.mark("textStyle", { color: part.color }));
    if (part.highlight) marks.push(schema.mark("highlight", { color: part.highlight }));
    return schema.text(part.text, marks);
  });

  const doc = schema.node("doc", null, [schema.node("paragraph", null, content)]);
  return EditorState.create({ schema, doc });
}

describe("editor selection color state", () => {
  it("resolves the inherited computed color instead of hard-coding editor ink", () => {
    expect(normalizedCssColor("rgb(29, 36, 31)")).toBe("#1d241f");
    expect(normalizedCssColor("rgba(196, 111, 58, 1)")).toBe("#c46f3a");
    expect(normalizedCssColor("rgb(999, 0, 0)")).toBeNull();
  });

  it("keeps a uniform text color instead of resetting it to black", () => {
    let state = stateWith([{ text: "coloré", color: "#C46F3A" }]);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 7)));
    expect(selectionColorState(state, "text")).toEqual({ kind: "uniform", color: "#c46f3a" });
  });

  it("reports a mixed selection explicitly", () => {
    let state = stateWith([
      { text: "rouge", color: "#ff0000" },
      { text: "bleu", color: "#0000ff" },
    ]);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 10)));
    expect(selectionColorState(state, "text")).toEqual({ kind: "mixed", color: null });
  });

  it("distinguishes unset and uniform highlighting", () => {
    let state = stateWith([{ text: "clair", highlight: "#FFF3A3" }]);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
    expect(selectionColorState(state, "highlight")).toEqual({ kind: "uniform", color: "#fff3a3" });
    expect(selectionColorState(state, "text")).toEqual({ kind: "unset", color: null });
  });

  it("restores a NodeSelection bookmark exactly after a preview", () => {
    const doc = schema.node("doc", null, [schema.node("image"), schema.node("paragraph")]);
    let state = EditorState.create({ schema, doc });
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 0)));
    const editor = {
      get state() { return state; },
      view: { dispatch(transaction: typeof state.tr) { state = state.apply(transaction); } },
    } as unknown as Editor;
    const snapshot = captureColorPreview(editor);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));

    restoreColorPreview(editor, snapshot);

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect(state.selection.from).toBe(0);
  });

  it("previews the inherited text color when the explicit color is removed", () => {
    const plugin = createEditorColorPreviewPlugin();
    let state = EditorState.create({ schema, doc: stateWith([{ text: "hérité" }]).doc, plugins: [plugin] });
    state = state.apply(setEditorColorPreviewMeta(state.tr, {
      kind: "text",
      color: null,
      from: 1,
      to: 7,
    }));
    const decoration = plugin.getState(state)?.find()[0] as unknown as {
      type?: { attrs?: { style?: string } };
    };
    expect(decoration?.type?.attrs?.style).toBe("color: inherit !important");
  });

  it("keeps earlier undo history intact while preview decorations open and close", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("avant")])]);
    let state = EditorState.create({
      schema,
      doc,
      plugins: [history(), createEditorColorPreviewPlugin()],
    });
    state = state.apply(state.tr.insertText(" après", 6));
    const editedDocument = state.doc;
    state = state.apply(setEditorColorPreviewMeta(state.tr, {
      kind: "highlight",
      color: "#fff3a3",
      from: 1,
      to: state.doc.content.size,
    }));
    state = state.apply(setEditorColorPreviewMeta(state.tr, null));

    expect(state.doc.eq(editedDocument)).toBe(true);
    let undoTransaction = state.tr;
    expect(undo(state, (transaction) => { undoTransaction = transaction; })).toBe(true);
    state = state.apply(undoTransaction);
    expect(state.doc.textContent).toBe("avant");
  });
});
