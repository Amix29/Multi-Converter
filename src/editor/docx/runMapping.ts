import type { ParagraphChild } from "docx";
import { addWarning, finite, text, type DocxBuildContext, type TiptapMark, type TiptapNode } from "./types";
import { mapInlineImage } from "./imageMapping";
import { normalizeHex } from "./measurements";

export function mapInlineContent(
  nodes: TiptapNode[] | undefined,
  context: DocxBuildContext,
  allowPageFields = false,
): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "text") {
      children.push(...mapTextNode(node, context, allowPageFields));
      continue;
    }
    if (node.type === "hardBreak") {
      children.push(new context.docx.TextRun({ break: 1 }));
      continue;
    }
    if (node.type === "image" || node.type === "documentImage") {
      children.push(mapInlineImage(node, context));
      continue;
    }
    const value = plainText(node);
    if (value) {
      addWarning(context, `docx-inline-${node.type || "unknown"}`, `Le contenu inline « ${node.type || "inconnu"} » a été exporté comme texte.`);
      children.push(new context.docx.TextRun(value));
    }
  }
  return children;
}

function mapTextNode(node: TiptapNode, context: DocxBuildContext, allowPageFields: boolean): ParagraphChild[] {
  const options = runOptions(node.marks ?? [], context);
  const link = linkTarget(node.marks ?? []);
  const parts = allowPageFields ? splitPageFields(node.text ?? "") : [{ text: node.text ?? "" }];
  const runs = parts.map((part): ParagraphChild => {
    if (part.field === "page") return new context.docx.TextRun({ ...options, children: [context.docx.PageNumber.CURRENT] });
    if (part.field === "total") return new context.docx.TextRun({ ...options, children: [context.docx.PageNumber.TOTAL_PAGES] });
    return new context.docx.TextRun({ ...options, text: part.text ?? "" });
  });
  if (!link) return runs;
  if (!isSafeLink(link)) {
    addWarning(context, "docx-unsafe-link", "Un lien utilisant un protocole non pris en charge a été conservé comme texte sans hyperlien.");
    return runs;
  }
  return [new context.docx.ExternalHyperlink({ link, children: runs })];
}

function runOptions(marks: TiptapMark[], context: DocxBuildContext) {
  const options: Record<string, unknown> = {};
  for (const mark of marks) {
    const attrs = mark.attrs ?? {};
    switch (mark.type) {
      case "bold": options.bold = true; break;
      case "italic": options.italics = true; break;
      case "underline": options.underline = {}; break;
      case "strike": options.strike = true; break;
      case "subscript": options.subScript = true; break;
      case "superscript": options.superScript = true; break;
      case "code": options.font = "Courier New"; break;
      case "textStyle": {
        const font = text(attrs.fontFamily).trim();
        if (font) options.font = font;
        const color = normalizeHex(attrs.color);
        if (color) options.color = color;
        const pointSize = parsePointSize(attrs.fontSize);
        if (pointSize) options.size = Math.round(pointSize * 2);
        break;
      }
      case "highlight": {
        const fill = normalizeHex(attrs.color);
        if (fill) options.shading = { fill, color: "auto", type: context.docx.ShadingType.CLEAR };
        break;
      }
    }
  }
  return options;
}

function parsePointSize(value: unknown): number | undefined {
  const parsed = finite(String(value ?? "").replace(/pt$/i, ""), Number.NaN);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 400 ? parsed : undefined;
}

function linkTarget(marks: TiptapMark[]): string | undefined {
  const value = marks.find((mark) => mark.type === "link")?.attrs?.href;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isSafeLink(value: string): boolean {
  try {
    const protocol = new URL(value, "https://local.invalid").protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}

function splitPageFields(value: string): Array<{ text?: string; field?: "page" | "total" }> {
  const parts: Array<{ text?: string; field?: "page" | "total" }> = [];
  let cursor = 0;
  for (const match of value.matchAll(/\{(page|total)\}/gi)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: value.slice(cursor, index) });
    parts.push({ field: match[1].toLowerCase() === "page" ? "page" : "total" });
    cursor = index + match[0].length;
  }
  if (cursor < value.length || parts.length === 0) parts.push({ text: value.slice(cursor) });
  return parts;
}

function plainText(node: TiptapNode): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(plainText).join("");
}
