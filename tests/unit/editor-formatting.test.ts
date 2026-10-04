import { describe, expect, it } from "vitest";

import {
  colorInputValue,
  fontSizeSuggestions,
  lineHeightSuggestions,
  lineHeightValue,
  maximumFontSizePt,
  maximumLineHeight,
  minimumFontSizePt,
  minimumLineHeight,
  normalizeFontSizeInput,
  normalizeLineHeightInput,
  normalizedHexColor,
  orderedFontCatalog,
  pointSizeValue,
  rememberRecentFont,
} from "../../src/editor/editorFormatting";

describe("editor formatting values", () => {
  it("accepts free point sizes and French decimal commas", () => {
    expect(normalizeFontSizeInput("11")).toBe("11pt");
    expect(normalizeFontSizeInput(" 13,5 ")).toBe("13.5pt");
    expect(normalizeFontSizeInput("10.25")).toBe("10.25pt");
  });

  it("bounds font sizes to the supported document range", () => {
    expect(normalizeFontSizeInput("0.2")).toBe(`${minimumFontSizePt}pt`);
    expect(normalizeFontSizeInput("2")).toBe("2pt");
    expect(normalizeFontSizeInput("999")).toBe(`${maximumFontSizePt}pt`);
  });

  it("keeps the compact Word-like point-size shortcuts", () => {
    expect(fontSizeSuggestions).toEqual([8, 9, 10, 11, 12, 14, 16, 18, 24, 32, 48, 72]);
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

  it("normalizes shorthand colors and keeps hexadecimal as the public value", () => {
    expect(normalizedHexColor("#C73")).toBe("#cc7733");
    expect(normalizedHexColor("rgb(1, 2, 3)")).toBeNull();
  });

  it("supports automatic, preset and custom paragraph line height", () => {
    expect(lineHeightSuggestions).toEqual(["1", "1.15", "1.45", "1.5", "2", "2.5", "3"]);
    expect(normalizeLineHeightInput("auto")).toBe("auto");
    expect(normalizeLineHeightInput("1,37")).toBe("1.37");
    expect(normalizeLineHeightInput("0.1")).toBe(String(minimumLineHeight));
    expect(normalizeLineHeightInput("9")).toBe(String(maximumLineHeight));
    expect(lineHeightValue("normal")).toBe("1.45");
    expect(lineHeightValue("auto")).toBe("1.45");
    expect(lineHeightValue(undefined)).toBe("1.45");
  });

  it("orders the native font catalogue as default, recent, then alphabetic", () => {
    const catalog = orderedFontCatalog(
      "Segoe UI",
      ["Verdana", "Arial", "Missing", "Consolas"],
      ["Verdana", "Segoe UI", "consolas", "Arial", "ARIAL"],
    );
    expect(catalog.defaultFont).toBe("Segoe UI");
    expect(catalog.recentFonts).toEqual(["Verdana", "Arial", "Consolas"]);
    expect(catalog.allFonts).toEqual(["Arial", "consolas", "Segoe UI", "Verdana"]);
  });

  it("remembers at most three valid installed-family names without paths", () => {
    expect(rememberRecentFont("Georgia", ["Arial", "Verdana", "Tahoma"], "Segoe UI"))
      .toEqual(["Georgia", "Arial", "Verdana"]);
    expect(rememberRecentFont("Segoe UI", ["Arial", "Verdana"], "Segoe UI"))
      .toEqual(["Arial", "Verdana"]);
    expect(rememberRecentFont("bad\u0000font", ["Arial"], "Segoe UI")).toEqual(["Arial"]);
  });
});
