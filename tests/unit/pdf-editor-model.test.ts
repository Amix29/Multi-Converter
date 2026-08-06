import { describe, expect, it } from "vitest";
import type { PdfObjectV1, PdfPermissionV1 } from "../../src/lib/api";
import {
  PREVIEW_PDF_SHA256,
  previewPdfEditableCopyResult,
} from "../../src/lib/api/previewPdfFixtures";
import {
  canApplyPdfPatch,
  canEditPdfObject,
  canTransformPdfObject,
  createPdfPatch,
  mergePdfPatch,
  pdfResizeMatrix,
  pdfOcrBlocksToPage,
  pdfRotationMatrix,
  pdfTopLeftBoundsToPage,
  transformPdfBounds,
  pdfWindowRange,
} from "../../src/pdf-editor/pdfEditorModel";

const editable: PdfPermissionV1 = {
  schemaVersion: 1,
  canModify: true,
  canAnnotate: true,
  canFillForms: true,
  canAssemble: true,
  docMdpLevel: null,
};

const object: PdfObjectV1 = {
  schemaVersion: 1,
  objectId: "p1-o2",
  kind: "image",
  bounds: { x: 10, y: 20, width: 100, height: 50 },
  editable: true,
  text: null,
  fontFamily: null,
  fontSizePoints: null,
  fillColor: null,
  strokeColor: null,
  rotationDegrees: 0,
  activeContent: false,
};

describe("pdf editor model", () => {
  it("keeps only the active page and its direct neighbours mounted", () => {
    expect(pdfWindowRange(1, 2_000)).toEqual({ start: 1, count: 2, activePage: 1 });
    expect(pdfWindowRange(1_000, 2_000)).toEqual({ start: 999, count: 3, activePage: 1_000 });
    expect(pdfWindowRange(2_000, 2_000)).toEqual({ start: 1_999, count: 2, activePage: 2_000 });
  });

  it("mirrors DocMDP permissions before a patch reaches the backend", () => {
    const levelThree = { ...editable, canModify: false, canAssemble: false, docMdpLevel: 3 };
    expect(canApplyPdfPatch(levelThree, "setText")).toBe(false);
    expect(canApplyPdfPatch(levelThree, "setAnnotationContents")).toBe(true);
    expect(canApplyPdfPatch(levelThree, "createAnnotation")).toBe(true);
    expect(canApplyPdfPatch(levelThree, "deleteAnnotation")).toBe(true);
    expect(canApplyPdfPatch(levelThree, "insertPage")).toBe(false);
    expect(canApplyPdfPatch(levelThree, "deletePage")).toBe(false);
    expect(canEditPdfObject(levelThree, object)).toBe(false);
    expect(canEditPdfObject(levelThree, { ...object, kind: "annotation:Text" })).toBe(true);
    expect(canEditPdfObject(levelThree, { ...object, kind: "form:Text" })).toBe(true);
    expect(canEditPdfObject(levelThree, { ...object, kind: "form:Checkbox" })).toBe(true);
    expect(canTransformPdfObject(levelThree, { ...object, kind: "form:Text" })).toBe(false);
    expect(canEditPdfObject(editable, { ...object, activeContent: true })).toBe(false);
  });

  it("replaces only the latest patch for the same property", () => {
    const first = createPdfPatch("setFillColor", 1, object.objectId, { color: "#112233" });
    const second = createPdfPatch("setFillColor", 1, object.objectId, { color: "#AABBCC" });
    const text = createPdfPatch("setText", 1, object.objectId, { text: "Bonjour" });
    expect(mergePdfPatch(mergePdfPatch([], first), second)).toEqual([second]);
    expect(mergePdfPatch([second], text)).toEqual([second, text]);
  });

  it("creates finite eight-handle transforms without an arbitrary maximum", () => {
    const matrix = pdfResizeMatrix("se", object.bounds, { xPoints: 400, yPoints: -20 }, true);
    expect(matrix.every(Number.isFinite)).toBe(true);
    expect(matrix[0]).toBeGreaterThan(1);
    expect(matrix[3]).toBe(matrix[0]);
  });

  it("resizes symmetrically around the centre while Alt is held", () => {
    const matrix = pdfResizeMatrix("se", object.bounds, { xPoints: 20, yPoints: -10 }, false, true);
    const resized = transformPdfBounds(object.bounds, matrix);
    expect(resized.x + resized.width / 2).toBeCloseTo(object.bounds.x + object.bounds.width / 2);
    expect(resized.y + resized.height / 2).toBeCloseTo(object.bounds.y + object.bounds.height / 2);
    expect(resized.width).toBeCloseTo(140);
    expect(resized.height).toBeCloseTo(70);
  });

  it("rotates an object around its own centre", () => {
    const rotated = transformPdfBounds(object.bounds, pdfRotationMatrix(object.bounds, 90));
    expect(rotated.x + rotated.width / 2).toBeCloseTo(object.bounds.x + object.bounds.width / 2);
    expect(rotated.y + rotated.height / 2).toBeCloseTo(object.bounds.y + object.bounds.height / 2);
    expect(rotated.width).toBeCloseTo(object.bounds.height);
    expect(rotated.height).toBeCloseTo(object.bounds.width);
  });

  it("keeps transforms and layer moves sequential while replacing form values", () => {
    const transformA = createPdfPatch("transformObject", 1, object.objectId, {
      matrix: [1, 0, 0, 1, 4, 0],
    });
    const transformB = createPdfPatch("transformObject", 1, object.objectId, {
      matrix: [1, 0, 0, 1, 0, 6],
    });
    const layer = createPdfPatch("moveObjectForward", 1, object.objectId);
    const formA = createPdfPatch("setFormValue", 1, "p1-form1", { text: "false" });
    const formB = createPdfPatch("setFormValue", 1, "p1-form1", { text: "true" });
    const patches = [transformA, transformB, layer, formA, formB].reduce(mergePdfPatch, []);
    expect(patches).toEqual([transformA, transformB, layer, formB]);
  });

  it("removes obsolete object changes when the object is deleted", () => {
    const fill = createPdfPatch("setFillColor", 1, object.objectId, { color: "#AABBCC" });
    const transform = createPdfPatch("transformObject", 1, object.objectId, {
      matrix: [1, 0, 0, 1, 12, 5],
    });
    const unrelated = createPdfPatch("setText", 1, "p1-o3", { text: "Conserver" });
    const remove = createPdfPatch("deleteObject", 1, object.objectId);
    expect(mergePdfPatch([fill, transform, unrelated], remove)).toEqual([unrelated, remove]);
  });

  it("constructs complete page, image and annotation patches", () => {
    const page = createPdfPatch("insertPage", 2, null, { widthPoints: 595, heightPoints: 842 });
    const image = createPdfPatch("insertImage", 2, null, {
      imagePath: "C:\\Images\\local.png",
      bounds: { x: 10, y: 20, width: 200, height: 100 },
    });
    const annotation = createPdfPatch("createAnnotation", 2, null, {
      annotationType: "freeText",
      text: "À vérifier",
      bounds: { x: 30, y: 40, width: 180, height: 60 },
    });
    expect(page).toMatchObject({ widthPoints: 595, heightPoints: 842, bounds: null });
    expect(image).toMatchObject({ imagePath: "C:\\Images\\local.png", objectId: null });
    expect(annotation).toMatchObject({ annotationType: "freeText", text: "À vérifier" });
    expect(annotation.ocrBlocks).toBeNull();
  });

  it("keeps structural and creation patches sequential and deletes annotation edits", () => {
    const insertA = createPdfPatch("insertPage", 2, null, { widthPoints: 595, heightPoints: 842 });
    const insertB = createPdfPatch("insertPage", 2, null, { widthPoints: 595, heightPoints: 842 });
    const annotationEdit = createPdfPatch("setAnnotationContents", 1, "p1-a1", { text: "Note" });
    const annotationDelete = createPdfPatch("deleteAnnotation", 1, "p1-a1");
    expect([insertA, insertB].reduce(mergePdfPatch, [])).toEqual([insertA, insertB]);
    expect(mergePdfPatch([annotationEdit], annotationDelete)).toEqual([annotationDelete]);
  });

  it("maps OCR pixel boxes into PDF points and ignores blank blocks", () => {
    const page = {
      schemaVersion: 1 as const,
      pageNumber: 1,
      widthPoints: 600,
      heightPoints: 800,
      rotationDegrees: 0,
      objects: [],
    };
    const blocks = pdfOcrBlocksToPage(page, {
      pageNumber: 1,
      source: "ocr",
      width: 1_200,
      height: 1_600,
      text: "Bonjour",
      blocks: [
        { text: "Bonjour", confidence: 0.99, boundingBox: { x: 200, y: 300, width: 400, height: 80 } },
        { text: "   ", confidence: 0.1, boundingBox: { x: 0, y: 0, width: 10, height: 10 } },
      ],
      warnings: [],
    });
    expect(blocks).toEqual([{
      text: "Bonjour",
      bounds: { x: 100, y: 610, width: 200, height: 40 },
      fontSizePoints: null,
    }]);
  });

  it.each([
    [0, { x: 100, y: 610, width: 200, height: 40 }],
    [90, { x: 150, y: 100, width: 40, height: 200 }],
    [180, { x: 300, y: 150, width: 200, height: 40 }],
    [270, { x: 410, y: 500, width: 40, height: 200 }],
  ])("maps top-left OCR bounds through a %d degree PDF rotation", (rotationDegrees, expected) => {
    expect(pdfTopLeftBoundsToPage(
      { widthPoints: 600, heightPoints: 800, rotationDegrees },
      rotationDegrees === 90 || rotationDegrees === 270 ? 1_600 : 1_200,
      rotationDegrees === 90 || rotationDegrees === 270 ? 1_200 : 1_600,
      { x: 200, y: 300, width: 400, height: 80 },
    )).toEqual(expected);
  });

  it("rebases an unsigned editable-copy fixture without signatures or DocMDP", () => {
    const result = previewPdfEditableCopyResult(PREVIEW_PDF_SHA256, "b".repeat(64), 8);
    expect(result.sourceSha256).toBe(PREVIEW_PDF_SHA256);
    expect(result.removedSignatureStructures).toBeGreaterThan(0);
    expect(result.rebasedSession).toMatchObject({
      sourceSha256: "b".repeat(64),
      signatures: [],
      permissions: { canModify: true, docMdpLevel: null },
    });
  });
});
