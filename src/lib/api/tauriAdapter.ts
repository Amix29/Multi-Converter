import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  DependencyBootstrap,
  EditorAssetData,
  EditorAssetStoreResult,
  EditorDocumentSummary,
  EditorDocumentV1,
  EditorImportResult,
  EditorFontEmbeddingPolicyV1,
  GeneratedWriteSessionInfo,
  EditorSystemFontCatalogV1,
  EditorWriteResult,
  EngineStatus,
  ExportResult,
  FileDescription,
  MultiConverterApi,
  OcrDocumentResultV1,
  OcrProgressV1,
  OcrRuntimeInfoV1,
  PdfEditableCopyResultV1,
  PdfEditorSessionV1,
  PdfDigitizeResultV1,
  PdfPageWindowV1,
  PdfRenderedPageV1,
  PdfSaveResultV1,
  ProgressPayload,
  ConversionResult,
  WelcomeState,
} from "./contracts";

export function createTauriApi(): MultiConverterApi {
  return {
    welcomeState: () => invoke<WelcomeState>("welcome_state"),
    markWelcomeSeen: () => invoke<boolean>("mark_welcome_seen"),
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
    describePaths: (paths) => invoke<FileDescription[]>("describe_paths", { paths }),
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
    editorBeginGeneratedWrite: (payload) =>
      invoke<GeneratedWriteSessionInfo | null>("editor_begin_generated_write", { payload }),
    editorAppendGeneratedWrite: (sessionId, offset, bytes) =>
      invoke<number>("editor_append_generated_write", { sessionId, offset, bytes }),
    editorCommitGeneratedWrite: (sessionId) =>
      invoke<EditorWriteResult>("editor_commit_generated_write", { sessionId }),
    editorAbortGeneratedWrite: (sessionId) =>
      invoke<boolean>("editor_abort_generated_write", { sessionId }),
    editorReadAsset: (documentId, assetId) => invoke<EditorAssetData>("editor_read_asset", { documentId, assetId }),
    editorStoreAsset: (documentId, name, mimeType, bytes) =>
      invoke<EditorAssetStoreResult>("editor_store_asset", { documentId, name, mimeType, bytes }),
    editorImportAsset: (documentId, path) =>
      invoke<EditorAssetStoreResult | null>("editor_import_asset", { documentId, path: path ?? null }),
    editorRemoveAsset: (documentId, assetId) =>
      invoke<EditorDocumentV1>("editor_remove_asset", { documentId, assetId }),
    editorPruneAssets: (documentId) => invoke<EditorDocumentV1>("editor_prune_assets", { documentId }),
    editorListSystemFonts: () => invoke<EditorSystemFontCatalogV1>("editor_list_system_fonts"),
    editorInspectFontEmbedding: (family, text, face) =>
      invoke<EditorFontEmbeddingPolicyV1>("editor_inspect_font_embedding", {
        family,
        text,
        bold: face?.bold ?? false,
        italic: face?.italic ?? false,
      }),
    pdfEditorOpen: (sourcePath, password) =>
      invoke<PdfEditorSessionV1>("pdf_editor_open", { sourcePath, password: password ?? null }),
    pdfEditorInspectPages: (sessionId, sourceSha256, pageStart, pageCount) =>
      invoke<PdfPageWindowV1>("pdf_editor_inspect_pages", {
        sessionId,
        sourceSha256,
        pageStart,
        pageCount,
      }),
    pdfEditorRenderPage: (sessionId, sourceSha256, pageNumber, scale) =>
      invoke<PdfRenderedPageV1>("pdf_editor_render_page", {
        sessionId,
        sourceSha256,
        pageNumber,
        scale: scale ?? null,
      }),
    pdfEditorRecognizePage: (sessionId, sourceSha256, pageNumber, jobId) =>
      invoke<OcrDocumentResultV1>("pdf_editor_recognize_page", {
        sessionId,
        sourceSha256,
        pageNumber,
        jobId,
      }),
    pdfEditorDigitize: (sessionId, sourceSha256, patches, attemptedPages) =>
      invoke<PdfDigitizeResultV1>("pdf_editor_digitize", {
        sessionId,
        sourceSha256,
        patches,
        attemptedPages,
      }),
    pdfEditorSaveAs: (sessionId, sourceSha256, patches, destinationPath) =>
      invoke<PdfSaveResultV1 | null>("pdf_editor_save_as", {
        sessionId,
        sourceSha256,
        patches,
        destinationPath: destinationPath ?? null,
      }),
    pdfEditorCreateEditableCopy: (sessionId, sourceSha256, destinationPath) =>
      invoke<PdfEditableCopyResultV1 | null>("pdf_editor_create_editable_copy", {
        sessionId,
        sourceSha256,
        destinationPath: destinationPath ?? null,
      }),
    pdfEditorClose: (sessionId) => invoke<boolean>("pdf_editor_close", { sessionId }),
    engineStatuses: () => invoke<EngineStatus[]>("engine_statuses"),
    onProgress: async (callback) => listen<ProgressPayload>("convert-progress", (event) => callback(event.payload)),
    onFileDrop: async (callback) =>
      listen<{ paths?: string[] }>("tauri://drag-drop", (event) => {
        const paths = event.payload?.paths ?? [];
        if (paths.length) callback(paths);
      }),
  };
}
