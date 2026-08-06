import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { EditorDocumentV1 } from "../../src/lib/api";
import { generateDocx } from "../../src/editor/docx/generateDocx";
import { cssMeasureMm, cssOffsetMm, normalizeHex } from "../../src/editor/docx/measurements";

function documentFixture(): EditorDocumentV1 {
  return {
    schemaVersion: 1,
    id: "7c16d176-5877-4c47-9717-b44bf9354407",
    title: "Fidélité DOCX",
    source: null,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "right", lineHeight: "1.5", marginLeft: "10mm", textIndent: "5mm" },
          content: [{
            type: "text",
            text: "Texte riche",
            marks: [
              { type: "bold" },
              { type: "underline" },
              { type: "textStyle", attrs: { fontFamily: "Aptos", fontSize: "13.5pt", color: "#123456" } },
              { type: "highlight", attrs: { color: "#fff4bd" } },
            ],
          }],
        },
        {
          type: "paragraph",
          attrs: { marginLeft: "0", textIndent: "-5mm" },
          content: [{ type: "text", text: "Retrait suspendu" }],
        },
        {
          type: "table",
          content: [{
            type: "tableRow",
            attrs: { height: 48 },
            content: [
              { type: "tableHeader", attrs: { colspan: 2, rowspan: 1, colwidth: [120, 240] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Entête" }] }] },
            ],
          }],
        },
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Citation fidèle" }] }],
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Liste A" }] }] }],
        },
        {
          type: "orderedList",
          attrs: { start: 7 },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Liste B" }] }] }],
        },
        { type: "pageBreak" },
        { type: "unsupportedObject", attrs: { label: "Objet actif neutralisé" } },
      ],
    },
    header: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Page {page}" }] }] },
    footer: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "sur {total}" }] }] },
    page: {
      format: "a4",
      orientation: "landscape",
      marginsMm: { top: 20, right: 18, bottom: 20, left: 18 },
      numbering: "bottom-right",
    },
    assets: [],
    warnings: [],
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}

describe("direct DOCX generation", () => {
  it("maps rich Tiptap structures to a complete OOXML package", async () => {
    const result = await generateDocx(documentFixture(), async () => {
      throw new Error("unexpected asset read");
    });
    expect(result.bytes.slice(0, 2)).toEqual(Uint8Array.from([0x50, 0x4b]));
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "docx-unsupported-Objet actif neutralisé" }));

    const archive = await JSZip.loadAsync(result.bytes);
    const xml = await archive.file("word/document.xml")!.async("string");
    const numbering = await archive.file("word/numbering.xml")!.async("string");
    expect(archive.file("[Content_Types].xml")).not.toBeNull();
    expect(xml).toContain("Texte riche");
    expect(xml).toContain("Aptos");
    expect(xml).toContain("123456");
    expect(xml).toContain("FFF4BD");
    expect(xml).toContain("w:gridSpan");
    const gridWidths = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/?/g)].map((match) => Number(match[1]));
    expect(gridWidths).toHaveLength(2);
    expect(gridWidths.reduce((sum, width) => sum + width, 0)).toBeLessThan(15_000);
    expect(xml).toContain("w:trHeight");
    expect(xml).toContain("w:pBdr");
    expect(xml).toContain("w:hanging");
    expect(numbering).toContain('w:start w:val="3"');
    expect(numbering).toContain('w:start w:val="7"');
    expect(xml).toContain("w:pageBreakBefore");
    expect(xml).toContain("Objet actif neutralisé");
  });

  it("keeps the selected font and embeds local images without a LibreOffice bridge", async () => {
    const document = documentFixture();
    document.assets = [{
      id: "asset-image",
      name: "pixel.png",
      mimeType: "image/png",
      size: 68,
      width: 1,
      height: 1,
    }];
    document.content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Police du document ",
              marks: [{ type: "textStyle", attrs: { fontFamily: "Famille utilisateur", fontSize: "12pt" } }],
            },
            {
              type: "documentImage",
              attrs: {
                assetId: "asset-image",
                width: "8mm",
                height: "8mm",
                layoutMode: "flow",
                alt: "Pixel inline",
              },
            },
            { type: "text", text: " après l’image" },
          ],
        },
        {
          type: "documentImage",
          attrs: {
            assetId: "asset-image",
            width: "25mm",
            height: "25mm",
            layoutMode: "floating",
            offsetXmm: 5,
            offsetYmm: 8,
            zIndex: 4,
            wrapMode: "parallel",
          },
        },
      ],
    };
    document.header = {
      type: "doc",
      content: [{
        type: "documentImage",
        attrs: { assetId: "asset-image", width: "10mm", height: "10mm" },
      }],
    };
    const onePixelPng = Uint8Array.from(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ));
    const result = await generateDocx(document, async () => ({ mimeType: "image/png", bytes: [...onePixelPng] }));
    const archive = await JSZip.loadAsync(result.bytes);
    const xml = await archive.file("word/document.xml")!.async("string");
    const relationships = await archive.file("word/_rels/document.xml.rels")!.async("string");
    const headerXml = await archive.file("word/header1.xml")!.async("string");
    expect(xml).toContain("Famille utilisateur");
    expect(xml).toContain("après l’image");
    expect(xml).toContain("wp:inline");
    expect(xml).toContain("wp:anchor");
    expect(xml).toContain("wp:wrapSquare");
    expect(headerXml).toContain("pic:pic");
    expect(result.warnings.some((warning) => warning.code === "docx-inline-image-position")).toBe(false);

    const mediaNames = Object.keys(archive.files).filter((name) => name.startsWith("word/media/") && !archive.files[name].dir);
    expect(mediaNames).not.toHaveLength(0);
    const relationshipTargets = [...relationships.matchAll(/Target="(media\/[^\"]+)"/g)].map((match) => `word/${match[1]}`);
    expect(relationshipTargets).not.toHaveLength(0);
    for (const target of relationshipTargets) {
      expect(archive.file(target), `missing relationship target ${target}`).not.toBeNull();
    }

    // Reopen the produced bytes independently and require the same core OOXML
    // parts. This catches dangling media relationships and truncated packages.
    const reopened = await JSZip.loadAsync(Uint8Array.from(result.bytes));
    expect(reopened.file("[Content_Types].xml")).not.toBeNull();
    expect(reopened.file("word/document.xml")).not.toBeNull();
    expect(reopened.file("word/_rels/document.xml.rels")).not.toBeNull();
  });

  it("normalizes physical measurements and hexadecimal colors deterministically", () => {
    expect(cssMeasureMm("50%", 170, 100)).toBe(85);
    expect(cssMeasureMm("96px", 170, 100)).toBeCloseTo(25.4, 4);
    expect(cssOffsetMm("0", 170, 100)).toBe(0);
    expect(cssOffsetMm("-5mm", 170, 100)).toBe(-5);
    expect(normalizeHex("#abc")).toBe("AABBCC");
    expect(normalizeHex("not-a-color")).toBeUndefined();
  });
});
