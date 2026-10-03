import { describe, expect, it } from "vitest";
import { nextPaletteIndex } from "../../src/editor/colorPaletteNavigation";

describe("color palette roving navigation", () => {
  const theme = { columns: 7, rows: 6, order: "column-major" as const };

  it("moves by visual row and column and supports Home and End", () => {
    expect(nextPaletteIndex(7, "ArrowRight", 42, theme)).toBe(13);
    expect(nextPaletteIndex(7, "ArrowLeft", 42, theme)).toBe(1);
    expect(nextPaletteIndex(7, "ArrowDown", 42, theme)).toBe(8);
    expect(nextPaletteIndex(7, "ArrowUp", 42, theme)).toBe(6);
    expect(nextPaletteIndex(20, "Home", 42, theme)).toBe(0);
    expect(nextPaletteIndex(20, "End", 42, theme)).toBe(41);
  });

  it("does not escape a palette edge or consume unrelated keys", () => {
    expect(nextPaletteIndex(0, "ArrowLeft", 42, theme)).toBe(0);
    expect(nextPaletteIndex(0, "Tab", 42, theme)).toBeNull();
  });
});
