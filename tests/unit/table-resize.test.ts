import { describe, expect, it } from "vitest";
import {
  pointerResizeValue,
  tableResizeKeyboardDelta,
  tableResizeLabel,
} from "../../src/editor/tableResize";

describe("table resize handles", () => {
  it("uses localized accessible labels", () => {
    expect(tableResizeLabel("row", "fr")).toBe("Redimensionner la ligne");
    expect(tableResizeLabel("column", "en")).toBe("Resize column");
  });

  it("supports keyboard resizing with the accelerated modifier", () => {
    expect(tableResizeKeyboardDelta("row", "ArrowDown", false)).toBe(2);
    expect(tableResizeKeyboardDelta("row", "ArrowUp", true)).toBe(-10);
    expect(tableResizeKeyboardDelta("column", "ArrowRight", false)).toBe(2);
    expect(tableResizeKeyboardDelta("column", "ArrowLeft", true)).toBe(-10);
    expect(tableResizeKeyboardDelta("column", "ArrowDown", false)).toBeNull();
  });

  it("uses pointer coordinates equally for mouse and touch pointer streams", () => {
    expect(pointerResizeValue("column", 120, 300, 336, 999)).toBe(156);
    expect(pointerResizeValue("row", 40, 200, 999, 225)).toBe(65);
    expect(pointerResizeValue("column", 120, 300, 336, 999, 0.8)).toBe(165);
  });
});
