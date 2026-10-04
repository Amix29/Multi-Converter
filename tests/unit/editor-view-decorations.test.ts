import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { collectFormattingMarks } from "../../src/editor/editorViewDecorations";

const schema = new Schema({ nodes: {
  doc: { content: "paragraph+" }, paragraph: { content: "inline*", group: "block" },
  text: { group: "inline" }, hardBreak: { inline: true, group: "inline" },
} });

describe("formatting marks are view aids", () => {
  it("locates spaces, tabs, nonbreaking spaces and hard breaks without changing content", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("HI !\tA\u00a0B"), schema.node("hardBreak"), schema.text("Fin")])]);
    const original = doc.toJSON();
    expect(collectFormattingMarks(doc)).toEqual([
      { position: 13, symbol: "¶" }, { position: 3, symbol: "·" },
      { position: 5, symbol: "→" }, { position: 7, symbol: "°" }, { position: 9, symbol: "↵" },
    ]);
    expect(doc.toJSON()).toEqual(original);
  });
  it("marks empty paragraphs and retains correct positions after edits", () => {
    const empty = schema.node("paragraph");
    const doc = schema.node("doc", null, [empty, schema.node("paragraph", null, schema.text("A B"))]);
    expect(collectFormattingMarks(doc)).toEqual([
      { position: 1, symbol: "¶" }, { position: 6, symbol: "¶" }, { position: 4, symbol: "·" },
    ]);
    const changed = doc.replace(4, 5, schema.node("doc", null, empty).slice(0, 0));
    expect(collectFormattingMarks(changed).filter((mark) => mark.symbol === "·")).toEqual([]);
  });
});
