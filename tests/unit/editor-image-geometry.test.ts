import { describe, expect, it } from "vitest";

import {
  finiteDocumentCoordinate,
  keyboardResizeDelta,
  resizeImage,
  resizeOffsetForLayout,
  safeDimension,
  safeImageZIndex,
  type ImageResizeHandle,
} from "../../src/editor/imageGeometry";

const start = { width: 200, height: 100 };
const plain = { altKey: false, shiftKey: false };

describe("Word-like image geometry", () => {
  it("offers all eight handles", () => {
    const handles: ImageResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    expect(handles).toHaveLength(8);
    for (const handle of handles) {
      const result = resizeImage(start, handle, { x: 12, y: 7 }, plain);
      expect(result.width).toBeGreaterThanOrEqual(12);
      expect(result.height).toBeGreaterThanOrEqual(12);
    }
  });

  it("keeps proportions on corners and Shift reverses that default", () => {
    expect(resizeImage(start, "se", { x: 40, y: 1 }, plain)).toEqual({
      width: 240, height: 120, translateX: 0, translateY: 0,
    });
    expect(resizeImage(start, "se", { x: 40, y: 10 }, { ...plain, shiftKey: true }))
      .toEqual({ width: 240, height: 110, translateX: 0, translateY: 0 });
  });

  it("resizes sides independently and Shift locks proportions", () => {
    expect(resizeImage(start, "e", { x: 40, y: 0 }, plain)).toEqual({
      width: 240, height: 100, translateX: 0, translateY: 0,
    });
    expect(resizeImage(start, "e", { x: 40, y: 0 }, { ...plain, shiftKey: true }))
      .toEqual({ width: 240, height: 120, translateX: 0, translateY: -10 });
  });

  it("uses Alt to resize from the centre", () => {
    expect(resizeImage(start, "se", { x: 20, y: 10 }, { ...plain, altKey: true }))
      .toEqual({ width: 240, height: 120, translateX: -20, translateY: -10 });
  });

  it("keeps the opposite edge anchored for north and west handles", () => {
    expect(resizeImage(start, "w", { x: -30, y: 0 }, plain)).toEqual({
      width: 230, height: 100, translateX: -30, translateY: 0,
    });
    expect(resizeImage(start, "n", { x: 0, y: -20 }, plain)).toEqual({
      width: 200, height: 120, translateX: 0, translateY: -20,
    });
    expect(resizeImage(start, "nw", { x: -40, y: -10 }, plain)).toEqual({
      width: 240, height: 120, translateX: -40, translateY: -20,
    });
  });

  it("compensates flow alignment without double-moving the frame", () => {
    const result = resizeImage(start, "w", { x: -40, y: 0 }, plain);
    expect(resizeOffsetForLayout(start, result, "floating", "center")).toEqual({ x: -40, y: 0 });
    expect(resizeOffsetForLayout(start, result, "flow", "center")).toEqual({ x: -20, y: 0 });
    expect(resizeOffsetForLayout(start, result, "flow", "right")).toEqual({ x: 0, y: 0 });
  });

  it("supports keyboard handles and finite document safety bounds", () => {
    expect(keyboardResizeDelta("se", "ArrowRight", 10)).toEqual({ x: 10, y: 0 });
    expect(keyboardResizeDelta("n", "ArrowLeft", 10)).toBeNull();
    expect(finiteDocumentCoordinate(Number.POSITIVE_INFINITY, 7)).toBe(7);
    expect(finiteDocumentCoordinate(900_000)).toBe(100_000);
    expect(safeDimension(-4)).toBe(12);
    expect(safeDimension(900_000)).toBe(200_000);
    expect(safeImageZIndex(-10_000)).toBe(-100);
    expect(safeImageZIndex(10_000)).toBe(100);
  });
});
