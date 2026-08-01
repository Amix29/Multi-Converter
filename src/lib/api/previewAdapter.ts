import type { EditorAssetRef, MultiConverterApi, OcrProgressV1, ProgressPayload } from "./contracts";
import {
  createPreviewEditorState,
  makePreviewEditorDocument,
  makePreviewFile,
  PREVIEW_ROOT,
  PREVIEW_TEMP,
  previewExtension,
  removePreviewDocument,
  upsertPreviewDocument,
} from "./previewFixtures";

export function createPreviewApi(): MultiConverterApi {
  const previewParams = new URLSearchParams(window.location.search);
  const listeners = new Set<(payload: ProgressPayload) => void>();
  const ocrListeners = new Set<(payload: OcrProgressV1) => void>();
  const previewState = createPreviewEditorState(previewParams.get("mockRecentDocuments") === "1");
  let previewDocuments = previewState.documents;
  const previewEditorAssets = previewState.assets;
  const canceledJobs = new Set<string>();
  let shouldFailNextConversion = previewParams.get("mockConversionFailure") === "once";
  let shouldFailRecentRefresh = false;

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
        envDir: `${PREVIEW_ROOT}\\AppData\\Local\\Multi-Converter\\tool-env`,
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
      const paths = [
        `${PREVIEW_ROOT}\\Documents\\test.md`,
        `${PREVIEW_ROOT}\\Pictures\\Grand Theft Auto V Screenshot 2026.01.05 - 18.43.12.84.png`,
        `${PREVIEW_ROOT}\\Pictures\\Red Dead Redemption 2 Screenshot 2026.01.07 - 21.18.44.02.png`,
        `${PREVIEW_ROOT}\\Videos\\Enregistrement de l'écran 2025-10-13 184512.mp4`,
        `${PREVIEW_ROOT}\\Videos\\Enregistrement de l'écran 2025-11-19 190508.mov`,
        `${PREVIEW_ROOT}\\Videos\\Enregistrement de l'écran 2025-11-19 190508 version très longue pour vérifier le découpage.mp4`,
        `${PREVIEW_ROOT}\\Audio\\Capture audio réunion client avec un nom beaucoup trop long.wav`,
      ];
      if (previewParams.get("mockOcrImage") === "1") return paths.slice(1, 2);
      return previewParams.get("mockSingleFile") === "1" ? paths.slice(0, 1) : paths;
    },
    async pickOutputFolder() {
      return `${PREVIEW_ROOT}\\Documents\\Conversions`;
    },
    async createTempOutputFolder() {
      return PREVIEW_TEMP;
    },
    async cleanupTempOutputFolder() {
      return true;
    },
    async exportToDownloads(filePaths) {
      return {
        destinationDir: `${PREVIEW_ROOT}\\Downloads\\Conversion`,
        files: filePaths.map((filePath) => filePath.replace(PREVIEW_TEMP, `${PREVIEW_ROOT}\\Downloads\\Conversion`)),
        destinationCreated: false,
      };
    },
    async exportToFolder(filePaths, destinationDir) {
      return {
        destinationDir,
        files: filePaths.map((filePath) => filePath.replace(PREVIEW_TEMP, destinationDir)),
        destinationCreated: false,
      };
    },
    async describePaths(paths) {
      return paths.map((filePath) => {
        const name = filePath.split(/[\\/]/).pop() || "fichier.mp4";
        const extension = previewExtension(name);
        return makePreviewFile(name, extension, 42865012);
      });
    },
    async saveClipboardFiles(files) {
      return files.map((file, index) => `${PREVIEW_ROOT}\\Desktop\\clipboard-${index + 1}-${file.name || "file.txt"}`);
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
        await new Promise((resolve) => window.setTimeout(resolve, previewParams.get("mockSlowConversion") === "1" ? 300 : 80));
        if (canceledJobs.delete(job.id)) throw new Error("Conversion annulée");
        listeners.forEach((listener) => listener({ jobId: job.id, progress, phase }));
      }
      if (shouldFailNextConversion) {
        shouldFailNextConversion = false;
        throw new Error("Échec de conversion simulé");
      }
      return {
        outputPath: `${job.outputDir}\\${job.id}\\resultat.${job.targetFormat}`,
      };
    },
    async cancelConversion(jobId) {
      canceledJobs.add(jobId);
      return true;
    },
    async getOcrRuntimeInfo() {
      return {
        schemaVersion: 1,
        available: true,
        model: "PP-OCRv6_medium",
        runtime: "official",
        runtimeVersion: "preview-fixture",
        provider: "cpu",
        providerFallbackReason: null,
        languages: ["fr", "en", "es", "de", "it", "pt", "ja"],
      };
    },
    async recognizeImage(_path, jobId) {
      const phases: OcrProgressV1["phase"][] = ["starting", "preparing", "recognizing", "normalizing", "completed"];
      for (const [index, phase] of phases.entries()) {
        await new Promise((resolve) => window.setTimeout(resolve, previewParams.get("mockSlowOcr") === "1" ? 300 : 80));
        if (canceledJobs.delete(jobId)) throw new Error("OCR annulé");
        const payload: OcrProgressV1 = {
          schemaVersion: 1,
          jobId,
          progress: Math.round((index / (phases.length - 1)) * 100),
          phase,
          pageNumber: 1,
          pageCount: 1,
        };
        ocrListeners.forEach((listener) => listener(payload));
      }
      const text = previewParams.get("mockEmptyOcr") === "1"
        ? ""
        : "Texte reconnu localement dans l’image de démonstration.";
      return {
        schemaVersion: 1,
        jobId,
        text,
        pages: [{
          pageNumber: 1,
          source: "ocr",
          width: 1600,
          height: 900,
          text,
          blocks: text ? [{ text, confidence: 0.98, boundingBox: { x: 120, y: 180, width: 920, height: 72 } }] : [],
          warnings: [],
        }],
        warnings: [],
      };
    },
    async cancelOcr(jobId) {
      canceledJobs.add(jobId);
      return true;
    },
    async onOcrProgress(callback) {
      ocrListeners.add(callback);
      return () => ocrListeners.delete(callback);
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
      previewDocuments = upsertPreviewDocument(previewDocuments, document);
      return document;
    },
    async editorListRecentDocuments() {
      if (shouldFailRecentRefresh) {
        shouldFailRecentRefresh = false;
        throw new Error("Rafraîchissement des documents récents simulé en échec.");
      }
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
      previewDocuments = upsertPreviewDocument(previewDocuments, saved);
      if (previewParams.get("mockRecentRefreshFailure") === "once") shouldFailRecentRefresh = true;
      return saved;
    },
    async editorDeleteDraft(id) {
      previewDocuments = removePreviewDocument(previewDocuments, id);
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
        path: path || `${PREVIEW_ROOT}\\Documents\\Rapport annuel.docx`,
        format: "docx",
        size: 84214,
        modifiedAt: new Date().toISOString(),
      };
      previewDocuments = upsertPreviewDocument(previewDocuments, document);
      return {
        document,
        transientContent: {
          kind: "html",
          value: previewParams.get("mockMaliciousHtml") === "1"
            ? '<h1>Rapport annuel</h1><script>window.__MC_ACTIVE_HTML__ = true</script><iframe src="https://example.com"></iframe><form><input autofocus></form><p onclick="window.__MC_ACTIVE_HTML__ = true" style="color: #191919; background-image: url(https://example.com/pixel)">Contenu sûr conservé</p><a href="javascript:alert(1)" target="_blank">Lien dangereux</a><a href="https://example.com/reference" target="_blank" rel="opener">Lien sûr</a><img src="https://example.com/tracker.png" onerror="window.__MC_ACTIVE_HTML__ = true"><aside data-unsupported-object="true">Objet local non éditable</aside><table><tbody><tr><td colspan="999999999" rowspan="999999999" colwidth="999999999">Cellule bornée</td></tr></tbody></table>'
            : "<h1>Rapport annuel</h1><p>Ce document reste entièrement local et peut être modifié avec Multi-Converter.</p><h2>Résumé</h2><p>Ajoutez votre contenu ici.</p>",
        },
      };
    },
    async editorSaveDocument(request) {
      const path = request.document.source?.path || `${PREVIEW_ROOT}\\Documents\\${request.document.title}.${request.targetFormat}`;
      return { path, document: await this.editorSaveDraft(request.document) };
    },
    async editorSaveAs(request) {
      const document = await this.editorSaveDraft(request.document);
      return { path: `${PREVIEW_ROOT}\\Documents\\${document.title}.${request.targetFormat}`, document };
    },
    async editorExportDocument(request) {
      const document = await this.editorSaveDraft(request.document);
      return { path: `${PREVIEW_ROOT}\\Downloads\\${document.title}.${request.targetFormat}`, document };
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
