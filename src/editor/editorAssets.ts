import type { Editor } from "@tiptap/react";
import { api, type EditorAssetStoreResult, type EditorDocumentV1 } from "../lib/api";
import { sanitizeImportedHtml } from "./htmlSanitizer";

const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
const SUPPORTED_IMAGE = /^image\/(?:png|jpeg|webp|gif)$/i;

export async function insertImageFiles(
  editor: Editor,
  files: File[],
  documentId: string,
  onStored: (result: EditorAssetStoreResult) => void,
  onError: (error: unknown) => void,
  position?: number,
) {
  for (const file of files.slice(0, 8)) {
    if (!SUPPORTED_IMAGE.test(file.type) || file.size > MAX_IMAGE_BYTES) continue;
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const result = await api.editorStoreAsset(documentId, file.name, file.type, bytes);
      onStored(result);
      const content = {
        type: "image",
        attrs: {
          assetId: result.asset.id,
          src: `mc-asset://${result.asset.id}`,
          alt: file.name,
          title: file.name,
          width: "auto",
          align: "center",
        },
      };
      const chain = editor.chain().focus();
      if (typeof position === "number") chain.insertContentAt(position, content).run();
      else chain.insertContent(content).run();
    } catch (error) {
      onError(error);
    }
  }
}

export async function normalizeLegacyDocumentAssets(document: EditorDocumentV1): Promise<EditorDocumentV1> {
  let working = structuredClone(document);
  let changed = false;
  let invalidImage = false;

  async function normalize(value: unknown): Promise<unknown> {
    if (Array.isArray(value)) return Promise.all(value.map(normalize));
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    const type = typeof object.type === "string" ? object.type : "";
    if (type === "image" || type === "documentImage") {
      const attrs = { ...((object.attrs && typeof object.attrs === "object" ? object.attrs : {}) as Record<string, unknown>) };
      const source = typeof attrs.src === "string" ? attrs.src : "";
      const assetId = typeof attrs.assetId === "string" ? attrs.assetId : "";
      if (assetId && source === `mc-asset://${assetId}` && working.assets.some((asset) => asset.id === assetId)) {
        return { ...object, attrs };
      }
      const decoded = decodeImageDataUrl(source);
      if (decoded) {
        const result = await api.editorStoreAsset(
          working.id,
          String(attrs.title || attrs.alt || "image"),
          decoded.mimeType,
          decoded.bytes,
        );
        working = { ...working, assets: result.document.assets };
        changed = true;
        return {
          ...object,
          type: "image",
          attrs: { ...attrs, assetId: result.asset.id, src: `mc-asset://${result.asset.id}` },
        };
      }
      changed = true;
      invalidImage = true;
      return { type: "unsupportedObject", attrs: { label: "Image locale indisponible" } };
    }
    const normalized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(object)) normalized[key] = await normalize(child);
    return normalized;
  }

  working = {
    ...working,
    content: await normalize(working.content) as Record<string, unknown>,
    header: working.header ? await normalize(working.header) as Record<string, unknown> : null,
    footer: working.footer ? await normalize(working.footer) as Record<string, unknown> : null,
  };
  if (invalidImage && !working.warnings.some((warning) => warning.code === "missingLegacyImage")) {
    working.warnings = [...working.warnings, {
      code: "missingLegacyImage",
      message: "Une ancienne image locale n’était plus accessible et a été remplacée par un bloc explicite.",
      blocksOverwrite: true,
    }];
  }
  return changed ? api.editorSaveDraft(working) : working;
}

export async function prepareImportedHtmlAssets(document: EditorDocumentV1, untrustedHtml: string) {
  const sanitized = sanitizeImportedHtml(untrustedHtml, { allowDataImages: true });
  const parsed = new DOMParser().parseFromString(sanitized, "text/html");
  let working = document;
  for (const image of Array.from(parsed.querySelectorAll("img"))) {
    const source = image.getAttribute("src") || "";
    const decoded = decodeImageDataUrl(source);
    if (decoded) {
      const name = image.getAttribute("title") || image.getAttribute("alt") || "image";
      const result = await api.editorStoreAsset(working.id, name, decoded.mimeType, decoded.bytes);
      working = { ...working, assets: result.document.assets };
      image.setAttribute("src", `mc-asset://${result.asset.id}`);
      image.setAttribute("data-asset-id", result.asset.id);
      continue;
    }
    const assetId = image.getAttribute("data-asset-id") || "";
    if (!assetId || source !== `mc-asset://${assetId}` || !working.assets.some((asset) => asset.id === assetId)) {
      image.replaceWith(parsed.createTextNode("[Image distante ou inaccessible supprimée]"));
    }
  }
  return { document: working, html: parsed.body.innerHTML };
}

function decodeImageDataUrl(source: string): { mimeType: string; bytes: number[] } | null {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(source);
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ""));
    if (binary.length > MAX_IMAGE_BYTES) return null;
    return {
      mimeType: match[1].toLowerCase(),
      bytes: Array.from(binary, (character) => character.charCodeAt(0)),
    };
  } catch {
    return null;
  }
}
