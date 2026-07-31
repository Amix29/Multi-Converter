import type { EditorAssetData, EditorDocumentV1, Engine, FileDescription, TargetFormat } from "./contracts";

export const PREVIEW_ROOT = "C:\\Users\\Public";
export const PREVIEW_TEMP = `${PREVIEW_ROOT}\\AppData\\Local\\Temp\\multi-converter-preview`;

export interface PreviewEditorState {
  documents: EditorDocumentV1[];
  assets: Map<string, EditorAssetData>;
}

export function createPreviewEditorState(includeRecentDocument = false): PreviewEditorState {
  return {
    documents: includeRecentDocument ? [makePreviewEditorDocument("Brouillon de test")] : [],
    assets: new Map(),
  };
}

export function upsertPreviewDocument(documents: EditorDocumentV1[], document: EditorDocumentV1) {
  const saved = structuredClone(document);
  return [saved, ...documents.filter((item) => item.id !== saved.id)];
}

export function removePreviewDocument(documents: EditorDocumentV1[], id: string) {
  return documents.filter((item) => item.id !== id);
}

const audioTargets = [
  previewTarget("mp3", "MP3", "Audio", "Audio compressé universel", 1),
  previewTarget("m4a", "AAC (M4A)", "Audio", "Streaming, Apple, YouTube", 2),
  previewTarget("flac", "FLAC", "Audio", "Lossless audiophile", 3),
  previewTarget("wav", "WAV", "Audio", "Studio, Windows", 4),
  previewTarget("ogg", "OGG Vorbis", "Audio", "Jeux, streaming libre", 5),
];

const videoTargets = [
  previewTarget("mp4", "MP4", "Vidéo", "Web, smartphones, streaming", 1),
  previewTarget("mov", "MOV", "Vidéo", "Apple, montage vidéo", 4),
  previewTarget("mkv", "MKV", "Vidéo", "Stockage HD/4K", 2),
  previewTarget("webm", "WebM", "Vidéo", "HTML5, web", 3),
];

const imageTargets = [
  previewTarget("jpg", "JPEG", "Image", "Photos, web", 1, "image"),
  previewTarget("png", "PNG", "Image", "Web, logos, transparence", 2, "image"),
  previewTarget("webp", "WebP", "Image", "Web moderne", 3, "image"),
  previewTarget("bmp", "BMP", "Image", "Windows non compressé", 4, "image"),
  previewTarget("tiff", "TIFF", "Image", "Impression, archivage", 5, "image"),
  previewTarget("ico", "ICO", "Image", "Icônes", 6, "image"),
];

const textTargets = [
  previewTarget("pdf", "PDF", "Texte & Documents", "Diffusion/impression universelle", 1, "text"),
  previewTarget("html", "HTML", "Texte & Documents", "Pages web", 4, "text"),
  previewTarget("json", "JSON", "Texte & Documents", "Données structurées web/API", 6, "text"),
];

export function makePreviewEditorDocument(title: string): EditorDocumentV1 {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    source: null,
    content: { type: "doc", content: [{ type: "paragraph" }] },
    header: null,
    footer: null,
    page: {
      format: "a4",
      orientation: "portrait",
      marginsMm: { top: 25, right: 20, bottom: 25, left: 20 },
      numbering: "bottom-center",
    },
    assets: [],
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function makePreviewFile(name: string, extension: string, size: number): FileDescription {
  const categoryId = extension === ".mp4" ? "video" : extension === ".png" ? "images" : "documents";
  const category = categoryId === "video" ? "Vidéo" : categoryId === "images" ? "Image" : "Texte & Documents";
  return {
    path: `${PREVIEW_ROOT}\\Desktop\\${name}`,
    name,
    baseName: name.replace(extension, ""),
    extension,
    category,
    categoryId,
    sourceFormat: extension.replace(".", ""),
    directory: `${PREVIEW_ROOT}\\Desktop`,
    size,
    modifiedAt: new Date().toISOString(),
    warnings: [],
    targets: previewTargetsForExtension(extension),
  };
}

export function previewExtension(name: string): string {
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? `.${match[1].toLowerCase()}` : ".mp4";
}

function previewTargetsForExtension(extension: string): TargetFormat[] {
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return imageTargets;
  if ([".txt", ".md"].includes(extension)) return textTargets;
  if ([".mp4", ".mov", ".mkv"].includes(extension)) return videoTargets;
  return audioTargets;
}

function previewTarget(
  format: string,
  label: string,
  category: string,
  detail: string,
  rank: number,
  engine: Engine = "ffmpeg",
): TargetFormat {
  const categoryId =
    category === "Audio" ? "audio" : category === "Vidéo" ? "video" : category === "Image" ? "images" : "documents";
  return {
    format,
    label,
    category,
    detail,
    rank,
    engine,
    engineLabel:
      engine === "ffmpeg"
        ? "FFmpeg"
        : engine === "image"
          ? "Rust image"
          : engine === "text"
            ? "Rust texte/PDF"
            : "Moteur externe",
    engineAvailable: engine !== "external",
    availability: engine !== "external" ? "available" : "hidden",
    extension: format,
    extensions: [format],
    categoryId,
  };
}
