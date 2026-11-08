import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  DependencyBootstrap,
  EngineStatus,
  ExportResult,
  ImportBatchResult,
  MultiConverterApi,
  OcrDocumentResultV1,
  OcrProgressV1,
  OcrRuntimeInfoV1,
  ProgressPayload,
  ConversionResult,
  RecoveryState,
} from "./contracts";

export function createTauriApi(): MultiConverterApi {
  return {
    bootstrapDependencies: () => invoke<DependencyBootstrap>("bootstrap_dependencies"),
    refreshEngineDiagnostics: () => invoke<DependencyBootstrap>("bootstrap_dependencies"),
    pickFilePaths: () => invoke<string[]>("pick_file_paths"),
    pickOutputFolder: () => invoke<string | null>("pick_output_folder"),
    createTempOutputFolder: () => invoke<string>("create_temp_output_folder"),
    cleanupTempOutputFolder: (folder) => invoke<boolean>("cleanup_temp_output_folder", { folder }),
    exportToDownloads: (filePaths, outputDir, entries) =>
      invoke<ExportResult>("export_to_downloads", { filePaths, outputDir, entries: entries ?? null }),
    exportToFolder: (filePaths, destinationDir, outputDir, entries) =>
      invoke<ExportResult>("export_to_folder", { filePaths, destinationDir, outputDir, entries: entries ?? null }),
    exportBatchReport: (outputDir, destinationDir, rows) =>
      invoke<ExportResult>("export_batch_report", { outputDir, destinationDir, rows }),
    loadBatchRecovery: () => invoke<RecoveryState>("load_batch_recovery"),
    setBatchRecoveryEnabled: (enabled) => invoke<RecoveryState>("set_batch_recovery_enabled", { enabled }),
    saveBatchRecovery: (plan) => invoke<number>("save_batch_recovery", { plan }),
    clearBatchRecovery: () => invoke<boolean>("clear_batch_recovery"),
    describePaths: (paths) => invoke<ImportBatchResult>("describe_paths", { paths }),
    saveClipboardFiles: (files) => invoke<string[]>("save_clipboard_files", { files }),
    convert: (job) => invoke<ConversionResult>("start_conversion", { job }),
    cancelConversion: (jobId) => invoke<boolean>("cancel_conversion", { jobId }),
    getOcrRuntimeInfo: () => invoke<OcrRuntimeInfoV1>("get_ocr_runtime_info"),
    recognizeImage: (path, jobId) => invoke<OcrDocumentResultV1>("recognize_image", { path, jobId }),
    cancelOcr: (jobId) => invoke<boolean>("cancel_ocr", { jobId }),
    onOcrProgress: async (callback) =>
      listen<OcrProgressV1>("ocr-progress", (event) => callback(event.payload)),
    revealFile: (filePath) => invoke<boolean>("reveal_file", { filePath }),
    openExternalUrl: (url) => invoke<boolean>("open_external_url", { url }),
    engineStatuses: () => invoke<EngineStatus[]>("engine_statuses"),
    onProgress: async (callback) => listen<ProgressPayload>("convert-progress", (event) => callback(event.payload)),
    onFileDrop: async (callback) =>
      listen<{ paths?: string[] }>("tauri://drag-drop", (event) => {
        const paths = event.payload?.paths ?? [];
        if (paths.length) callback(paths);
      }),
  };
}
