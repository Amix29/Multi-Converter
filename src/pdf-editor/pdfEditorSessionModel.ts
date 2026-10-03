import type {
  PdfEditPatchV1,
  PdfEditableCopyResultV1,
  PdfEditorSessionV1,
  PdfObjectV1,
  PdfPageV1,
  PdfSaveResultV1,
} from "../lib/api";
import type { PdfActiveContentFinding } from "./PdfInspector";
import { transformPdfBounds } from "./pdfEditorModel";

export function verifySaveResult(result: PdfSaveResultV1, expected: PdfEditorSessionV1) {
  if (result.sourceSha256 !== expected.sourceSha256
    || result.rebasedSession.sessionId !== expected.sessionId
    || result.rebasedSession.sourceSha256.length !== 64
    || result.signatureValidity !== "not-cryptographically-checked") {
    throw new Error("PDF_EDITOR_SOURCE_CHANGED:La copie ne correspond pas à la session.");
  }
}

export function verifyEditableCopyResult(result: PdfEditableCopyResultV1, expected: PdfEditorSessionV1) {
  if (result.sourceSha256 !== expected.sourceSha256
    || result.removedSignatureStructures < 1
    || result.rebasedSession.sessionId !== expected.sessionId
    || result.rebasedSession.sourceSha256.length !== 64
    || result.rebasedSession.signatures.length
    || result.rebasedSession.permissions.docMdpLevel !== null) {
    throw new Error("PDF_EDITOR_UNSIGNED_COPY_INVALID:La copie modifiable est incohérente.");
  }
}

export function mergeActiveContentFindings(
  current: PdfActiveContentFinding[],
  pages: PdfPageV1[],
) {
  const merged = new Map(current.map((finding) => [findingKey(finding), finding]));
  for (const page of pages) {
    for (const object of page.objects) {
      if (object.activeContent) {
        const finding = { pageNumber: page.pageNumber, object };
        merged.set(findingKey(finding), finding);
      }
    }
  }
  return Array.from(merged.values()).sort((left, right) => left.pageNumber - right.pageNumber
    || left.object.objectId.localeCompare(right.object.objectId));
}

export function optimisticPages(pages: PdfPageV1[], patch: PdfEditPatchV1) {
  return pages.map((page) => ({
    ...page,
    objects: page.objects.flatMap((object) => optimisticObject(object, patch)),
  })).map((page) => ({
    ...page,
    objects: reorderOptimisticObjects(page.objects, patch),
  }));
}

function optimisticObject(object: PdfObjectV1, patch: PdfEditPatchV1): PdfObjectV1[] {
  if (object.objectId !== patch.objectId) return [object];
  if (patch.operation === "deleteObject" || patch.operation === "deleteAnnotation") return [];
  if (["setText", "setAnnotationContents", "setFormValue"].includes(patch.operation)) {
    return [{ ...object, text: patch.text }];
  }
  if (patch.operation === "setFillColor") return [{ ...object, fillColor: patch.color }];
  if (patch.operation === "setStrokeColor") return [{ ...object, strokeColor: patch.color }];
  if (patch.operation === "transformObject" && patch.matrix) {
    return [{ ...object, bounds: transformPdfBounds(object.bounds, patch.matrix) }];
  }
  return [object];
}

function reorderOptimisticObjects(objects: PdfObjectV1[], patch: PdfEditPatchV1) {
  if (!["moveObjectForward", "moveObjectBackward", "bringObjectFront", "sendObjectBack"].includes(patch.operation)) {
    return objects;
  }
  const index = objects.findIndex((object) => object.objectId === patch.objectId);
  if (index < 0) return objects;
  const next = objects.slice();
  const [selected] = next.splice(index, 1);
  if (!selected) return objects;
  const target = patch.operation === "moveObjectForward"
    ? Math.min(objects.length - 1, index + 1)
    : patch.operation === "moveObjectBackward"
      ? Math.max(0, index - 1)
      : patch.operation === "bringObjectFront" ? objects.length - 1 : 0;
  next.splice(target, 0, selected);
  return next;
}

function findingKey(finding: PdfActiveContentFinding) {
  return `${finding.pageNumber}:${finding.object.objectId}`;
}

export function pdfError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^[A-Z][A-Z0-9_]+:/, "");
}
