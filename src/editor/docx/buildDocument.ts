import type { Document as DocxDocument, Paragraph } from "docx";
import type { EditorDocumentV1 } from "../../lib/api";
import { asNode, type DocxBuildContext } from "./types";
import { mapBlocks, mapHeaderFooterBlocks } from "./blockMapping";
import { pageSizeMm } from "./measurements";

export function buildDocxDocument(context: DocxBuildContext): DocxDocument {
  const docx = context.docx;
  const contentRoot = asNode(context.document.content);
  const children = mapBlocks(contentRoot.content, context);
  const header = buildHeaderFooter(context.document.header, context);
  const footerChildren = buildHeaderFooterContent(context.document.footer, context);
  if (context.document.page.numbering !== "none" && !containsPageField(context.document.footer)) {
    footerChildren.push(pageNumberParagraph(context));
  }
  const footer = footerChildren.length ? new docx.Footer({ children: footerChildren }) : undefined;
  const [displayWidthMm, displayHeightMm] = pageSizeMm(context.document.page);
  // docx.js swaps the supplied portrait dimensions when orientation is landscape.
  const [widthMm, heightMm] = context.document.page.orientation === "landscape"
    ? [displayHeightMm, displayWidthMm]
    : [displayWidthMm, displayHeightMm];
  return new docx.Document({
    title: context.document.title,
    creator: "Multi-Converter",
    description: "Document generated locally by Multi-Converter",
    features: { updateFields: true },
    numbering: { config: numberingConfig(context) },
    sections: [{
      headers: header ? { default: header } : undefined,
      footers: footer ? { default: footer } : undefined,
      properties: {
        page: {
          size: {
            width: docx.convertMillimetersToTwip(widthMm),
            height: docx.convertMillimetersToTwip(heightMm),
            orientation: context.document.page.orientation === "landscape" ? docx.PageOrientation.LANDSCAPE : docx.PageOrientation.PORTRAIT,
          },
          margin: {
            top: docx.convertMillimetersToTwip(context.document.page.marginsMm.top),
            right: docx.convertMillimetersToTwip(context.document.page.marginsMm.right),
            bottom: docx.convertMillimetersToTwip(context.document.page.marginsMm.bottom),
            left: docx.convertMillimetersToTwip(context.document.page.marginsMm.left),
          },
          pageNumbers: { start: 1 },
        },
      },
      children: children.length ? children : [new docx.Paragraph("")],
    }],
  });
}

function buildHeaderFooter(value: Record<string, unknown> | null, context: DocxBuildContext) {
  const children = buildHeaderFooterContent(value, context);
  return children.length ? new context.docx.Header({ children }) : undefined;
}

function buildHeaderFooterContent(value: Record<string, unknown> | null, context: DocxBuildContext): Array<Paragraph | import("docx").Table> {
  if (!value) return [];
  return mapHeaderFooterBlocks(asNode(value).content, context).filter(
    (child): child is Paragraph | import("docx").Table => child instanceof context.docx.Paragraph || child instanceof context.docx.Table,
  );
}

function pageNumberParagraph(context: DocxBuildContext) {
  const alignment = context.document.page.numbering === "bottom-right"
    ? context.docx.AlignmentType.RIGHT
    : context.docx.AlignmentType.CENTER;
  return new context.docx.Paragraph({
    alignment,
    children: [new context.docx.TextRun({ children: [context.docx.PageNumber.CURRENT] })],
  });
}

function numberingConfig(context: DocxBuildContext) {
  return context.numberingDefinitions.map(({ reference, start }) => ({
    reference,
    levels: Array.from({ length: 9 }, (_, level) => ({
      level,
      start: level === 0 ? start : 1,
      format: context.docx.LevelFormat.DECIMAL,
      text: `%${level + 1}.`,
      alignment: context.docx.AlignmentType.START,
      style: {
        paragraph: {
          indent: {
            left: context.docx.convertMillimetersToTwip(7.5 * (level + 1)),
            hanging: context.docx.convertMillimetersToTwip(3.5),
          },
        },
      },
    })),
  }));
}

function containsPageField(value: EditorDocumentV1["footer"]): boolean {
  return value ? /\{(?:page|total)\}/i.test(JSON.stringify(value)) : false;
}
