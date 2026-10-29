import type { ExportEntryV1, MultiConverterApi, OcrProgressV1, ProgressPayload } from "./contracts";
import {
  makePreviewFile,
  PREVIEW_ROOT,
  PREVIEW_TEMP,
  previewExtension,
} from "./previewFixtures";

export function createPreviewApi(): MultiConverterApi {
  const previewParams = new URLSearchParams(window.location.search);
  const listeners = new Set<(payload: ProgressPayload) => void>();
  const ocrListeners = new Set<(payload: OcrProgressV1) => void>();
  const canceledJobs = new Set<string>();
  let shouldFailNextConversion = previewParams.get("mockConversionFailure") === "once";

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
      const largeBatchSize = Math.min(2_000, Math.max(0, Math.floor(Number(previewParams.get("mockLargeBatch")) || 0)));
      if (largeBatchSize > 0) {
        return Array.from(
          { length: largeBatchSize },
          (_, index) => `${PREVIEW_ROOT}\\Pictures\\conversion-${String(index + 1).padStart(4, "0")}.png`,
        );
      }
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
      if (previewParams.get("mockUnsupportedFiles") === "1") {
        return [...paths.slice(0, 2), `${PREVIEW_ROOT}\\Documents\\archive.non-supported`];
      }
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
    async exportToDownloads(filePaths, _outputDir, entries) {
      const destinationDir = `${PREVIEW_ROOT}\\Downloads\\Conversion`;
      return {
        destinationDir,
        files: previewExportPaths(filePaths, destinationDir, entries),
        destinationCreated: false,
      };
    },
    async exportToFolder(filePaths, destinationDir, _outputDir, entries) {
      return {
        destinationDir,
        files: previewExportPaths(filePaths, destinationDir, entries),
        destinationCreated: false,
      };
    },
    async describePaths(paths) {
      return paths.map((filePath) => {
        const name = filePath.split(/[\\/]/).pop() || "fichier.mp4";
        const extension = previewExtension(name);
        const description = makePreviewFile(name, extension, 42865012);
        return previewParams.get("mockUnsupportedFiles") === "1" && name.endsWith(".non-supported")
          ? { ...description, category: "Inconnu", categoryId: "unknown", targets: [] }
          : description;
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

function previewExportPaths(
  filePaths: string[],
  destinationDir: string,
  entries?: ExportEntryV1[] | null,
) {
  if (entries?.length) {
    return entries.map((entry) => `${destinationDir}\\${entry.relativePath.replaceAll("/", "\\")}`);
  }
  return filePaths.map((filePath) => filePath.replace(PREVIEW_TEMP, destinationDir));
}
