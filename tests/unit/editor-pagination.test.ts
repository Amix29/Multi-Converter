import { describe, expect, it } from "vitest";

import { planPageBreaks } from "../../src/editor/pagination";

describe("planPageBreaks", () => {
  it("keeps an empty document on one page", () => {
    expect(planPageBreaks([], 100)).toEqual({ breakPositions: [], pageCount: 1 });
  });

  it("starts a new page before a block that would overflow", () => {
    expect(
      planPageBreaks(
        [
          { pos: 1, height: 60 },
          { pos: 10, height: 50 },
          { pos: 20, height: 20 },
        ],
        100,
      ),
    ).toEqual({ breakPositions: [10], pageCount: 2 });
  });

  it("honors a forced break after content", () => {
    expect(
      planPageBreaks(
        [
          { pos: 1, height: 20 },
          { pos: 5, height: 20, forceBefore: true },
        ],
        100,
      ),
    ).toEqual({ breakPositions: [5], pageCount: 2 });
  });

  it("does not create an empty page for a forced first block", () => {
    expect(planPageBreaks([{ pos: 1, height: 20, forceBefore: true }], 100)).toEqual({
      breakPositions: [],
      pageCount: 1,
    });
  });

  it("counts every page occupied by an oversized block", () => {
    expect(planPageBreaks([{ pos: 1, height: 250 }], 100)).toEqual({
      breakPositions: [],
      pageCount: 3,
    });
  });

  it("treats negative block heights as zero", () => {
    expect(
      planPageBreaks(
        [
          { pos: 1, height: -20 },
          { pos: 10, height: 100 },
        ],
        100,
      ),
    ).toEqual({ breakPositions: [], pageCount: 1 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to one page for an invalid usable height: %s",
    (usableHeight) => {
      expect(planPageBreaks([{ pos: 1, height: 250 }], usableHeight)).toEqual({
        breakPositions: [],
        pageCount: 1,
      });
    },
  );
});
