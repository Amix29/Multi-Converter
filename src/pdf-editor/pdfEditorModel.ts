import type {
  PdfEditPatchV1,
  PdfObjectV1,
  OcrPageResultV1,
  PdfOcrTextBlockV1,
  PdfPageV1,
  PdfPermissionV1,
} from "../lib/api";
import type { TranslationKey } from "../i18n";

export type PdfPatchOperation =
  | "setText"
  | "transformObject"
  | "setFillColor"
  | "setStrokeColor"
  | "setAnnotationContents"
  | "setFormValue"
  | "moveObjectForward"
  | "moveObjectBackward"
  | "bringObjectFront"
  | "sendObjectBack"
  | "insertImage"
  | "replaceImage"
  | "insertPage"
  | "duplicatePage"
  | "movePage"
  | "createAnnotation"
  | "deleteAnnotation"
  | "addOcrTextLayer"
  | "rotatePage"
  | "deleteObject"
  | "deletePage";

export type PdfPatchValues = Partial<Omit<
  PdfEditPatchV1,
  "schemaVersion" | "operation" | "pageNumber" | "objectId"
>>;

export type PdfResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface PdfGestureDelta {
  xPoints: number;
  yPoints: number;
}

export function pdfWindowRange(activePage: number, pageCount: number, radius = 1) {
  const safeCount = Math.max(1, Math.floor(pageCount));
  const page = clampPage(activePage, safeCount);
  const start = Math.max(1, page - Math.max(0, radius));
  const end = Math.min(safeCount, page + Math.max(0, radius));
  return { start, count: end - start + 1, activePage: page };
}

export function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(1, Math.floor(page || 1)), Math.max(1, pageCount));
}

export function canApplyPdfPatch(
  permissions: PdfPermissionV1,
  operation: PdfPatchOperation,
) {
  if (["setAnnotationContents", "createAnnotation", "deleteAnnotation"].includes(operation)) {
    return permissions.canAnnotate;
  }
  if (operation === "setFormValue") return permissions.canFillForms;
  if (["rotatePage", "deletePage", "insertPage", "duplicatePage", "movePage"].includes(operation)) {
    return permissions.canAssemble;
  }
  return permissions.canModify;
}

export function canEditPdfObject(
  permissions: PdfPermissionV1,
  object: PdfObjectV1,
) {
  if (!object.editable || object.activeContent) return false;
  if (object.kind.startsWith("annotation:")) return permissions.canAnnotate;
  if (object.kind.startsWith("form:")) return permissions.canFillForms;
  return permissions.canModify;
}

export function canTransformPdfObject(
  permissions: PdfPermissionV1,
  object: PdfObjectV1,
) {
  return object.editable
    && !object.activeContent
    && ["text", "path", "image"].includes(object.kind)
    && permissions.canModify;
}

export function createPdfPatch(
  operation: PdfPatchOperation,
  pageNumber: number,
  objectId?: string | null,
  values: PdfPatchValues = {},
): PdfEditPatchV1 {
  return {
    schemaVersion: 1,
    operation,
    pageNumber,
    objectId: objectId ?? null,
    text: values.text ?? null,
    matrix: values.matrix ?? null,
    color: values.color ?? null,
    rotationDegrees: values.rotationDegrees ?? null,
    bounds: values.bounds ?? null,
    imagePath: values.imagePath ?? null,
    annotationType: values.annotationType ?? null,
    targetPageNumber: values.targetPageNumber ?? null,
    widthPoints: values.widthPoints ?? null,
    heightPoints: values.heightPoints ?? null,
    ocrBlocks: values.ocrBlocks ?? null,
  };
}

export function mergePdfPatch(
  patches: PdfEditPatchV1[],
  next: PdfEditPatchV1,
) {
  if (next.operation === "deletePage") {
    // Page numbers are mutable after insert/move operations. Preserve the
    // preceding transaction and let the backend resolve the stable selector.
    return [...patches, next];
  }
  if (next.operation === "deleteObject" || next.operation === "deleteAnnotation") {
    return [
      ...patches.filter((patch) => patch.objectId !== next.objectId),
      next,
    ];
  }
  if (isSequentialOperation(next.operation)) return [...patches, next];
  const identity = patchIdentity(next);
  const index = patches.findIndex((patch) => patchIdentity(patch) === identity);
  if (index < 0) return [...patches, next];
  const updated = patches.slice();
  updated[index] = next;
  return updated;
}

function isSequentialOperation(operation: string) {
  return [
    "transformObject",
    "moveObjectForward",
    "moveObjectBackward",
    "bringObjectFront",
    "sendObjectBack",
    "insertImage",
    "insertPage",
    "duplicatePage",
    "movePage",
    "createAnnotation",
    "addOcrTextLayer",
  ].includes(operation);
}

function patchIdentity(patch: PdfEditPatchV1) {
  return `${patch.pageNumber}:${patch.objectId ?? "page"}:${patch.operation}`;
}

export function normalizePdfHex(value: string | null | undefined, fallback = "#191919") {
  const source = value?.trim().toUpperCase();
  if (source && /^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/.test(source)) {
    return source.slice(0, 7);
  }
  return fallback;
}

export function pdfObjectLabelKey(kind: string): TranslationKey {
  if (kind === "text") return "pdfEditor.objectText";
  if (kind === "image") return "pdfEditor.objectImage";
  if (kind === "path") return "pdfEditor.objectPath";
  if (kind === "shading") return "pdfEditor.objectShading";
  if (kind === "xObjectForm") return "pdfEditor.objectComposite";
  if (kind.startsWith("form:")) return "pdfEditor.objectForm";
  if (kind.startsWith("annotation:")) return "pdfEditor.objectAnnotation";
  return "pdfEditor.objectUnsupported";
}

export function pdfMoveMatrix(delta: PdfGestureDelta): [number, number, number, number, number, number] {
  return [1, 0, 0, 1, delta.xPoints, delta.yPoints];
}

export function pdfRotationMatrix(
  bounds: PdfObjectV1["bounds"],
  degrees: number,
): [number, number, number, number, number, number] {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return [
    cosine,
    sine,
    -sine,
    cosine,
    centerX - cosine * centerX + sine * centerY,
    centerY - sine * centerX - cosine * centerY,
  ];
}

export function pdfResizeMatrix(
  handle: PdfResizeHandle,
  bounds: PdfObjectV1["bounds"],
  delta: PdfGestureDelta,
  preserveAspect: boolean,
  fromCenter = false,
): [number, number, number, number, number, number] {
  const minimum = 4;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  let left = bounds.x;
  let right = bounds.x + bounds.width;
  let bottom = bounds.y;
  let top = bounds.y + bounds.height;
  if (handle.includes("w")) {
    left = Math.min((fromCenter ? centerX : right) - minimum / (fromCenter ? 2 : 1), left + delta.xPoints);
    if (fromCenter) right = 2 * centerX - left;
  }
  if (handle.includes("e")) {
    right = Math.max((fromCenter ? centerX : left) + minimum / (fromCenter ? 2 : 1), right + delta.xPoints);
    if (fromCenter) left = 2 * centerX - right;
  }
  if (handle.includes("s")) {
    bottom = Math.min((fromCenter ? centerY : top) - minimum / (fromCenter ? 2 : 1), bottom + delta.yPoints);
    if (fromCenter) top = 2 * centerY - bottom;
  }
  if (handle.includes("n")) {
    top = Math.max((fromCenter ? centerY : bottom) + minimum / (fromCenter ? 2 : 1), top + delta.yPoints);
    if (fromCenter) bottom = 2 * centerY - top;
  }

  let width = Math.max(minimum, right - left);
  let height = Math.max(minimum, top - bottom);
  if (preserveAspect && handle.length === 2) {
    // Project the pointer movement onto the object's aspect-ratio diagonal.
    // Taking the largest axis made thin text objects jump dramatically when
    // the pointer moved only a few pixels vertically.
    const widthSquared = bounds.width * bounds.width;
    const heightSquared = bounds.height * bounds.height;
    const projectedScale = (width * bounds.width + height * bounds.height)
      / Math.max(1, widthSquared + heightSquared);
    const minimumScale = Math.max(
      minimum / Math.max(minimum, bounds.width),
      minimum / Math.max(minimum, bounds.height),
    );
    const scale = Math.max(minimumScale, projectedScale);
    width = Math.max(minimum, bounds.width * scale);
    height = Math.max(minimum, bounds.height * scale);
    if (fromCenter) {
      left = centerX - width / 2;
      right = centerX + width / 2;
      bottom = centerY - height / 2;
      top = centerY + height / 2;
    } else {
      if (handle.includes("w")) left = right - width;
      else right = left + width;
      if (handle.includes("s")) bottom = top - height;
      else top = bottom + height;
    }
  }

  const scaleX = width / Math.max(minimum, bounds.width);
  const scaleY = height / Math.max(minimum, bounds.height);
  const translateX = left - bounds.x * scaleX;
  const translateY = bottom - bounds.y * scaleY;
  return [scaleX, 0, 0, scaleY, translateX, translateY];
}

export function transformPdfBounds(
  bounds: PdfObjectV1["bounds"],
  matrix: [number, number, number, number, number, number],
) {
  const [a, b, c, d, e, f] = matrix;
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ].map(([x, y]) => ({ x: a * x + c * y + e, y: b * x + d * y + f }));
  const x = Math.min(...corners.map((point) => point.x));
  const y = Math.min(...corners.map((point) => point.y));
  const right = Math.max(...corners.map((point) => point.x));
  const top = Math.max(...corners.map((point) => point.y));
  return { x, y, width: right - x, height: top - y };
}

export function pdfOcrBlocksToPage(
  page: PdfPageV1,
  result: OcrPageResultV1 | undefined,
): PdfOcrTextBlockV1[] {
  if (!result) return [];
  return result.blocks.filter((block) => block.text.trim()).map((block) => ({
    text: block.text,
    bounds: pdfTopLeftBoundsToPage(
      page,
      result.width,
      result.height,
      block.boundingBox,
    ),
    fontSizePoints: null,
  }));
}

/** Converts OCR pixels from the rendered page's top-left origin into the
 * unrotated PDF page's bottom-left coordinate system. */
export function pdfTopLeftBoundsToPage(
  page: Pick<PdfPageV1, "widthPoints" | "heightPoints" | "rotationDegrees">,
  renderedWidth: number,
  renderedHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const rotation = ((page.rotationDegrees % 360) + 360) % 360;
  const rotated = rotation === 90 || rotation === 270;
  const displayWidth = rotated ? page.heightPoints : page.widthPoints;
  const displayHeight = rotated ? page.widthPoints : page.heightPoints;
  const left = bounds.x * displayWidth / Math.max(1, renderedWidth);
  const right = (bounds.x + bounds.width) * displayWidth / Math.max(1, renderedWidth);
  const top = bounds.y * displayHeight / Math.max(1, renderedHeight);
  const bottom = (bounds.y + bounds.height) * displayHeight / Math.max(1, renderedHeight);
  const corners = [
    displayPointToPdf(page, rotation, left, top),
    displayPointToPdf(page, rotation, right, top),
    displayPointToPdf(page, rotation, left, bottom),
    displayPointToPdf(page, rotation, right, bottom),
  ];
  const x = Math.min(...corners.map((point) => point.x));
  const y = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  return { x, y, width: maxX - x, height: maxY - y };
}

function displayPointToPdf(
  page: Pick<PdfPageV1, "widthPoints" | "heightPoints">,
  rotation: number,
  x: number,
  y: number,
) {
  if (rotation === 90) return { x: y, y: x };
  if (rotation === 180) return { x: page.widthPoints - x, y };
  if (rotation === 270) {
    return { x: page.widthPoints - y, y: page.heightPoints - x };
  }
  return { x, y: page.heightPoints - y };
}
