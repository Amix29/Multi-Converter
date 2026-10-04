import { describe, expect, it } from "vitest";
import { clampEditorZoom, sliderToZoom, zoomToSlider } from "../../src/editor/editorZoom";

describe("document zoom", () => {
  it("places the default exactly in the middle while exposing both limits", () => {
    expect([0, 50, 100].map(sliderToZoom)).toEqual([10, 100, 500]);
    expect([10, 100, 500].map(zoomToSlider)).toEqual([0, 50, 100]);
  });
  it("keeps every allowed whole percentage reachable and ordered", () => {
    let previous = -1;
    for (let zoom = 10; zoom <= 500; zoom++) {
      const position = zoomToSlider(zoom);
      expect(position).toBeGreaterThan(previous);
      expect(sliderToZoom(position)).toBe(zoom);
      previous = position;
    }
  });
  it("clamps entered values and rejects nonfinite input", () => {
    expect(clampEditorZoom(-20)).toBe(10);
    expect(clampEditorZoom(700)).toBe(500);
    expect(clampEditorZoom(128.8)).toBe(129);
    expect(clampEditorZoom(Number.NaN)).toBe(100);
    expect(clampEditorZoom(Number.POSITIVE_INFINITY)).toBe(100);
  });
});
