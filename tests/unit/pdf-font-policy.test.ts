import { describe, expect, it, vi } from "vitest";
import type { EditorDocumentV1, MultiConverterApi } from "../../src/lib/api";
import { prepareDocumentForPdf } from "../../src/editor/pdfFontPolicy";

function document(): EditorDocumentV1 {
  return {
    schemaVersion: 1,
    id: "doc-1",
    title: "Fonts",
    source: null,
    content: {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "Default" },
          { type: "text", text: " Restricted", marks: [{ type: "textStyle", attrs: { fontFamily: "Private Face" } }] },
        ],
      }],
    },
    header: null,
    footer: null,
    page: {
      format: "a4",
      orientation: "portrait",
      marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
      numbering: "none",
    },
    assets: [],
    warnings: [],
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}

describe("PDF font embedding policy", () => {
  it("substitutes only the export copy and keeps the editor document unchanged", async () => {
    const api = {
      editorListSystemFonts: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        defaultFamily: "System Sans",
        families: ["System Sans", "Private Face"],
      }),
      editorInspectFontEmbedding: vi.fn(async (family: string) => ({
        schemaVersion: 1,
        requestedFamily: family,
        resolvedFamily: family === "Private Face" ? "System Sans" : family,
        permission: family === "Private Face" ? "restricted" : "installable",
        canEmbedPdf: family !== "Private Face",
        substituted: family === "Private Face",
        warning: family === "Private Face" ? "Private Face remplacée pour le PDF." : null,
      })),
    } as unknown as MultiConverterApi;
    const source = document();

    const result = await prepareDocumentForPdf(api, source);
    const output = JSON.stringify(result.document.content);

    expect(output).toContain('"fontFamily":"System Sans"');
    expect(JSON.stringify(source.content)).toContain('"fontFamily":"Private Face"');
    expect(result.warnings).toEqual(["Private Face remplacée pour le PDF."]);
    expect(result.document.warnings[0]?.code).toBe("pdfFontSubstitution");
  });

  it("returns the same document when every installed font can be embedded", async () => {
    const api = {
      editorListSystemFonts: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        defaultFamily: "System Sans",
        families: ["System Sans", "Private Face"],
      }),
      editorInspectFontEmbedding: vi.fn(async (family: string) => ({
        schemaVersion: 1,
        requestedFamily: family,
        resolvedFamily: family,
        permission: "installable",
        canEmbedPdf: true,
        substituted: false,
        warning: null,
      })),
    } as unknown as MultiConverterApi;
    const source = document();

    const result = await prepareDocumentForPdf(api, source);

    expect(result.document).toBe(source);
    expect(result.warnings).toEqual([]);
  });

  it("uses face-aware per-glyph fallbacks for mixed scripts without aborting the export", async () => {
    const source = document();
    source.content = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "A🙂日",
          marks: [
            { type: "bold" },
            { type: "textStyle", attrs: { fontFamily: "Mixed Face" } },
          ],
        }],
      }],
    };
    const inspect = vi.fn(async (_family: string, sample: string, face?: { bold?: boolean }) => {
      expect(face?.bold).toBe(true);
      if ([...sample].length > 1) {
        throw new Error("EDITOR_FONT_NO_EMBEDDABLE_FALLBACK: mixed coverage");
      }
      const resolvedFamily = sample === "🙂" ? "Emoji Face" : sample === "日" ? "CJK Face" : "Mixed Face";
      return {
        schemaVersion: 1 as const,
        requestedFamily: "Mixed Face",
        resolvedFamily,
        permission: "installable" as const,
        canEmbedPdf: true,
        substituted: resolvedFamily !== "Mixed Face",
        warning: resolvedFamily === "Mixed Face" ? null : `${resolvedFamily} utilisée.`,
      };
    });
    const api = {
      editorListSystemFonts: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        defaultFamily: "System Sans",
        families: ["Mixed Face", "Emoji Face", "CJK Face"],
      }),
      editorInspectFontEmbedding: inspect,
    } as unknown as MultiConverterApi;

    const result = await prepareDocumentForPdf(api, source);
    const content = JSON.stringify(result.document.content);

    expect(content).toContain('"fontFamily":"Mixed Face"');
    expect(content).toContain('"fontFamily":"Emoji Face"');
    expect(content).toContain('"fontFamily":"CJK Face"');
    expect(content).toContain('"text":"🙂"');
    expect(result.warnings).toEqual(["Emoji Face utilisée.", "CJK Face utilisée."]);
  });

  it("keeps glyphs covered by the chosen embeddable face when one glyph needs fallback", async () => {
    const source = document();
    source.content = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "AĀ",
          marks: [{ type: "textStyle", attrs: { fontFamily: "Chosen Face" } }],
        }],
      }],
    };
    const inspect = vi.fn(async (_family: string, sample: string) => {
      const missing = sample.includes("Ā");
      return {
        schemaVersion: 1 as const,
        requestedFamily: "Chosen Face",
        resolvedFamily: missing ? "Fallback Face" : "Chosen Face",
        permission: "installable" as const,
        canEmbedPdf: true,
        substituted: missing,
        requestedCanEmbedPdf: true,
        requestedCoversText: !missing,
        warning: missing ? "Fallback Face utilisée." : null,
      };
    });
    const api = {
      editorListSystemFonts: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        defaultFamily: "Chosen Face",
        families: ["Chosen Face", "Fallback Face"],
      }),
      editorInspectFontEmbedding: inspect,
    } as unknown as MultiConverterApi;

    const result = await prepareDocumentForPdf(api, source);
    const content = JSON.stringify(result.document.content);

    expect(content).toContain('"text":"A"');
    expect(content).toContain('"text":"Ā"');
    expect(content).toContain('"fontFamily":"Chosen Face"');
    expect(content).toContain('"fontFamily":"Fallback Face"');
    expect(inspect).toHaveBeenCalledTimes(4);
  });
});
