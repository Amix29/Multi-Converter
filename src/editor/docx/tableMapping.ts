import type { FileChild, Paragraph, Table as DocxTable } from "docx";
import { attr, finite, text, type DocxBuildContext, type TiptapNode } from "./types";
import { contentSizeMm, normalizeHex } from "./measurements";

type MapBlocks = (nodes: TiptapNode[] | undefined, context: DocxBuildContext) => FileChild[];

export function mapTable(node: TiptapNode, context: DocxBuildContext, mapBlocks: MapBlocks): DocxTable {
  const columnWidths = tableColumnWidths(node, context);
  const rows = (node.content ?? []).filter((row) => row.type === "tableRow").map((row) => {
    const cells = (row.content ?? []).filter((cell) => cell.type === "tableCell" || cell.type === "tableHeader");
    let columnIndex = 0;
    return new context.docx.TableRow({
      tableHeader: cells.length > 0 && cells.every((cell) => cell.type === "tableHeader"),
      cantSplit: true,
      height: rowHeight(row, context),
      children: cells.map((cell) => {
        const span = integerSpan(attr(cell, "colspan"));
        const width = columnWidths.slice(columnIndex, columnIndex + span).reduce((sum, value) => sum + value, 0);
        columnIndex += span;
        return mapCell(cell, context, mapBlocks, width || undefined);
      }),
    });
  });
  return new context.docx.Table({
    rows,
    width: { size: 100, type: context.docx.WidthType.PERCENTAGE },
    columnWidths: columnWidths.length ? columnWidths : undefined,
    layout: context.docx.TableLayoutType.FIXED,
    borders: thinBorders(context),
    margins: { top: 80, right: 100, bottom: 80, left: 100 },
  });
}

function rowHeight(row: TiptapNode, context: DocxBuildContext) {
  const height = finite(attr(row, "height"));
  if (!height) return undefined;
  return {
    value: Math.round(Math.max(24, Math.min(4_096, height)) * 15),
    rule: context.docx.HeightRule.EXACT,
  };
}

function mapCell(
  node: TiptapNode,
  context: DocxBuildContext,
  mapBlocks: MapBlocks,
  normalizedWidth?: number,
) {
  const children = mapBlocks(node.content, context).filter((child): child is Paragraph | DocxTable =>
    child instanceof context.docx.Paragraph || child instanceof context.docx.Table,
  );
  const background = normalizeHex(attr(node, "backgroundColor")) ?? normalizeHex(attr(node, "background"));
  const columnSpan = integerSpan(attr(node, "colspan"));
  const rowSpan = integerSpan(attr(node, "rowspan"));
  return new context.docx.TableCell({
    children: children.length ? children : [new context.docx.Paragraph("")],
    columnSpan,
    rowSpan,
    width: normalizedWidth
      ? { size: normalizedWidth, type: context.docx.WidthType.DXA }
      : undefined,
    shading: background ? { fill: background, color: "auto", type: context.docx.ShadingType.CLEAR } : undefined,
    verticalAlign: verticalAlign(text(attr(node, "verticalAlign")), context),
    borders: thinBorders(context),
  });
}

function tableColumnWidths(node: TiptapNode, context: DocxBuildContext): number[] {
  const firstRow = (node.content ?? []).find((row) => row.type === "tableRow");
  if (!firstRow) return [];
  const widths: number[] = [];
  for (const cell of firstRow.content ?? []) {
    const span = integerSpan(attr(cell, "colspan"));
    const values = Array.isArray(attr(cell, "colwidth")) ? attr(cell, "colwidth") as unknown[] : [];
    for (let index = 0; index < span; index += 1) {
      const width = finite(values[index], values.length ? finite(values[0], 120) : 120);
      widths.push(Math.max(1, width));
    }
  }
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (!total) return [];
  const [contentWidthMm] = contentSizeMm(context.document.page);
  const availableTwips = context.docx.convertMillimetersToTwip(contentWidthMm);
  const normalized = widths.map((width) => Math.max(1, Math.floor(availableTwips * width / total)));
  normalized[normalized.length - 1] += availableTwips - normalized.reduce((sum, width) => sum + width, 0);
  return normalized;
}

function integerSpan(value: unknown): number {
  return Math.max(1, Math.min(100, Math.round(finite(value, 1))));
}

function verticalAlign(value: string, context: DocxBuildContext) {
  if (value === "center" || value === "middle") return context.docx.VerticalAlign.CENTER;
  if (value === "bottom") return context.docx.VerticalAlign.BOTTOM;
  return context.docx.VerticalAlign.TOP;
}

function thinBorders(context: DocxBuildContext) {
  const border = { style: context.docx.BorderStyle.SINGLE, size: 4, color: "B9B5AA" };
  return { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
}
