import { describe, expect, it } from "vitest";

import {
  colorInputValue,
  editorFontFamilies,
  maximumFontSizePt,
  minimumFontSizePt,
  normalizeFontSizeInput,
  pointSizeValue,
} from "../../src/editor/editorFormatting";

describe("editor formatting values", () => {
  it("accepts free point sizes and French decimal commas", () => {
    expect(normalizeFontSizeInput("11")).toBe("11pt");
    expect(normalizeFontSizeInput(" 13,5 ")).toBe("13.5pt");
    expect(normalizeFontSizeInput("10.25")).toBe("10.25pt");
  });

  it("bounds font sizes to the supported document range", () => {
    expect(normalizeFontSizeInput("2")).toBe(`${minimumFontSizePt}pt`);
    expect(normalizeFontSizeInput("999")).toBe(`${maximumFontSizePt}pt`);
  });

  it.each(["", "large", "12.345", "12px", "-1"])(
    "rejects an invalid point size: %s",
    (value) => {
      expect(normalizeFontSizeInput(value)).toBeNull();
    },
  );

  it("reads a point size without exposing the CSS unit", () => {
    expect(pointSizeValue("13.5pt")).toBe("13.5");
    expect(pointSizeValue("16px", 12)).toBe("12");
    expect(pointSizeValue(undefined, 12)).toBe("12");
  });

  it("accepts only six-digit hexadecimal colors", () => {
    expect(colorInputValue("#c46f3a", "#111111")).toBe("#c46f3a");
    expect(colorInputValue("red", "#111111")).toBe("#111111");
    expect(colorInputValue(undefined, "#fff4bd")).toBe("#fff4bd");
  });

  it("offers bundled OFL families and a broad local system-font set", () => {
    expect(editorFontFamilies.length).toBeGreaterThanOrEqual(20);
    expect(editorFontFamilies.slice(0, 3)).toEqual([
      "Source Sans 3",
      "Atkinson Hyperlegible Next",
      "JetBrains Mono",
    ]);
    expect(editorFontFamilies).toContain("DejaVu Sans");
    expect(editorFontFamilies).toContain("Liberation Serif");
    expect(editorFontFamilies.every((font) => !/https?:|url\(/i.test(font))).toBe(true);
  });
});
