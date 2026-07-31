import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Engine = string;
export type AppMode = "converter" | "editor";
export type EditorFormat = "docx" | "odt" | "rtf" | "txt" | "md" | "html" | "pdf";

export interface EditorAssetRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
}

export interface EditorCompatibilityWarning {
  code: string;
  message: string;
  blocksOverwrite: boolean;
}

export interface EditorDocumentV1 {
  schemaVersion: 1;
  id: string;
  title: string;
  source: {
    path: string;
    format: Exclude<EditorFormat, "pdf">;
    size: number;
    modifiedAt: string;
  } | null;
  content: Record<string, unknown>;
  header: Record<string, unknown> | null;
  footer: Record<string, unknown> | null;
  page: {
    format: "a3" | "a4" | "a5" | "letter" | "legal";
    orientation: "portrait" | "landscape";
    marginsMm: { top: number; right: number; bottom: number; left: number };
    numbering: "none" | "bottom-center" | "bottom-right";
  };
  assets: EditorAssetRef[];
  warnings: EditorCompatibilityWarning[];
  createdAt: string;
  updatedAt: string;
}

export interface EditorDocumentSummary {
  id: string;
  title: string;
  format: string;
  sourcePath: string | null;
  updatedAt: string;
  recoverable: boolean;
}

export interface EditorImportResult {
  document: EditorDocumentV1;
  transientContent?: {
    kind: "html" | "markdown";
    value: string;
  } | null;
}

export interface EditorWriteRequest {
  document: EditorDocumentV1;
  targetFormat: EditorFormat;
  destinationPath?: string | null;
}

export interface EditorWriteResult {
  path: string;
  document: EditorDocumentV1;
}

export interface EditorAssetData {
  bytes: number[];
  mimeType: string;
}

export interface EditorAssetStoreResult {
  asset: EditorAssetRef;
  document: EditorDocumentV1;
}

export interface TargetFormat {
  format: string;
  label: string;
  extensions: string[];
  extension: string;
  category: string;
  categoryId: string;
  detail: string;
  rank: number;
  engine: Engine;
  engineLabel: string;
  engineAvailable: boolean;
  availability: "available" | "unavailable" | "hidden";
}

export interface FileDescription {
  path: string;
  name: string;
  baseName: string;
  extension: string;
  category: string;
  categoryId: string;
  sourceFormat: string | null;
  directory: string;
  size: number;
  modifiedAt: string;
  warnings: FileWarning[];
  targets: TargetFormat[];
}

export interface FileWarning {
  code: "largeFile" | "memoryIntensive" | "partialFolderImport";
  severity: "warning";
  limitBytes?: number | null;
}

export interface ClipboardFileInput {
  name: string;
  mimeType: string;
  bytes: number[];
}

export interface ConversionJob {
  id: string;
  inputPath: string;
  targetFormat: string;
  outputDir: string;
  batchConcurrency?: number;
}

export interface ConversionResult {
  outputPath: string;
}

export interface ProgressPayload {
  jobId: string;
  progress: number;
  phase: string;
}

export interface ExportResult {
  destinationDir: string;
  files: string[];
  destinationCreated: boolean;
}

export interface DependencyBootstrap {
  envDir: string;
  ok: boolean;
  mode: string;
  internetAvailable: boolean;
  checks: DependencyCheck[];
}

export interface DependencyCheck {
  id: string;
  label: string;
  role: string;
  description: string;
  mode: "base" | "advanced";
  requiredVersion: string;
  detectedVersion?: string | null;
  path?: string | null;
  status: string;
  detail: string;
  engineKind: string;
  managed: boolean;
  available: boolean;
  versionStatus: string;
  estimatedSize: string;
  installedSizeBytes: number;
  estimatedInstalledSizeBytes: number;
  downloadSizeBytes: number;
  updateAvailable: boolean;
  commands: string[];
  categories: string[];
  conversions: string[];
  dependencies: string[];
  capabilities: string[];
  blockedReason?: string | null;
  actionLabel: string;
}

export interface WelcomeState {
  show: boolean;
}

export interface MultiConverterApi {
  welcomeState(): Promise<WelcomeState>;
  markWelcomeSeen(): Promise<boolean>;
  bootstrapDependencies(): Promise<DependencyBootstrap>;
  refreshEngineDiagnostics(): Promise<DependencyBootstrap>;
  pickFilePaths(): Promise<string[]>;
  pickOutputFolder(): Promise<string | null>;
  createTempOutputFolder(): Promise<string>;
  cleanupTempOutputFolder(folder: string): Promise<boolean>;
  exportToDownloads(filePaths: string[], outputDir?: string | null): Promise<ExportResult>;
  exportToFolder(filePaths: string[], destinationDir: string, outputDir?: string | null): Promise<ExportResult>;
  describePaths(paths: string[]): Promise<FileDescription[]>;
  saveClipboardFiles(files: ClipboardFileInput[]): Promise<string[]>;
  convert(job: ConversionJob): Promise<ConversionResult>;
  cancelConversion(jobId: string): Promise<boolean>;
  revealFile(filePath: string): Promise<boolean>;
  openExternalUrl(url: string): Promise<boolean>;
  editorCreateDocument(): Promise<EditorDocumentV1>;
  editorListRecentDocuments(): Promise<EditorDocumentSummary[]>;
  editorLoadDocument(id: string): Promise<EditorDocumentV1>;
  editorSaveDraft(document: EditorDocumentV1): Promise<EditorDocumentV1>;
  editorDeleteDraft(id: string): Promise<boolean>;
  editorRenameDocument(id: string, title: string): Promise<EditorDocumentV1>;
  editorDuplicateDocument(id: string, title: string): Promise<EditorDocumentV1>;
  editorImportDocument(path?: string | null): Promise<EditorImportResult | null>;
  editorSaveDocument(request: EditorWriteRequest): Promise<EditorWriteResult>;
  editorSaveAs(request: EditorWriteRequest): Promise<EditorWriteResult | null>;
  editorExportDocument(request: EditorWriteRequest): Promise<EditorWriteResult | null>;
  editorReadAsset(documentId: string, assetId: string): Promise<EditorAssetData>;
  editorStoreAsset(documentId: string, name: string, mimeType: string, bytes: number[]): Promise<EditorAssetStoreResult>;
  editorImportAsset(documentId: string, path?: string | null): Promise<EditorAssetStoreResult | null>;
  editorRemoveAsset(documentId: string, assetId: string): Promise<EditorDocumentV1>;
  editorPruneAssets(documentId: string): Promise<EditorDocumentV1>;
  engineStatuses(): Promise<EngineStatus[]>;
  onProgress(callback: (payload: ProgressPayload) => void): Promise<UnlistenFn>;
  onFileDrop(callback: (paths: string[]) => void): Promise<UnlistenFn>;
}

export interface EngineStatus {
  id: string;
  label: string;
  role?: string;
  description?: string;
  mode?: "base" | "advanced";
  available?: boolean;
  path?: string | null;
  engineKind?: string;
  managed?: boolean;
  version?: string | null;
  expectedVersion?: string;
  versionStatus?: string;
  status?: "ready" | "missing" | "badVersion" | "testFailed" | "repairing" | "disabled";
  statusLabel?: string;
  estimatedSize?: string;
  installedSizeBytes?: number;
  estimatedInstalledSizeBytes?: number;
  downloadSizeBytes?: number;
  updateAvailable?: boolean;
  commands?: string[];
  categories?: string[];
  conversions?: string[];
  dependencies?: string[];
  capabilities?: string[];
  unavailableReason?: string | null;
  actionLabel?: string;
}

const isTauri = "__TAURI_INTERNALS__" in window;

export const api: MultiConverterApi = isTauri ? createTauriApi() : createPreviewApi();

function createTauriApi(): MultiConverterApi {
  return {
    welcomeState: () => invoke<WelcomeState>("welcome_state"),
    markWelcomeSeen: () => invoke<boolean>("mark_welcome_seen"),
    bootstrapDependencies: () => invoke<DependencyBootstrap>("bootstrap_dependencies"),
    refreshEngineDiagnostics: () => invoke<DependencyBootstrap>("bootstrap_dependencies"),
    pickFilePaths: () => invoke<string[]>("pick_file_paths"),
    pickOutputFolder: () => invoke<string | null>("pick_output_folder"),
    createTempOutputFolder: () => invoke<string>("create_temp_output_folder"),
    cleanupTempOutputFolder: (folder) => invoke<boolean>("cleanup_temp_output_folder", { folder }),
    exportToDownloads: (filePaths, outputDir) => invoke<ExportResult>("export_to_downloads", { filePaths, outputDir }),
    exportToFolder: (filePaths, destinationDir, outputDir) => invoke<ExportResult>("export_to_folder", { filePaths, destinationDir, outputDir }),
    describePaths: (paths) => invoke<FileDescription[]>("describe_paths", { paths }),
    saveClipboardFiles: (files) => invoke<string[]>("save_clipboard_files", { files }),
    convert: (job) => invoke<ConversionResult>("start_conversion", { job }),
    cancelConversion: (jobId) => invoke<boolean>("cancel_conversion", { jobId }),
    revealFile: (filePath) => invoke<boolean>("reveal_file", { filePath }),
    openExternalUrl: (url) => invoke<boolean>("open_external_url", { url }),
    editorCreateDocument: () => invoke<EditorDocumentV1>("editor_create_document"),
    editorListRecentDocuments: () => invoke<EditorDocumentSummary[]>("editor_list_recent_documents"),
    editorLoadDocument: (id) => invoke<EditorDocumentV1>("editor_load_document", { id }),
    editorSaveDraft: (document) => invoke<EditorDocumentV1>("editor_save_draft", { document }),
    editorDeleteDraft: (id) => invoke<boolean>("editor_delete_draft", { id }),
    editorRenameDocument: (id, title) => invoke<EditorDocumentV1>("editor_rename_document", { id, title }),
    editorDuplicateDocument: (id, title) => invoke<EditorDocumentV1>("editor_duplicate_document", { id, title }),
    editorImportDocument: (path) => invoke<EditorImportResult | null>("editor_import_document", { path: path ?? null }),
    editorSaveDocument: (request) => invoke<EditorWriteResult>("editor_save_document", { request }),
    editorSaveAs: (request) => invoke<EditorWriteResult | null>("editor_save_as", { request }),
    editorExportDocument: (request) => invoke<EditorWriteResult | null>("editor_export_document", { request }),
    editorReadAsset: (documentId, assetId) => invoke<EditorAssetData>("editor_read_asset", { documentId, assetId }),
    editorStoreAsset: (documentId, name, mimeType, bytes) => invoke<EditorAssetStoreResult>("editor_store_asset", { documentId, name, mimeType, bytes }),
    editorImportAsset: (documentId, path) => invoke<EditorAssetStoreResult | null>("editor_import_asset", { documentId, path: path ?? null }),
    editorRemoveAsset: (documentId, assetId) => invoke<EditorDocumentV1>("editor_remove_asset", { documentId, assetId }),
    editorPruneAssets: (documentId) => invoke<EditorDocumentV1>("editor_prune_assets", { documentId }),
    engineStatuses: () => invoke<EngineStatus[]>("engine_statuses"),
    onProgress: async (callback) => listen<ProgressPayload>("convert-progress", (event) => callback(event.payload)),
    onFileDrop: async (callback) =>
      listen<{ paths?: string[] }>("tauri://drag-drop", (event) => {
        const paths = event.payload?.paths ?? [];
        if (paths.length) callback(paths);
      }),
  };
}

function createPreviewApi(): MultiConverterApi {
  const previewParams = new URLSearchParams(window.location.search);
  const listeners = new Set<(payload: ProgressPayload) => void>();
  const previewDocuments: EditorDocumentV1[] = previewParams.get("mockRecentDocuments") === "1"
    ? [makePreviewEditorDocument("Brouillon de test")]
    : [];
  const previewEditorAssets = new Map<string, EditorAssetData>();
  const previewRoot = "C:\\Users\\Public";
  const previewTemp = `${previewRoot}\\AppData\\Local\\Temp\\multi-converter-preview`;
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

  return {
    async welcomeState() {
      return { show: previewParams.get("mockWelcomeSeen") !== "1" };
    },
    async markWelcomeSeen() {
      return true;
    },
    async bootstrapDependencies() {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      return {
        envDir: `${previewRoot}\\AppData\\Local\\Multi-Converter\\tool-env`,
        ok: true,
        mode: "Complet",
        internetAvailable: navigator.onLine,
        checks: [],
      };
    },
    async refreshEngineDiagnostics() {
      return this.bootstrapDependencies();
    },
    async pickFilePaths() {
      return [
        `${previewRoot}\\Documents\\test.md`,
        `${previewRoot}\\Pictures\\Grand Theft Auto V Screenshot 2026.01.05 - 18.43.12.84.png`,
        `${previewRoot}\\Pictures\\Red Dead Redemption 2 Screenshot 2026.01.07 - 21.18.44.02.png`,
        `${previewRoot}\\Videos\\Enregistrement de l'écran 2025-10-13 184512.mp4`,
        `${previewRoot}\\Videos\\Enregistrement de l'écran 2025-11-19 190508.mov`,
        `${previewRoot}\\Videos\\Enregistrement de l'écran 2025-11-19 190508 version très longue pour vérifier le découpage.mp4`,
        `${previewRoot}\\Audio\\Capture audio réunion client avec un nom beaucoup trop long.wav`,
      ];
    },
    async pickOutputFolder() {
      return `${previewRoot}\\Documents\\Conversions`;
    },
    async createTempOutputFolder() {
      return previewTemp;
    },
    async cleanupTempOutputFolder() {
      return true;
    },
    async exportToDownloads(filePaths) {
      return {
        destinationDir: `${previewRoot}\\Downloads\\Conversion`,
        files: filePaths.map((filePath) => filePath.replace(previewTemp, `${previewRoot}\\Downloads\\Conversion`)),
        destinationCreated: false,
      };
    },
    async exportToFolder(filePaths, destinationDir) {
      return {
        destinationDir,
        files: filePaths.map((filePath) => filePath.replace(previewTemp, destinationDir)),
        destinationCreated: false,
      };
    },
    async describePaths(paths) {
      return paths.map((filePath) => {
        const name = filePath.split(/[\\/]/).pop() || "fichier.mp4";
        const extension = previewExtension(name);
        const targets = extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".webp" ? imageTargets : extension === ".txt" || extension === ".md" ? textTargets : extension === ".mp4" || extension === ".mov" || extension === ".mkv" ? videoTargets : audioTargets;
        return makePreviewFile(name, extension, 42865012, targets, previewRoot);
      });
    },
    async saveClipboardFiles(files) {
      return files.map((file, index) => `${previewRoot}\\Desktop\\clipboard-${index + 1}-${file.name || "file.txt"}`);
    },
    async convert(job) {
      const steps: Array<[number, string]> = [
        [8, "Analyse"],
        [28, "Préparation"],
        [54, "Conversion"],
        [82, "Finalisation"],
        [100, "Terminé"],
      ];
      for (const [progress, phase] of steps) {
        await new Promise((resolve) => window.setTimeout(resolve, 180 + Math.random() * 260));
        listeners.forEach((listener) => listener({ jobId: job.id, progress, phase }));
      }
      return {
        outputPath: `${job.outputDir}\\${job.id}\\resultat.${job.targetFormat}`,
      };
    },
    async cancelConversion() {
      return true;
    },
    async revealFile() {
      return true;
    },
    async openExternalUrl(url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    },
    async editorCreateDocument() {
      const document = makePreviewEditorDocument("Sans titre");
      previewDocuments.unshift(document);
      return document;
    },
    async editorListRecentDocuments() {
      return previewDocuments.slice(0, 10).map((document) => ({
        id: document.id,
        title: document.title,
        format: document.source?.format ?? "draft",
        sourcePath: document.source?.path ?? null,
        updatedAt: document.updatedAt,
        recoverable: true,
      }));
    },
    async editorLoadDocument(id) {
      const document = previewDocuments.find((item) => item.id === id);
      if (!document) throw new Error("Brouillon introuvable.");
      return structuredClone(document);
    },
    async editorSaveDraft(document) {
      const saved = { ...structuredClone(document), updatedAt: new Date().toISOString() };
      const index = previewDocuments.findIndex((item) => item.id === saved.id);
      if (index >= 0) previewDocuments.splice(index, 1);
      previewDocuments.unshift(saved);
      return saved;
    },
    async editorDeleteDraft(id) {
      const index = previewDocuments.findIndex((item) => item.id === id);
      if (index >= 0) previewDocuments.splice(index, 1);
      return true;
    },
    async editorRenameDocument(id, title) {
      const document = previewDocuments.find((item) => item.id === id);
      if (!document) throw new Error("Brouillon introuvable.");
      return this.editorSaveDraft({ ...document, title: title.trim() });
    },
    async editorDuplicateDocument(id, title) {
      const document = previewDocuments.find((item) => item.id === id);
      if (!document) throw new Error("Brouillon introuvable.");
      const duplicate = structuredClone(document);
      duplicate.id = crypto.randomUUID();
      duplicate.title = title.trim();
      duplicate.source = null;
      duplicate.createdAt = new Date().toISOString();
      duplicate.updatedAt = duplicate.createdAt;
      for (const asset of duplicate.assets) {
        const data = previewEditorAssets.get(`${id}:${asset.id}`);
        if (data) previewEditorAssets.set(`${duplicate.id}:${asset.id}`, structuredClone(data));
      }
      return this.editorSaveDraft(duplicate);
    },
    async editorImportDocument(path) {
      const document = makePreviewEditorDocument(path?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "Rapport annuel");
      document.source = {
        path: path || `${previewRoot}\\Documents\\Rapport annuel.docx`,
        format: "docx",
        size: 84214,
        modifiedAt: new Date().toISOString(),
      };
      previewDocuments.unshift(document);
      return {
        document,
        transientContent: {
          kind: "html",
          value: "<h1>Rapport annuel</h1><p>Ce document reste entièrement local et peut être modifié avec Multi-Converter.</p><h2>Résumé</h2><p>Ajoutez votre contenu ici.</p>",
        },
      };
    },
    async editorSaveDocument(request) {
      const path = request.document.source?.path || `${previewRoot}\\Documents\\${request.document.title}.${request.targetFormat}`;
      return { path, document: await this.editorSaveDraft(request.document) };
    },
    async editorSaveAs(request) {
      const document = await this.editorSaveDraft(request.document);
      return { path: `${previewRoot}\\Documents\\${document.title}.${request.targetFormat}`, document };
    },
    async editorExportDocument(request) {
      const document = await this.editorSaveDraft(request.document);
      return { path: `${previewRoot}\\Downloads\\${document.title}.${request.targetFormat}`, document };
    },
    async editorReadAsset(documentId, assetId) {
      const data = previewEditorAssets.get(`${documentId}:${assetId}`);
      if (!data) throw new Error("Ressource introuvable.");
      return structuredClone(data);
    },
    async editorStoreAsset(documentId, name, mimeType, bytes) {
      const document = previewDocuments.find((item) => item.id === documentId);
      if (!document) throw new Error("Brouillon introuvable.");
      const asset: EditorAssetRef = { id: crypto.randomUUID(), name, mimeType, size: bytes.length };
      document.assets = [...document.assets, asset];
      previewEditorAssets.set(`${documentId}:${asset.id}`, { bytes: [...bytes], mimeType });
      return { asset, document: await this.editorSaveDraft(document) };
    },
    async editorImportAsset() {
      return null;
    },
    async editorRemoveAsset(documentId, assetId) {
      const document = previewDocuments.find((item) => item.id === documentId);
      if (!document) throw new Error("Brouillon introuvable.");
      document.assets = document.assets.filter((asset) => asset.id !== assetId);
      previewEditorAssets.delete(`${documentId}:${assetId}`);
      return this.editorSaveDraft(document);
    },
    async editorPruneAssets(documentId) {
      const document = previewDocuments.find((item) => item.id === documentId);
      if (!document) throw new Error("Brouillon introuvable.");
      return structuredClone(document);
    },
    async engineStatuses() {
      return [
        { id: "rust-text", label: "Moteur documents intégré", mode: "base", available: true, status: "ready" },
        { id: "rust-image", label: "Moteur images intégré", mode: "base", available: true, status: "ready" },
        { id: "ffmpeg", label: "FFmpeg", mode: "base", available: true, status: "ready" },
        { id: "ffprobe", label: "ffprobe", mode: "base", available: true, status: "ready" },
        { id: "pdfium", label: "PDFium", mode: "advanced", available: true, status: "ready" },
        { id: "libreoffice", label: "LibreOffice", mode: "advanced", available: true, status: "ready" },
        { id: "pandoc", label: "Pandoc", mode: "advanced", available: true, status: "ready" },
        { id: "libvips", label: "libvips", mode: "advanced", available: true, status: "ready" },
      ];
    },
    async onProgress(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    async onFileDrop() {
      return () => undefined;
    },
  };
}

function makePreviewEditorDocument(title: string): EditorDocumentV1 {
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

function makePreviewFile(name: string, extension: string, size: number, targets: TargetFormat[], previewRoot: string): FileDescription {
  const categoryId = extension === ".mp4" ? "video" : extension === ".png" ? "images" : "documents";
  const category = categoryId === "video" ? "Vidéo" : categoryId === "images" ? "Image" : "Texte & Documents";
  return {
    path: `${previewRoot}\\Desktop\\${name}`,
    name,
    baseName: name.replace(extension, ""),
    extension,
    category,
    categoryId,
    sourceFormat: extension.replace(".", ""),
    directory: `${previewRoot}\\Desktop`,
    size,
    modifiedAt: new Date().toISOString(),
    warnings: [],
    targets,
  };
}

function previewExtension(name: string) {
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? `.${match[1].toLowerCase()}` : ".mp4";
}

function previewTarget(format: string, label: string, category: string, detail: string, rank: number, engine: Engine = "ffmpeg"): TargetFormat {
  const categoryId = category === "Audio" ? "audio" : category === "Vidéo" ? "video" : category === "Image" ? "images" : "documents";
  return {
    format,
    label,
    category,
    detail,
    rank,
    engine,
    engineLabel: engine === "ffmpeg" ? "FFmpeg" : engine === "image" ? "Rust image" : engine === "text" ? "Rust texte/PDF" : "Moteur externe",
    engineAvailable: engine !== "external",
    availability: engine !== "external" ? "available" : "hidden",
    extension: format,
    extensions: [format],
    categoryId,
  };
}
