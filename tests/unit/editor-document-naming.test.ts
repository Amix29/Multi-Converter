import { describe, expect, it } from "vitest";
import { isUntitledDocument, normalizedDocumentTitle } from "../../src/editor/documentNaming";

describe("editor document naming", () => {
  it.each(["", "  ", "Sans titre", "UNTITLED", "Sin título", "Ohne Titel", "Sem título", "Senza titolo"])(
    "requires a real title before export: %s",
    (title) => expect(isUntitledDocument(title)).toBe(true),
  );

  it("keeps a deliberate document title", () => {
    expect(isUntitledDocument("Rapport trimestriel")).toBe(false);
    expect(isUntitledDocument("Sans titre - brouillon assumé")).toBe(false);
  });

  it("normalizes surrounding and repeated whitespace", () => {
    expect(normalizedDocumentTitle("  Rapport   final  ")).toBe("Rapport final");
  });
});
