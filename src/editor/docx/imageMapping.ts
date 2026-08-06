import type { Paragraph, ParagraphChild } from "docx";
import { addWarning, attr, finite, text, type DocxBuildContext, type LoadedDocxAsset, type TiptapNode } from "./types";
import { contentSizeMm, cssMeasureMm, mmToPixels } from "./measurements";

export function mapImage(node: TiptapNode, context: DocxBuildContext): Paragraph {
  const image = mapInlineImage(node, context);
  return new context.docx.Paragraph({
    alignment: paragraphAlignment(text(attr(node, "align")), context),
    children: [image],
  });
}

/** Maps an image node that is already inside a Tiptap paragraph.
 *
 * docx.js owns the media relationship and content-type entries for ImageRun,
 * so using the same primitive here preserves the asset instead of silently
 * dropping it from the OOXML package.
 */
export function mapInlineImage(node: TiptapNode, context: DocxBuildContext): ParagraphChild {
  const assetId = text(attr(node, "assetId"));
  const asset = context.assets.get(assetId);
  if (!asset) {
    addWarning(context, `docx-missing-image-${assetId || "unknown"}`, "Une image locale était inaccessible et a été remplacée par un avertissement textuel dans le DOCX.");
    return new context.docx.TextRun({ text: "[Image locale indisponible]", italics: true });
  }
  const type = imageType(asset);
  if (!type) {
    addWarning(context, `docx-image-format-${asset.mimeType}`, `L’image « ${asset.name} » utilise un format que DOCX ne peut pas incorporer directement.`);
    return new context.docx.TextRun({ text: `[Image non incorporée : ${asset.name}]`, italics: true });
  }
  const [contentWidth, contentHeight] = contentSizeMm(context.document.page);
  const widthMm = cssMeasureMm(attr(node, "width"), contentWidth, Math.min(contentWidth, 150));
  const naturalRatio = asset.width && asset.height ? asset.height / asset.width : 2 / 3;
  const heightMm = cssMeasureMm(attr(node, "height"), contentHeight, widthMm * naturalRatio);
  const layoutMode = text(attr(node, "layoutMode"), "flow");
  const zIndex = Math.round(finite(attr(node, "zIndex"), 0));
  const floating = layoutMode === "floating" ? {
    horizontalPosition: {
      relative: context.docx.HorizontalPositionRelativeFrom.COLUMN,
      offset: mmToEmu(finite(attr(node, "offsetXmm"), 0)),
    },
    verticalPosition: {
      relative: context.docx.VerticalPositionRelativeFrom.PARAGRAPH,
      offset: mmToEmu(finite(attr(node, "offsetYmm"), 0)),
    },
    allowOverlap: true,
    behindDocument: zIndex < 0,
    zIndex: Math.max(0, Math.min(2_147_483_647, zIndex + 10_000)),
    wrap: {
      type: text(attr(node, "wrapMode")) === "parallel" ? context.docx.TextWrappingType.SQUARE : context.docx.TextWrappingType.NONE,
      side: context.docx.TextWrappingSide.BOTH_SIDES,
      margins: { distT: mmToEmu(1.5), distB: mmToEmu(1.5), distL: mmToEmu(2), distR: mmToEmu(2) },
    },
  } : undefined;
  return new context.docx.ImageRun({
    type,
    data: asset.bytes,
    transformation: {
      width: mmToPixels(widthMm),
      height: mmToPixels(heightMm),
      rotation: finite(attr(node, "rotation"), 0),
    },
    floating,
    altText: {
      title: text(attr(node, "title"), asset.name),
      description: text(attr(node, "alt"), asset.name),
      name: asset.name,
    },
  });
}

function imageType(asset: LoadedDocxAsset): "jpg" | "png" | "gif" | "bmp" | null {
  if (asset.mimeType === "image/jpeg") return "jpg";
  if (asset.mimeType === "image/png") return "png";
  if (asset.mimeType === "image/gif") return "gif";
  if (asset.mimeType === "image/bmp") return "bmp";
  return null;
}

function paragraphAlignment(value: string, context: DocxBuildContext) {
  if (value === "left") return context.docx.AlignmentType.LEFT;
  if (value === "right") return context.docx.AlignmentType.RIGHT;
  return context.docx.AlignmentType.CENTER;
}

function mmToEmu(value: number): number {
  return Math.round(value * 36_000);
}
