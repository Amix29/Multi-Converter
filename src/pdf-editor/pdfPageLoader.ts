import {
  api,
  type PdfEditorSessionV1,
  type PdfPageV1,
  type PdfRenderedPageV1,
} from "../lib/api";
import {
  blankLogicalPage,
  logicalPageWindow,
  remapInspectedPage,
  type PdfLogicalPage,
} from "./pdfPageModel";

export interface PdfBackgroundEntry {
  url: string;
  hash: string;
}

export interface LoadedPdfWindow {
  pages: PdfPageV1[];
  renders: Array<{ pageNumber: number; rendered: PdfRenderedPageV1 }>;
}

export async function loadPdfLogicalWindow(
  session: PdfEditorSessionV1,
  order: PdfLogicalPage[],
  activePage: number,
): Promise<LoadedPdfWindow> {
  const entries = logicalPageWindow(order, activePage);
  const loaded = await Promise.all(entries.map(async ({ page, pageNumber }) => {
    if (page.sourcePageNumber === null) {
      return { page: blankLogicalPage(page, pageNumber), rendered: null };
    }
    const [window, rendered] = await Promise.all([
      api.pdfEditorInspectPages(
        session.sessionId,
        session.sourceSha256,
        page.sourcePageNumber,
        1,
      ),
      api.pdfEditorRenderPage(
        session.sessionId,
        session.sourceSha256,
        page.sourcePageNumber,
        1,
      ),
    ]);
    if (window.sourceSha256 !== session.sourceSha256
      || rendered.sourceSha256 !== session.sourceSha256) {
      throw new Error("PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé.");
    }
    const inspected = window.pages[0];
    if (!inspected) throw new Error("PDF_EDITOR_PAGE_RANGE:Page PDF introuvable.");
    return {
      page: remapInspectedPage(inspected, page, pageNumber),
      rendered: { pageNumber, rendered },
    };
  }));
  return {
    pages: loaded.map((entry) => entry.page),
    renders: loaded.flatMap((entry) => entry.rendered ? [entry.rendered] : []),
  };
}

export function replacePdfBackgrounds(
  current: Map<number, PdfBackgroundEntry>,
  renders: LoadedPdfWindow["renders"],
) {
  const next = new Map<number, PdfBackgroundEntry>();
  for (const { pageNumber, rendered } of renders) {
    const old = current.get(pageNumber);
    if (old) URL.revokeObjectURL(old.url);
    next.set(pageNumber, {
      url: URL.createObjectURL(new Blob([Uint8Array.from(rendered.bytes)], {
        type: rendered.mimeType,
      })),
      hash: rendered.sourceSha256,
    });
  }
  for (const [number, entry] of current) {
    if (!next.has(number)) URL.revokeObjectURL(entry.url);
  }
  return next;
}
