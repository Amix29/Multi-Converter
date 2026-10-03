import type { FileChild } from "docx";
import { addWarning, attr, finite, text, type DocxBuildContext, type TiptapNode } from "./types";
import { contentSizeMm, cssOffsetMm } from "./measurements";
import { mapInlineContent } from "./runMapping";
import { mapImage } from "./imageMapping";
import { mapTable } from "./tableMapping";

interface ListState {
  kind: "bullet" | "number";
  level: number;
  reference?: string;
}

export function mapBlocks(nodes: TiptapNode[] | undefined, context: DocxBuildContext): FileChild[] {
  return mapBlockCollection(nodes, context, undefined);
}

export function mapHeaderFooterBlocks(nodes: TiptapNode[] | undefined, context: DocxBuildContext): FileChild[] {
  return (nodes ?? []).flatMap((node) => {
    if (node.type === "paragraph" || node.type === "heading") return [mapParagraph(node, context, undefined, true)];
    if (node.type === "table") return [mapTable(node, context, mapBlocks)];
    if (node.type === "image" || node.type === "documentImage") return [mapImage(node, context)];
    const value = plainText(node);
    if (!value) {
      addWarning(context, `docx-header-${node.type || "unknown"}`, `L’élément « ${node.type || "inconnu"} » d’en-tête ou de pied de page ne peut pas être représenté dans DOCX.`);
      return [new context.docx.Paragraph({ children: [new context.docx.TextRun({ text: `[Élément non représentable : ${node.type || "inconnu"}]`, italics: true })] })];
    }
    addWarning(context, `docx-header-${node.type || "unknown"}`, `Un élément « ${node.type || "inconnu"} » d’en-tête ou de pied de page a été exporté comme texte.`);
    return [new context.docx.Paragraph({ children: [new context.docx.TextRun(value)] })];
  });
}

function mapBlockCollection(nodes: TiptapNode[] | undefined, context: DocxBuildContext, list: ListState | undefined): FileChild[] {
  const output: FileChild[] = [];
  for (const node of nodes ?? []) output.push(...mapBlock(node, context, list));
  return output;
}

function mapBlock(node: TiptapNode, context: DocxBuildContext, list?: ListState): FileChild[] {
  switch (node.type) {
    case "doc": return mapBlockCollection(node.content, context, list);
    case "paragraph":
    case "heading": return [mapParagraph(node, context, list)];
    case "bulletList": return mapList(node, context, "bullet", list?.level ?? 0);
    case "orderedList": return mapList(node, context, "number", list?.level ?? 0);
    case "listItem": return mapBlockCollection(node.content, context, list);
    case "table": return [mapTable(node, context, mapBlocks)];
    case "image":
    case "documentImage": return [mapImage(node, context)];
    case "pageBreak": return [new context.docx.Paragraph({ pageBreakBefore: true })];
    case "horizontalRule": return [new context.docx.Paragraph({ thematicBreak: true })];
    case "blockquote": return mapBlockquote(node, context, list);
    case "codeBlock": return [new context.docx.Paragraph({
      shading: { fill: "F1EFE8", color: "auto", type: context.docx.ShadingType.CLEAR },
      children: [new context.docx.TextRun({ text: plainText(node), font: "Courier New" })],
    })];
    case "unsupportedObject": {
      const label = text(attr(node, "label"), "Objet non représentable");
      addWarning(context, `docx-unsupported-${label}`, `L’élément « ${label} » n’est pas représentable dans DOCX et reste signalé dans le document.`);
      return [new context.docx.Paragraph({ children: [new context.docx.TextRun({ text: `[${label}]`, italics: true, color: "8A3E2B" })] })];
    }
    default: {
      const value = plainText(node);
      addWarning(context, `docx-block-${node.type || "unknown"}`, `Le bloc « ${node.type || "inconnu"} » n’est pas représentable fidèlement et a été exporté comme texte explicite.`);
      return [new context.docx.Paragraph({ children: [new context.docx.TextRun(value || `[Bloc ${node.type || "inconnu"}]`)] })];
    }
  }
}

function mapParagraph(
  node: TiptapNode,
  context: DocxBuildContext,
  list?: ListState,
  pageFields = false,
  blockquote = false,
) {
  const alignment = paragraphAlignment(text(attr(node, "textAlign")), context);
  const lineHeight = parseLineHeight(attr(node, "lineHeight"));
  const [contentWidth] = contentSizeMm(context.document.page);
  const marginLeft = cssOffsetMm(attr(node, "marginLeft"), contentWidth, 0);
  const textIndent = cssOffsetMm(attr(node, "textIndent"), contentWidth, 0);
  const options: Record<string, unknown> = {
    children: mapInlineContent(node.content, context, pageFields),
    alignment,
    spacing: lineHeight ? { line: Math.round(240 * lineHeight), lineRule: context.docx.LineRuleType.AUTO } : undefined,
    indent: marginLeft || textIndent || blockquote ? {
      left: context.docx.convertMillimetersToTwip(marginLeft + (blockquote ? 7.5 : 0)),
      firstLine: context.docx.convertMillimetersToTwip(Math.max(0, textIndent)),
      hanging: textIndent < 0 ? context.docx.convertMillimetersToTwip(Math.abs(textIndent)) : undefined,
    } : undefined,
    border: blockquote ? {
      left: {
        color: "C87555",
        style: context.docx.BorderStyle.SINGLE,
        size: 12,
        space: 8,
      },
    } : undefined,
  };
  if (node.type === "heading") options.heading = headingLevel(finite(attr(node, "level"), 1), context);
  if (list?.kind === "bullet") options.bullet = { level: Math.min(8, list.level) };
  if (list?.kind === "number" && list.reference) {
    options.numbering = { reference: list.reference, level: Math.min(8, list.level) };
  }
  return new context.docx.Paragraph(options);
}

function mapList(node: TiptapNode, context: DocxBuildContext, kind: ListState["kind"], level: number): FileChild[] {
  const output: FileChild[] = [];
  const reference = kind === "number" ? `mc-numbered-list-${context.listDepth += 1}` : undefined;
  if (reference) {
    context.numberingDefinitions.push({
      reference,
      start: Math.max(1, Math.min(32_767, Math.round(finite(attr(node, "start"), 1)))),
    });
  }
  for (const item of node.content ?? []) {
    if (item.type !== "listItem") continue;
    let markerApplied = false;
    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        output.push(...mapBlock(child, context, { kind, level: level + 1, reference }));
      } else if (!markerApplied && (child.type === "paragraph" || child.type === "heading")) {
        output.push(mapParagraph(child, context, { kind, level, reference }));
        markerApplied = true;
      } else {
        output.push(...mapBlock(child, context));
      }
    }
    if (!markerApplied) output.push(mapParagraph({ type: "paragraph" }, context, { kind, level, reference }));
  }
  return output;
}

function mapBlockquote(
  node: TiptapNode,
  context: DocxBuildContext,
  list?: ListState,
): FileChild[] {
  const output: FileChild[] = [];
  for (const child of node.content ?? []) {
    if (child.type === "paragraph" || child.type === "heading") {
      output.push(mapParagraph(child, context, list, false, true));
      continue;
    }
    addWarning(
      context,
      `docx-blockquote-${child.type || "unknown"}`,
      `Le bloc « ${child.type || "inconnu"} » contenu dans une citation conserve son contenu, mais pas toute la mise en forme de citation.`,
    );
    output.push(...mapBlock(child, context, list));
  }
  return output;
}

function paragraphAlignment(value: string, context: DocxBuildContext) {
  if (value === "center") return context.docx.AlignmentType.CENTER;
  if (value === "right" || value === "end") return context.docx.AlignmentType.RIGHT;
  if (value === "justify") return context.docx.AlignmentType.JUSTIFIED;
  return context.docx.AlignmentType.LEFT;
}

function headingLevel(level: number, context: DocxBuildContext) {
  const headings = [
    context.docx.HeadingLevel.HEADING_1, context.docx.HeadingLevel.HEADING_2,
    context.docx.HeadingLevel.HEADING_3, context.docx.HeadingLevel.HEADING_4,
    context.docx.HeadingLevel.HEADING_5, context.docx.HeadingLevel.HEADING_6,
  ];
  return headings[Math.max(0, Math.min(5, Math.round(level) - 1))];
}

function parseLineHeight(value: unknown): number | undefined {
  const source = String(value ?? "").trim().toLowerCase();
  if (!source || source === "normal" || source === "auto") return undefined;
  const parsed = Number(source.replace(/%$/, ""));
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0.8, Math.min(5, source.endsWith("%") ? parsed / 100 : parsed));
}

function plainText(node: TiptapNode): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(plainText).join("");
}
