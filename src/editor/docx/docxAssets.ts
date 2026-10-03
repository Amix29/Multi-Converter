import type { EditorDocumentV1 } from "../../lib/api";
import {
  type AssetReader,
  type DocxGenerationWarning,
  type LoadedDocxAsset,
} from "./types";

export const MAX_GENERATED_DOCX_BYTES = 128 * 1024 * 1024;
export const MAX_GENERATED_DOCX_ASSETS = 4_096;

export interface LoadDocxAssetsOptions {
  signal?: AbortSignal;
  onProgress?(progress: number): void;
}

export interface LoadedDocxAssets {
  assets: LoadedDocxAsset[];
  warnings: DocxGenerationWarning[];
}

export async function loadDocxAssets(
  document: EditorDocumentV1,
  readAsset: AssetReader,
  options: LoadDocxAssetsOptions = {},
): Promise<LoadedDocxAssets> {
  options.signal?.throwIfAborted();
  const referenced = referencedAssetIds(document);
  if (referenced.length > MAX_GENERATED_DOCX_ASSETS) {
    throw new Error("EDITOR_DOCX_ASSET_LIMIT:Le document contient trop de ressources pour un export DOCX sûr.");
  }
  const descriptors = new Map(document.assets.map((asset) => [asset.id, asset]));
  let declaredBytes = 0;
  for (const assetId of referenced) {
    const descriptor = descriptors.get(assetId);
    if (!descriptor) continue;
    if (!Number.isSafeInteger(descriptor.size) || descriptor.size < 0) {
      throw new Error("EDITOR_DOCX_ASSET_INVALID:La taille déclarée d’une ressource DOCX est invalide.");
    }
    declaredBytes += descriptor.size;
    if (declaredBytes > MAX_GENERATED_DOCX_BYTES) {
      throw new Error("EDITOR_DOCX_SIZE_LIMIT:Les ressources du document dépassent la limite locale de 128 Mio.");
    }
  }

  const assets: LoadedDocxAsset[] = [];
  const warnings: DocxGenerationWarning[] = [];
  let totalBytes = 0;
  for (let index = 0; index < referenced.length; index += 1) {
    options.signal?.throwIfAborted();
    const assetId = referenced[index];
    const descriptor = descriptors.get(assetId);
    if (!descriptor) {
      addUniqueWarning(warnings, {
        code: `docx-asset-reference-${assetId}`,
        message: `Une référence d’image locale (${assetId}) ne correspond à aucune ressource du document.`,
      });
      options.onProgress?.((index + 1) / Math.max(1, referenced.length));
      continue;
    }

    try {
      const data = await readAsset(document.id, assetId);
      options.signal?.throwIfAborted();
      const bytes = Uint8Array.from(data.bytes);
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_GENERATED_DOCX_BYTES) {
        throw new Error("asset-size-limit");
      }
      assets.push({
        id: assetId,
        name: descriptor.name,
        mimeType: data.mimeType.toLowerCase(),
        width: descriptor.width,
        height: descriptor.height,
        bytes,
      });
    } catch (error) {
      if (options.signal?.aborted) throw abortReason(options.signal);
      if (error instanceof Error && error.message === "asset-size-limit") {
        throw new Error("EDITOR_DOCX_SIZE_LIMIT:Les ressources du document dépassent la limite locale de 128 Mio.");
      }
      addUniqueWarning(warnings, {
        code: `docx-asset-read-${assetId}`,
        message: `L’image « ${descriptor.name} » n’a pas pu être lue et sera signalée dans le DOCX.`,
      });
    }
    options.onProgress?.((index + 1) / Math.max(1, referenced.length));
  }
  if (referenced.length === 0) options.onProgress?.(1);
  return { assets, warnings };
}

export function referencedAssetIds(document: EditorDocumentV1): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if ((object.type === "image" || object.type === "documentImage") && object.attrs && typeof object.attrs === "object") {
      const id = (object.attrs as Record<string, unknown>).assetId;
      if (typeof id === "string" && id) ids.add(id);
    }
    Object.values(object).forEach(visit);
  };
  visit(document.content);
  visit(document.header);
  visit(document.footer);
  return [...ids];
}

function addUniqueWarning(
  warnings: DocxGenerationWarning[],
  warning: DocxGenerationWarning,
): void {
  if (!warnings.some((item) => item.code === warning.code && item.message === warning.message)) {
    warnings.push(warning);
  }
}

function abortReason(signal: AbortSignal): Error | DOMException {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("L’export DOCX a été annulé.", "AbortError");
}
