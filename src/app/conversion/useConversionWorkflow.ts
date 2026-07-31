import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api, type ExportResult } from "../../lib/api";
import { t, translateBackendMessage, type LanguageCode } from "../../i18n";
import type { ExportKind, FileItem, NoticeTone, Step } from "../types";
import {
  clamp,
  conversionConcurrency,
  exportNoticeMessage,
  getConvertedOutputPaths,
  notifyConversionFinished,
  runWithConcurrency,
  shouldConvertFile,
  shouldReconvertCleanedResult,
} from "./model";

export function useConversionWorkflow(options: {
  files: FileItem[];
  language: LanguageCode;
  notificationsEnabled: boolean;
  setFiles: Dispatch<SetStateAction<FileItem[]>>;
  setStep: Dispatch<SetStateAction<Step>>;
  showNotice(tone: NoticeTone, message: string): void;
}) {
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTempOutputCleaned, setIsTempOutputCleaned] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const wasConverting = useRef(false);
  const cancellationRequested = useRef(false);

  useEffect(() => {
    if (isConverting) {
      wasConverting.current = true;
      return;
    }
    if (!wasConverting.current) return;
    wasConverting.current = false;
    const selectedFiles = options.files.filter((file) => file.selectedFormat);
    const allFinished = selectedFiles.length > 0 && selectedFiles.every((file) => file.status === "done" || file.status === "error" || file.status === "canceled");
    if (!allFinished) return;
    void notifyConversionFinished(options.language, selectedFiles.some((file) => file.status === "error"), options.notificationsEnabled);
  }, [isConverting, options.files, options.language, options.notificationsEnabled]);

  useEffect(() => {
    if (!isConverting) return;
    const interval = window.setInterval(() => {
      options.setFiles((items) => items.map((file) => {
        if (file.status === "queued") return { ...file, progress: Math.max(file.progress, 5) };
        if (file.status !== "working") return file;
        const current = clamp(file.progress, 0, 100);
        const optimisticCap = file.size > 700 * 1024 * 1024 ? 78 : file.size > 120 * 1024 * 1024 ? 88 : 94;
        if (current >= optimisticCap) return file;
        const sizeFactor = file.size > 700 * 1024 * 1024 ? 0.55 : file.size > 120 * 1024 * 1024 ? 0.75 : 1;
        const pace = current < 45 ? 2.8 : current < 75 ? 1.7 : 0.65;
        return { ...file, progress: Math.max(current, Math.min(optimisticCap, current + pace * sizeFactor)) };
      }));
    }, 900);
    return () => window.clearInterval(interval);
  }, [isConverting, options.setFiles]);

  async function cleanupCurrentTempFolder(cleanupOptions: { notifyOnError?: boolean } = {}) {
    if (!outputDir || isTempOutputCleaned) return false;
    try {
      const removed = await api.cleanupTempOutputFolder(outputDir);
      if (removed) setIsTempOutputCleaned(true);
      return removed;
    } catch (error) {
      if (cleanupOptions.notifyOnError === false) console.warn("Temporary cleanup failed", error);
      else options.showNotice("error", t(options.language, "notice.tempCleanupFailed"));
      return false;
    }
  }

  function resetAll() {
    void cleanupCurrentTempFolder();
    options.setStep(1);
    options.setFiles([]);
    setOutputDir(null);
    setIsTempOutputCleaned(false);
    setIsConverting(false);
    setIsExporting(false);
    setIsCancelling(false);
    cancellationRequested.current = false;
    setExportResult(null);
  }

  async function startConversion() {
    if (isConverting) return;
    if (!options.files.some((file) => file.selectedFormat && file.status !== "unsupported")) return;
    const replacesExistingOutputDir = Boolean(outputDir);
    if (outputDir && !isTempOutputCleaned) await cleanupCurrentTempFolder();
    const tempWasCleanedForBatch = replacesExistingOutputDir || isTempOutputCleaned;
    const jobs = options.files.filter((file) => shouldConvertFile(file) || shouldReconvertCleanedResult(file, tempWasCleanedForBatch));
    if (!jobs.length) {
      setExportResult(null);
      options.setStep(3);
      return;
    }
    await runConversionBatch(jobs, true);
  }

  async function retryFile(fileId: string) {
    if (isConverting) return;
    const file = options.files.find((item) => item.id === fileId);
    if (!file || file.status !== "error" || !file.selectedFormat) return;
    await runConversionBatch([file], false);
  }

  async function retryFailedConversions() {
    if (isConverting) return;
    const jobs = options.files.filter((file) => file.status === "error" && file.selectedFormat);
    if (jobs.length) await runConversionBatch(jobs, false);
  }

  async function continueConversions() {
    if (isConverting) return;
    const jobs = options.files.filter((file) => file.selectedFormat && file.status !== "done" && file.status !== "unsupported");
    if (jobs.length) await runConversionBatch(jobs, false);
  }

  async function runConversionBatch(jobs: FileItem[], resetExportState: boolean) {
    let targetOutputDir: string;
    try {
      targetOutputDir = !resetExportState && outputDir && !isTempOutputCleaned ? outputDir : await api.createTempOutputFolder();
    } catch (error) {
      options.showNotice("error", translateBackendMessage(options.language, error instanceof Error ? error.message : String(error || "")));
      return;
    }
    if (!targetOutputDir) return;

    setOutputDir(targetOutputDir);
    setIsTempOutputCleaned(false);
    setExportResult(null);
    setIsConverting(true);
    setIsCancelling(false);
    cancellationRequested.current = false;
    options.setStep(3);
    const concurrency = conversionConcurrency(jobs);
    const jobIds = new Map(jobs.map((job) => [job.id, crypto.randomUUID()]));
    options.setFiles((items) => items.map((file) => {
      const jobId = jobIds.get(file.id);
      return jobId ? { ...file, progress: 0, phase: "phase.waiting", status: "queued", result: null, convertedFormat: null, error: null, jobId } : file;
    }));

    try {
      await runWithConcurrency(jobs, concurrency, async (file) => {
        const jobId = jobIds.get(file.id) ?? crypto.randomUUID();
        if (cancellationRequested.current) {
          options.setFiles((items) => items.map((item) => item.id === file.id ? { ...item, status: "canceled", phase: "phase.canceled", jobId } : item));
          return;
        }
        options.setFiles((items) => items.map((item) => item.id === file.id ? { ...item, status: "working", phase: "phase.starting", jobId } : item));
        try {
          const result = await api.convert({
            id: jobId,
            inputPath: file.path,
            targetFormat: file.selectedFormat as string,
            outputDir: targetOutputDir,
            batchConcurrency: concurrency,
          });
          options.setFiles((items) => items.map((item) => item.id === file.id
            ? { ...item, result, convertedFormat: file.selectedFormat, progress: 100, phase: "phase.done", status: "done", error: null }
            : item));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || "phase.conversion");
          const canceled = message.includes("Conversion annulée") || message.includes("Conversion canceled");
          options.setFiles((items) => items.map((item) => item.id === file.id
            ? { ...item, result: null, convertedFormat: null, error: message, phase: canceled ? "phase.canceled" : message, status: canceled ? "canceled" : "error" }
            : item));
        }
      });
    } finally {
      setIsConverting(false);
      setIsCancelling(false);
    }
  }

  async function cancelConversions() {
    if (!isConverting || isCancelling) return;
    cancellationRequested.current = true;
    setIsCancelling(true);
    const activeJobs = options.files.filter((file) => file.selectedFormat && ["queued", "working"].includes(file.status));
    options.setFiles((items) => items.map((file) => file.selectedFormat && ["queued", "working"].includes(file.status)
      ? { ...file, status: "canceling", phase: "phase.canceling" }
      : file));
    await Promise.allSettled(activeJobs.map((file) => api.cancelConversion(file.jobId)));
  }

  async function finalizeSuccessfulExport(kind: ExportKind, result: ExportResult) {
    setExportResult(result);
    options.showNotice("success", exportNoticeMessage(options.language, kind, result));
    await cleanupCurrentTempFolder({ notifyOnError: false });
  }

  async function exportResults(kind: ExportKind, exporter: (paths: string[]) => Promise<ExportResult | null>) {
    const paths = getConvertedOutputPaths(options.files);
    if (!paths.length || isConverting || isExporting || isTempOutputCleaned) return;
    setIsExporting(true);
    options.showNotice("info", kind === "downloads" ? t(options.language, "notice.exportDownloadsPreparing") : t(options.language, "notice.exportFolderChoosing"));
    try {
      const result = await exporter(paths);
      if (!result) {
        options.showNotice("info", t(options.language, "notice.exportCancelled"));
        return;
      }
      await finalizeSuccessfulExport(kind, result);
    } catch (error) {
      options.showNotice("error", translateBackendMessage(options.language, error instanceof Error ? error.message : String(error || "")));
    } finally {
      setIsExporting(false);
    }
  }

  async function exportResultsToFolder() {
    const paths = getConvertedOutputPaths(options.files);
    if (!paths.length || isConverting || isExporting || isTempOutputCleaned) return;
    setIsExporting(true);
    options.showNotice("info", t(options.language, "notice.exportFolderChoosing"));
    try {
      const destinationDir = await api.pickOutputFolder();
      if (!destinationDir) {
        options.showNotice("info", t(options.language, "notice.exportCancelled"));
        return;
      }
      await finalizeSuccessfulExport("folder", await api.exportToFolder(paths, destinationDir, outputDir));
    } catch (error) {
      options.showNotice("error", translateBackendMessage(options.language, error instanceof Error ? error.message : String(error || "")));
    } finally {
      setIsExporting(false);
    }
  }

  async function revealCurrentFolder() {
    if (!exportResult) return;
    const target = exportResult.files.length === 1 ? exportResult.files[0] : exportResult.destinationDir;
    try {
      await api.revealFile(target);
    } catch {
      options.showNotice("error", t(options.language, "notice.revealFailed"));
    }
  }

  return {
    cancelConversions,
    continueConversions,
    exportResult,
    exportResults,
    exportResultsToFolder,
    isCancelling,
    isConverting,
    isExporting,
    isTempOutputCleaned,
    outputDir,
    resetAll,
    retryFailedConversions,
    retryFile,
    revealCurrentFolder,
    startConversion,
  };
}
