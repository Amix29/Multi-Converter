import type {
  OcrDocumentResultV1,
  PdfEditableCopyResultV1,
  PdfDigitizeResultV1,
  PdfEditorSessionV1,
  PdfPageV1,
  PdfPermissionV1,
  PdfSaveResultV1,
  PdfSignatureInfoV1,
} from "./contracts";
import { PREVIEW_ROOT } from "./previewFixtures";

export const PREVIEW_PDF_SHA256 = "95a5903c0388cad29cc45c7a8d27be17c790ed946df8102d2df51d9d120a5c03";

export function previewPdfPermissions(docMdp: string | null): PdfPermissionV1 {
  const level = Number(docMdp) || null;
  return {
    schemaVersion: 1,
    canModify: level === null,
    canAnnotate: level === null || level === 3,
    canFillForms: level === null || level === 2 || level === 3,
    canAssemble: level === null,
    docMdpLevel: level,
  };
}

function previewPdfSignatures(docMdp: string | null): PdfSignatureInfoV1[] {
  if (docMdp === null) return [];
  return [{
    schemaVersion: 1,
    index: 0,
    docMdpLevel: Number(docMdp) || 1,
    reason: "Approbation locale",
    signingDate: "2026-08-06T10:00:00Z",
  }];
}

export function previewPdfSession(
  sourceName: string,
  sourceSha256: string,
  pageCount: number,
  docMdp: string | null,
  contentKind: PdfEditorSessionV1["contentKind"] = "digital",
): PdfEditorSessionV1 {
  return {
    schemaVersion: 1,
    sessionId: "preview-pdf-session",
    sourceSha256,
    sourceName,
    pageCount,
    contentKind,
    permissions: previewPdfPermissions(docMdp),
    signatures: previewPdfSignatures(docMdp),
    activeContentPolicy: "preserve-without-execution",
  };
}

export function previewPdfSaveResult(
  sourceSha256: string,
  rebasedSha256: string,
  pageCount: number,
  appliedPatches: number,
  docMdp: string | null,
  contentKind: PdfEditorSessionV1["contentKind"] = "digital",
): PdfSaveResultV1 {
  return {
    schemaVersion: 1,
    sourceSha256,
    destinationPath: `${PREVIEW_ROOT}\\Documents\\Contrat-local-modifie.pdf`,
    appliedPatches,
    hadExistingSignatures: docMdp !== null,
    signatureValidity: "not-cryptographically-checked",
    rebasedSession: previewPdfSession("Contrat-local-modifie.pdf", rebasedSha256, pageCount, docMdp, contentKind),
  };
}

export function previewPdfEditableCopyResult(
  sourceSha256: string,
  rebasedSha256: string,
  pageCount: number,
): PdfEditableCopyResultV1 {
  return {
    schemaVersion: 1,
    sourceSha256,
    destinationPath: `${PREVIEW_ROOT}\\Documents\\Contrat-local-copie-modifiable.pdf`,
    removedSignatureStructures: 2,
    rebasedSession: previewPdfSession("Contrat-local-copie-modifiable.pdf", rebasedSha256, pageCount, null),
  };
}

export function previewPdfDigitizeResult(
  sourceSha256: string,
  rebasedSha256: string,
  pageCount: number,
  recognizedPages: number,
): PdfDigitizeResultV1 {
  return {
    schemaVersion: 1,
    sourceSha256,
    attemptedPages: pageCount,
    recognizedPages,
    rebasedSession: previewPdfSession(
      "Contrat-local.pdf",
      rebasedSha256,
      pageCount,
      null,
      "digitized",
    ),
  };
}

export function previewPdfPage(pageNumber: number, scanned = false): PdfPageV1 {
  if (scanned) {
    return {
      schemaVersion: 1,
      pageNumber,
      widthPoints: 595,
      heightPoints: 842,
      rotationDegrees: 0,
      objects: [{
        schemaVersion: 1,
        objectId: `p${pageNumber}-o0`,
        kind: "image",
        bounds: { x: 0, y: 0, width: 595, height: 842 },
        editable: true,
        text: null,
        fontFamily: null,
        fontSizePoints: null,
        fillColor: null,
        strokeColor: null,
        rotationDegrees: 0,
        activeContent: false,
      }],
    };
  }
  const objects: PdfPageV1["objects"] = [{
    schemaVersion: 1,
    objectId: `p${pageNumber}-o0`,
    kind: "text",
    bounds: { x: 70, y: 690, width: 340, height: 54 },
    editable: true,
    text: `Page ${pageNumber} — document local`,
    fontFamily: "Arial",
    fontSizePoints: 22,
    fillColor: "#191919",
    strokeColor: null,
    rotationDegrees: 0,
    activeContent: false,
  }, {
    schemaVersion: 1,
    objectId: `p${pageNumber}-o1`,
    kind: "image",
    bounds: { x: 70, y: 370, width: 220, height: 180 },
    editable: true,
    text: null,
    fontFamily: null,
    fontSizePoints: null,
    fillColor: null,
    strokeColor: null,
    rotationDegrees: 0,
    activeContent: false,
  }, {
    schemaVersion: 1,
    objectId: `p${pageNumber}-a0`,
    kind: "annotation:Text",
    bounds: { x: 430, y: 700, width: 26, height: 26 },
    editable: true,
    text: "Annotation locale",
    fontFamily: null,
    fontSizePoints: null,
    fillColor: null,
    strokeColor: null,
    rotationDegrees: 0,
    activeContent: false,
  }, {
    schemaVersion: 1,
    objectId: `p${pageNumber}-a1`,
    kind: "form:Checkbox",
    bounds: { x: 70, y: 310, width: 18, height: 18 },
    editable: true,
    text: "false",
    fontFamily: null,
    fontSizePoints: null,
    fillColor: null,
    strokeColor: null,
    rotationDegrees: 0,
    activeContent: false,
  }, {
    schemaVersion: 1,
    objectId: `p${pageNumber}-a2`,
    kind: "form:RadioButton",
    bounds: { x: 118, y: 310, width: 18, height: 18 },
    editable: true,
    text: "false",
    fontFamily: null,
    fontSizePoints: null,
    fillColor: null,
    strokeColor: null,
    rotationDegrees: 0,
    activeContent: false,
  }];
  if (pageNumber === 2) {
    objects.push({
      schemaVersion: 1,
      objectId: "p2-a3",
      kind: "annotation:RichMedia",
      bounds: { x: 455, y: 700, width: 26, height: 26 },
      editable: false,
      text: null,
      fontFamily: null,
      fontSizePoints: null,
      fillColor: null,
      strokeColor: null,
      rotationDegrees: 0,
      activeContent: true,
    });
  }
  return {
    schemaVersion: 1,
    pageNumber,
    widthPoints: 595,
    heightPoints: 842,
    rotationDegrees: 0,
    objects,
  };
}

export function previewPdfSvg(pageNumber: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842" viewBox="0 0 595 842"><rect width="595" height="842" fill="#fff"/><rect x="46" y="42" width="503" height="758" rx="3" fill="none" stroke="#e4e0d7"/><text x="70" y="135" font-family="Arial,sans-serif" font-size="22" fill="#191919">Page ${pageNumber} — document local</text><path d="M70 165h390M70 180h330M70 195h370" stroke="#b9b4aa" stroke-width="5"/><rect x="70" y="292" width="220" height="180" rx="8" fill="#f1eee8"/><circle cx="180" cy="382" r="52" fill="#c8734f" opacity=".82"/><rect x="70" y="514" width="18" height="18" fill="#fff" stroke="#777"/><text x="102" y="529" font-family="Arial,sans-serif" font-size="14" fill="#494640">Champ local</text></svg>`;
}

export function previewPdfOcrResult(pageNumber: number, jobId: string): OcrDocumentResultV1 {
  const text = `Texte OCR de la page ${pageNumber}`;
  return {
    schemaVersion: 1,
    jobId,
    text,
    pages: [{
      pageNumber,
      source: "ocr",
      width: 2_480,
      height: 3_508,
      text,
      blocks: [{
        text,
        confidence: 0.98,
        boundingBox: { x: 292, y: 418, width: 1_480, height: 102 },
      }],
      warnings: [],
    }],
    warnings: [],
  };
}
