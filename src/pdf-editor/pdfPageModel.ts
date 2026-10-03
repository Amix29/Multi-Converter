import type { PdfEditPatchV1, PdfObjectV1, PdfPageV1 } from "../lib/api";

export interface PdfLogicalPage {
  pageId: string;
  sourcePageNumber: number | null;
  widthPoints: number;
  heightPoints: number;
  rotationDegrees: number | null;
}

export interface PdfPageOrderUpdate {
  pages: PdfLogicalPage[];
  activePage: number;
}

const DEFAULT_WIDTH = 595;
const DEFAULT_HEIGHT = 842;

export function createPdfPageOrder(pageCount: number): PdfLogicalPage[] {
  return Array.from({ length: Math.max(1, pageCount) }, (_, index) => ({
    pageId: `p${index + 1}`,
    sourcePageNumber: index + 1,
    widthPoints: DEFAULT_WIDTH,
    heightPoints: DEFAULT_HEIGHT,
    rotationDegrees: null,
  }));
}

export function pageSelector(pageId: string) {
  return `page=${pageId}`;
}

export function insertPageSelector(pageId: string) {
  return `insert=${pageId}`;
}

export function duplicatePageSelector(sourcePageId: string, copyPageId: string) {
  return `duplicate=${sourcePageId}|${copyPageId}`;
}

export function pageIdFromSelector(selector: string | null) {
  if (!selector) return null;
  const page = selector.match(/^page=([A-Za-z0-9_-]+)$/)?.[1];
  if (page) return page;
  const insert = selector.match(/^insert=([A-Za-z0-9_-]+)$/)?.[1];
  if (insert) return insert;
  return selector.match(/^duplicate=[A-Za-z0-9_-]+\|([A-Za-z0-9_-]+)$/)?.[1] ?? null;
}

export function logicalPageWindow(
  pages: PdfLogicalPage[],
  activePage: number,
  radius = 1,
) {
  const active = Math.min(Math.max(1, activePage), pages.length);
  const start = Math.max(1, active - Math.max(0, radius));
  const end = Math.min(pages.length, active + Math.max(0, radius));
  return pages.slice(start - 1, end).map((page, index) => ({
    page,
    pageNumber: start + index,
  }));
}

export function remapInspectedPage(
  source: PdfPageV1,
  logical: PdfLogicalPage,
  pageNumber: number,
): PdfPageV1 {
  return {
    ...source,
    pageNumber,
    rotationDegrees: logical.rotationDegrees ?? source.rotationDegrees,
    objects: source.objects.map((object) => remapObject(object, logical.pageId)),
  };
}

export function blankLogicalPage(logical: PdfLogicalPage, pageNumber: number): PdfPageV1 {
  return {
    schemaVersion: 1,
    pageNumber,
    widthPoints: logical.widthPoints,
    heightPoints: logical.heightPoints,
    rotationDegrees: logical.rotationDegrees ?? 0,
    objects: [],
  };
}

export function hydrateLogicalPage(
  pages: PdfLogicalPage[],
  pageId: string,
  inspected: PdfPageV1,
) {
  return pages.map((page) => page.pageId !== pageId ? page : {
    ...page,
    widthPoints: inspected.widthPoints,
    heightPoints: inspected.heightPoints,
    rotationDegrees: page.rotationDegrees ?? inspected.rotationDegrees,
  });
}

export function applyOptimisticPagePatch(
  pages: PdfLogicalPage[],
  activePage: number,
  patch: PdfEditPatchV1,
): PdfPageOrderUpdate {
  const currentIndex = Math.min(Math.max(0, activePage - 1), pages.length - 1);
  const current = pages[currentIndex];
  if (!current) return { pages, activePage: 1 };
  const next = pages.slice();

  if (patch.operation === "insertPage") {
    const pageId = pageIdFromSelector(patch.objectId);
    if (!pageId) return { pages, activePage };
    next.splice(currentIndex, 0, {
      pageId,
      sourcePageNumber: null,
      widthPoints: patch.widthPoints ?? current.widthPoints,
      heightPoints: patch.heightPoints ?? current.heightPoints,
      rotationDegrees: 0,
    });
    return { pages: next, activePage: currentIndex + 1 };
  }

  if (patch.operation === "duplicatePage") {
    const pageId = pageIdFromSelector(patch.objectId);
    if (!pageId) return { pages, activePage };
    const target = Math.min(Math.max(0, (patch.targetPageNumber ?? activePage + 1) - 1), next.length);
    next.splice(target, 0, { ...current, pageId });
    return { pages: next, activePage: target + 1 };
  }

  if (patch.operation === "movePage") {
    const target = Math.min(Math.max(0, (patch.targetPageNumber ?? activePage) - 1), next.length - 1);
    const [moved] = next.splice(currentIndex, 1);
    if (moved) next.splice(target, 0, moved);
    return { pages: next, activePage: target + 1 };
  }

  if (patch.operation === "deletePage" && next.length > 1) {
    next.splice(currentIndex, 1);
    return { pages: next, activePage: Math.min(currentIndex + 1, next.length) };
  }

  if (patch.operation === "rotatePage") {
    next[currentIndex] = {
      ...current,
      rotationDegrees: normalizeRotation(patch.rotationDegrees ?? current.rotationDegrees ?? 0),
    };
    return { pages: next, activePage };
  }

  return { pages, activePage };
}

function remapObject(object: PdfObjectV1, pageId: string): PdfObjectV1 {
  return {
    ...object,
    objectId: object.objectId.replace(/^p\d+(?=-[oa]\d+$)/, pageId),
  };
}

function normalizeRotation(value: number) {
  return ((Math.round(value / 90) * 90) % 360 + 360) % 360;
}
