import { describe, expect, it } from "vitest";
import { createPdfPatch } from "../../src/pdf-editor/pdfEditorModel";
import {
  applyOptimisticPagePatch,
  createPdfPageOrder,
  duplicatePageSelector,
  insertPageSelector,
  logicalPageWindow,
  pageSelector,
  remapInspectedPage,
} from "../../src/pdf-editor/pdfPageModel";
import { previewPdfPage } from "../../src/lib/api/previewPdfFixtures";

describe("pdf logical page model", () => {
  it("keeps the same page identity while inserting and moving around it", () => {
    let pages = createPdfPageOrder(2);
    const insert = createPdfPatch("insertPage", 1, insertPageSelector("blank-a"), {
      widthPoints: 595,
      heightPoints: 842,
    });
    let update = applyOptimisticPagePatch(pages, 1, insert);
    pages = update.pages;
    expect(update.activePage).toBe(1);
    expect(pages.map((page) => page.pageId)).toEqual(["blank-a", "p1", "p2"]);

    const move = createPdfPatch("movePage", 3, pageSelector("p2"), {
      targetPageNumber: 1,
    });
    update = applyOptimisticPagePatch(pages, 3, move);
    expect(update.activePage).toBe(1);
    expect(update.pages.map((page) => page.pageId)).toEqual(["p2", "blank-a", "p1"]);
  });

  it("gives a duplicated page and its objects independent stable identities", () => {
    const pages = createPdfPageOrder(2);
    const duplicate = createPdfPatch(
      "duplicatePage",
      1,
      duplicatePageSelector("p1", "copy-a"),
      { targetPageNumber: 2 },
    );
    const update = applyOptimisticPagePatch(pages, 1, duplicate);
    const source = remapInspectedPage(previewPdfPage(1), update.pages[0], 1);
    const copy = remapInspectedPage(previewPdfPage(1), update.pages[1], 2);
    expect(update.activePage).toBe(2);
    expect(source.objects[0]?.objectId).toBe("p1-o0");
    expect(copy.objects[0]?.objectId).toBe("copy-a-o0");
  });

  it("selects the nearest surviving page after a deletion", () => {
    const pages = createPdfPageOrder(3);
    const remove = createPdfPatch("deletePage", 3, pageSelector("p3"));
    const update = applyOptimisticPagePatch(pages, 3, remove);
    expect(update.activePage).toBe(2);
    expect(update.pages.map((page) => page.pageId)).toEqual(["p1", "p2"]);
    expect(logicalPageWindow(update.pages, update.activePage).map((entry) => entry.page.pageId))
      .toEqual(["p1", "p2"]);
  });

  it("updates rotation without changing the logical page id", () => {
    const pages = createPdfPageOrder(1);
    const rotate = createPdfPatch("rotatePage", 1, pageSelector("p1"), {
      rotationDegrees: 450,
    });
    const update = applyOptimisticPagePatch(pages, 1, rotate);
    expect(update.pages[0]).toMatchObject({ pageId: "p1", rotationDegrees: 90 });
  });
});
