import type { EditorAssetData, EditorDocumentV1 } from "../../lib/api";

export interface TiptapMark {
  type?: string;
  attrs?: Record<string, unknown> | null;
}

export interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  marks?: TiptapMark[];
  content?: TiptapNode[];
}

export interface DocxGenerationWarning {
  code: string;
  message: string;
}

export interface LoadedDocxAsset {
  id: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  bytes: Uint8Array;
}

export interface DocxGenerationResult {
  bytes: Uint8Array;
  warnings: DocxGenerationWarning[];
}

export interface DocxBuildContext {
  docx: typeof import("docx");
  document: EditorDocumentV1;
  assets: Map<string, LoadedDocxAsset>;
  warnings: DocxGenerationWarning[];
  listDepth: number;
  numberingDefinitions: Array<{ reference: string; start: number }>;
}

export type AssetReader = (documentId: string, assetId: string) => Promise<EditorAssetData>;

export function asNode(value: unknown): TiptapNode {
  return value && typeof value === "object" ? value as TiptapNode : {};
}

export function attr(node: TiptapNode, key: string): unknown {
  return node.attrs?.[key];
}

export function finite(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function addWarning(
  context: DocxBuildContext,
  code: string,
  message: string,
): void {
  if (!context.warnings.some((warning) => warning.code === code && warning.message === message)) {
    context.warnings.push({ code, message });
  }
}
