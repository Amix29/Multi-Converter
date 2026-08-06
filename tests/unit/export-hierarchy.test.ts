import { describe, expect, it } from "vitest";
import { createExportEntry, createExportEntries } from "../../src/lib/api/exportEntries";

describe("hierarchical export entries", () => {
  it("keeps an isolated conversion at the destination root", () => {
    expect(createExportEntry("C:\\Temp\\job\\photo.jpg", {})).toEqual({
      outputPath: "C:\\Temp\\job\\photo.jpg",
      relativePath: "photo.jpg",
      rootId: null,
    });
  });

  it("replaces the source leaf while retaining the imported folder hierarchy", () => {
    expect(createExportEntry("C:\\Temp\\job\\photo.webp", {
      importOrigin: {
        kind: "folder",
        rootId: "private-root-id",
        rootName: "travail",
        relativePath: "images/2026/photo.png",
      },
    })).toEqual({
      outputPath: "C:\\Temp\\job\\photo.webp",
      relativePath: "travail/images/2026/photo.webp",
      rootId: "private-root-id",
    });
  });

  it("preserves one shared root id across every result from one import", () => {
    const source = {
      importOrigin: {
        kind: "folder" as const,
        rootId: "same-root",
        rootName: "travail",
        relativePath: "nested/input.txt",
      },
    };
    const entries = createExportEntries([
      { outputPath: "C:\\Temp\\one.md", source },
      { outputPath: "C:\\Temp\\two.md", source },
    ]);
    expect(entries.map((entry) => entry.rootId)).toEqual(["same-root", "same-root"]);
  });

  it("suffixes same-name outputs once within one imported directory", () => {
    const source = {
      importOrigin: {
        kind: "folder" as const,
        rootId: "same-root",
        rootName: "travail",
        relativePath: "documents/source.docx",
      },
    };
    const entries = createExportEntries([
      { outputPath: "C:\\Temp\\one\\rapport.pdf", source },
      { outputPath: "C:\\Temp\\two\\rapport.pdf", source },
      { outputPath: "C:\\Temp\\three\\rapport.pdf", source },
    ]);

    expect(entries.map((entry) => entry.relativePath)).toEqual([
      "travail/documents/rapport.pdf",
      "travail/documents/rapport (2).pdf",
      "travail/documents/rapport (3).pdf",
    ]);
  });

  it("reserves generated suffixes against a real file with that name", () => {
    const origin = (relativePath: string) => ({
      importOrigin: {
        kind: "folder" as const,
        rootId: "same-root",
        rootName: "travail",
        relativePath,
      },
    });
    const entries = createExportEntries([
      { outputPath: "C:\\Temp\\one\\a.pdf", source: origin("a.docx") },
      { outputPath: "C:\\Temp\\two\\a.pdf", source: origin("a.odt") },
      { outputPath: "C:\\Temp\\three\\a (2).pdf", source: origin("a (2).docx") },
    ]);

    expect(entries.map((entry) => entry.relativePath)).toEqual([
      "travail/a.pdf",
      "travail/a (2).pdf",
      "travail/a (2) (2).pdf",
    ]);
  });
});
