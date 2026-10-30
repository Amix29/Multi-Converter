import type { UnlistenFn } from "@tauri-apps/api/event";

export type Engine = string;
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

export interface ImportBatchResult {
  files: FileDescription[];
  rejected: { path: string; message: string }[];
  truncated: boolean;
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
  qualityProfile?: QualityProfile;
}

export type QualityProfile = "compact" | "balanced" | "high";

export interface ConversionResult {
  outputPath: string;
  engine?: string;
  warnings?: { code: string; message: string; pageNumber?: number | null }[];
  inputBytes?: number;
  outputBytes?: number;
  durationMs?: number;
  qualityProfile?: QualityProfile;
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
  describePaths(paths: string[]): Promise<ImportBatchResult>;
  saveClipboardFiles(files: ClipboardFileInput[]): Promise<string[]>;
  convert(job: ConversionJob): Promise<ConversionResult>;
  cancelConversion(jobId: string): Promise<boolean>;
  getOcrRuntimeInfo(): Promise<OcrRuntimeInfoV1>;
  recognizeImage(path: string, jobId: string): Promise<OcrDocumentResultV1>;
  cancelOcr(jobId: string): Promise<boolean>;
  onOcrProgress(callback: (payload: OcrProgressV1) => void): Promise<UnlistenFn>;
  revealFile(filePath: string): Promise<boolean>;
  openExternalUrl(url: string): Promise<boolean>;
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
