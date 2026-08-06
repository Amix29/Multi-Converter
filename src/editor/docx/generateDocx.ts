import type { EditorDocumentV1 } from "../../lib/api";
import { buildDocxDocument } from "./buildDocument";
import {
  loadDocxAssets,
  MAX_GENERATED_DOCX_BYTES,
  type LoadDocxAssetsOptions,
} from "./docxAssets";
import {
  addWarning,
  type AssetReader,
  type DocxBuildContext,
  type DocxGenerationResult,
  type LoadedDocxAsset,
} from "./types";

export async function generateDocx(
  document: EditorDocumentV1,
  readAsset: AssetReader,
  options: LoadDocxAssetsOptions = {},
): Promise<DocxGenerationResult> {
  const loaded = await loadDocxAssets(document, readAsset, {
    signal: options.signal,
    onProgress: (progress) => options.onProgress?.(progress * 0.35),
  });
  options.signal?.throwIfAborted();
  return generateDocxFromLoadedAssets(document, loaded.assets, loaded.warnings, options);
}

export async function generateDocxFromLoadedAssets(
  document: EditorDocumentV1,
  assets: LoadedDocxAsset[],
  warnings: DocxGenerationResult["warnings"] = [],
  options: LoadDocxAssetsOptions = {},
): Promise<DocxGenerationResult> {
  options.signal?.throwIfAborted();
  const docx = await import("docx");
  options.signal?.throwIfAborted();
  const context: DocxBuildContext = {
    docx,
    document,
    assets: new Map(assets.map((asset) => [asset.id, asset])),
    warnings: [...warnings],
    listDepth: 0,
    numberingDefinitions: [],
  };
  options.onProgress?.(0.45);
  await normalizeAssets(context, options);
  options.signal?.throwIfAborted();
  const file = buildDocxDocument(context);
  options.onProgress?.(0.62);
  options.signal?.throwIfAborted();
  const bytes = new Uint8Array(await docx.Packer.toArrayBuffer(file));
  options.signal?.throwIfAborted();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_GENERATED_DOCX_BYTES) {
    throw new Error("EDITOR_DOCX_SIZE_LIMIT:Le DOCX généré dépasse la limite locale de 128 Mio.");
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("EDITOR_DOCX_INVALID:Le générateur n’a pas produit une archive DOCX complète.");
  }
  options.onProgress?.(1);
  return { bytes, warnings: context.warnings };
}

async function normalizeAssets(
  context: DocxBuildContext,
  options: LoadDocxAssetsOptions,
): Promise<void> {
  const assets = [...context.assets.values()];
  for (let index = 0; index < assets.length; index += 1) {
    options.signal?.throwIfAborted();
    const normalized = await normalizeWebp(assets[index], context);
    context.assets.set(normalized.id, normalized);
    options.onProgress?.(0.45 + 0.15 * (index + 1) / Math.max(1, assets.length));
  }
}

async function normalizeWebp(asset: LoadedDocxAsset, context: DocxBuildContext): Promise<LoadedDocxAsset> {
  if (asset.mimeType !== "image/webp") return asset;
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    addWarning(context, `docx-webp-${asset.id}`, `L’image WebP « ${asset.name} » ne peut pas être convertie par ce moteur WebView et sera signalée dans le DOCX.`);
    return asset;
  }
  try {
    const copy = new Uint8Array(asset.bytes.byteLength);
    copy.set(asset.bytes);
    const bitmap = await createImageBitmap(new Blob([copy.buffer], { type: asset.mimeType }));
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const drawing = canvas.getContext("2d");
    if (!drawing) throw new Error("canvas-unavailable");
    drawing.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { ...asset, mimeType: "image/png", width: width || asset.width, height: height || asset.height, bytes: new Uint8Array(await blob.arrayBuffer()) };
  } catch {
    addWarning(context, `docx-webp-${asset.id}`, `L’image WebP « ${asset.name} » n’a pas pu être convertie en PNG et sera signalée dans le DOCX.`);
    return asset;
  }
}

export { MAX_GENERATED_DOCX_BYTES } from "./docxAssets";
