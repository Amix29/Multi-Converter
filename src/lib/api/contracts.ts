import type { UnlistenFn } from "@tauri-apps/api/event";

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
    format: EditorFormat;
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

export type GeneratedWriteMode = "save" | "saveAs" | "export";

export interface GeneratedWriteStartRequest {
  request: EditorWriteRequest;
  mode: GeneratedWriteMode;
}

export interface GeneratedWriteSessionInfo {
  sessionId: string;
  chunkSize: number;
}

export interface EditorAssetData {
  bytes: number[];
  mimeType: string;
}

export interface EditorAssetStoreResult {
  asset: EditorAssetRef;
  document: EditorDocumentV1;
}

export interface EditorSystemFontCatalogV1 {
  schemaVersion: 1;
  defaultFamily: string;
  families: string[];
}

export interface EditorFontEmbeddingPolicyV1 {
  schemaVersion: 1;
  requestedFamily: string;
  resolvedFamily: string;
  permission: "installable" | "editable" | "preview-print" | "restricted" | "bitmap-only" | "unknown";
  canEmbedPdf: boolean;
  substituted: boolean;
  /** Optional for compatibility with pre-V1.0.7 native adapters. */
  requestedCanEmbedPdf?: boolean;
  /** Optional for compatibility with pre-V1.0.7 native adapters. */
  requestedCoversText?: boolean;
  /** True when OS/2.fsType bit 0x0100 forbids subsetting. */
  noSubsetting?: boolean;
  warning?: string | null;
}

export interface EditorFontFaceV1 {
  bold: boolean;
  italic: boolean;
}

export interface PdfPermissionV1 {
  schemaVersion: 1;
  canModify: boolean;
  canAnnotate: boolean;
  canFillForms: boolean;
  canAssemble: boolean;
  docMdpLevel: number | null;
}

export interface PdfSignatureInfoV1 {
  schemaVersion: 1;
  index: number;
  docMdpLevel: number | null;
  reason: string | null;
  signingDate: string | null;
}

export interface PdfBoundsV1 {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfObjectV1 {
  schemaVersion: 1;
  objectId: string;
  kind: string;
  bounds: PdfBoundsV1;
  editable: boolean;
  text: string | null;
  fontFamily: string | null;
  fontSizePoints: number | null;
  fillColor: string | null;
  strokeColor: string | null;
  rotationDegrees: number;
  activeContent: boolean;
}

export type PdfEditOperationV1 =
  | "setText"
  | "transformObject"
  | "setFillColor"
  | "setStrokeColor"
  | "setAnnotationContents"
  | "setFormValue"
  | "deleteObject"
  | "moveObjectForward"
  | "moveObjectBackward"
  | "bringObjectFront"
  | "sendObjectBack"
  | "insertImage"
  | "replaceImage"
  | "insertPage"
  | "duplicatePage"
  | "movePage"
  | "createAnnotation"
  | "deleteAnnotation"
  | "addOcrTextLayer"
  | "rotatePage"
  | "deletePage";

export interface PdfOcrTextBlockV1 {
  text: string;
  bounds: PdfBoundsV1;
  fontSizePoints: number | null;
}

export interface PdfEditPatchV1 {
  schemaVersion: 1;
  operation: PdfEditOperationV1;
  pageNumber: number;
  objectId: string | null;
  text: string | null;
  matrix: [number, number, number, number, number, number] | null;
  color: string | null;
  rotationDegrees: number | null;
  bounds: PdfBoundsV1 | null;
  imagePath: string | null;
  annotationType: "text" | "freeText" | "square" | null;
  targetPageNumber: number | null;
  widthPoints: number | null;
  heightPoints: number | null;
  ocrBlocks: PdfOcrTextBlockV1[] | null;
}

export interface PdfPageV1 {
  schemaVersion: 1;
  pageNumber: number;
  widthPoints: number;
  heightPoints: number;
  rotationDegrees: number;
  objects: PdfObjectV1[];
}

export interface PdfEditorSessionV1 {
  schemaVersion: 1;
  sessionId: string;
  sourceSha256: string;
  sourceName: string;
  pageCount: number;
  contentKind: "digital" | "mixed" | "scanned" | "digitized";
  permissions: PdfPermissionV1;
  signatures: PdfSignatureInfoV1[];
  activeContentPolicy: string;
}

export interface PdfPageWindowV1 {
  schemaVersion: 1;
  sourceSha256: string;
  pageCount: number;
  pages: PdfPageV1[];
}

export interface PdfRenderedPageV1 {
  schemaVersion: 1;
  sourceSha256: string;
  pageNumber: number;
  mimeType: string;
  bytes: number[];
  widthPoints: number;
  heightPoints: number;
}

export interface PdfSaveResultV1 {
  schemaVersion: 1;
  sourceSha256: string;
  destinationPath: string;
  appliedPatches: number;
  hadExistingSignatures: boolean;
  signatureValidity: "not-cryptographically-checked";
  rebasedSession: PdfEditorSessionV1;
}

export interface PdfEditableCopyResultV1 {
  schemaVersion: 1;
  sourceSha256: string;
  destinationPath: string;
  removedSignatureStructures: number;
  rebasedSession: PdfEditorSessionV1;
}

export interface PdfDigitizeResultV1 {
  schemaVersion: 1;
  sourceSha256: string;
  attemptedPages: number;
  recognizedPages: number;
  rebasedSession: PdfEditorSessionV1;
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
  importOrigin?: ImportOriginV1 | null;
}

export interface ImportOriginV1 {
  kind: "file" | "folder";
  rootId: string;
  rootName: string;
  relativePath: string;
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

export interface ExportEntryV1 {
  outputPath: string;
  relativePath: string;
  rootId?: string | null;
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

export interface OcrRuntimeInfoV1 {
  schemaVersion: 1;
  available: boolean;
  model: "PP-OCRv6_medium";
  runtime: "official" | "native";
  runtimeVersion: string;
  provider: "cpu" | "directml" | "coreml" | "openvino";
  providerFallbackReason?: string | null;
  languages: string[];
}

export interface OcrTextBlockV1 {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface OcrWarningV1 {
  code: string;
  message: string;
  pageNumber?: number | null;
}

export interface OcrPageResultV1 {
  pageNumber: number;
  source: "native" | "ocr" | "native-fallback";
  width: number;
  height: number;
  text: string;
  blocks: OcrTextBlockV1[];
  warnings: OcrWarningV1[];
}

export interface OcrDocumentResultV1 {
  schemaVersion: 1;
  jobId: string;
  text: string;
  pages: OcrPageResultV1[];
  warnings: OcrWarningV1[];
}

export interface OcrProgressV1 {
  schemaVersion: 1;
  jobId: string;
  progress: number;
  phase:
    | "starting"
    | "preparing"
    | "preparing-image"
    | "extracting-runtime"
    | "verifying-runtime"
    | "verifying-models"
    | "inspecting"
    | "native-text"
    | "recognizing"
    | "normalizing"
    | "completed";
  pageNumber?: number | null;
  pageCount?: number | null;
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
  exportToDownloads(filePaths: string[], outputDir?: string | null, entries?: ExportEntryV1[] | null): Promise<ExportResult>;
  exportToFolder(filePaths: string[], destinationDir: string, outputDir?: string | null, entries?: ExportEntryV1[] | null): Promise<ExportResult>;
  describePaths(paths: string[]): Promise<FileDescription[]>;
  saveClipboardFiles(files: ClipboardFileInput[]): Promise<string[]>;
  convert(job: ConversionJob): Promise<ConversionResult>;
  cancelConversion(jobId: string): Promise<boolean>;
  getOcrRuntimeInfo(): Promise<OcrRuntimeInfoV1>;
  recognizeImage(path: string, jobId: string): Promise<OcrDocumentResultV1>;
  cancelOcr(jobId: string): Promise<boolean>;
  onOcrProgress(callback: (payload: OcrProgressV1) => void): Promise<UnlistenFn>;
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
  editorBeginGeneratedWrite(payload: GeneratedWriteStartRequest): Promise<GeneratedWriteSessionInfo | null>;
  editorAppendGeneratedWrite(sessionId: string, offset: number, bytes: number[]): Promise<number>;
  editorCommitGeneratedWrite(sessionId: string): Promise<EditorWriteResult>;
  editorAbortGeneratedWrite(sessionId: string): Promise<boolean>;
  editorReadAsset(documentId: string, assetId: string): Promise<EditorAssetData>;
  editorStoreAsset(documentId: string, name: string, mimeType: string, bytes: number[]): Promise<EditorAssetStoreResult>;
  editorImportAsset(documentId: string, path?: string | null): Promise<EditorAssetStoreResult | null>;
  editorRemoveAsset(documentId: string, assetId: string): Promise<EditorDocumentV1>;
  editorPruneAssets(documentId: string): Promise<EditorDocumentV1>;
  editorListSystemFonts(options?: { retry?: boolean }): Promise<EditorSystemFontCatalogV1>;
  editorInspectFontEmbedding(family: string, text: string, face?: EditorFontFaceV1): Promise<EditorFontEmbeddingPolicyV1>;
  pdfEditorOpen(sourcePath: string, password?: string | null): Promise<PdfEditorSessionV1>;
  pdfEditorInspectPages(sessionId: string, sourceSha256: string, pageStart: number, pageCount: number): Promise<PdfPageWindowV1>;
  pdfEditorRenderPage(sessionId: string, sourceSha256: string, pageNumber: number, scale?: number | null): Promise<PdfRenderedPageV1>;
  pdfEditorRecognizePage(sessionId: string, sourceSha256: string, pageNumber: number, jobId: string): Promise<OcrDocumentResultV1>;
  pdfEditorDigitize(sessionId: string, sourceSha256: string, patches: PdfEditPatchV1[], attemptedPages: number[]): Promise<PdfDigitizeResultV1>;
  pdfEditorSaveAs(sessionId: string, sourceSha256: string, patches: PdfEditPatchV1[], destinationPath?: string | null): Promise<PdfSaveResultV1 | null>;
  pdfEditorCreateEditableCopy(sessionId: string, sourceSha256: string, destinationPath?: string | null): Promise<PdfEditableCopyResultV1 | null>;
  pdfEditorClose(sessionId: string): Promise<boolean>;
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
