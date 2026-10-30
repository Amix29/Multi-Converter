import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api, createExportEntries, type ExportEntryV1, type ExportResult, type QualityProfile } from "../../lib/api";
import { t, translateBackendMessage, type LanguageCode } from "../../i18n";
import type { ExportKind, FileItem, NoticeTone, Step } from "../types";
import {
  conversionConcurrency,
  exportNoticeMessage,
  notifyConversionFinished,
  nativeCancellationJobs,
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
  const [qualityProfile, setQualityProfile] = useState<QualityProfile>("balanced");
  const [isConverting, setIsConverting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTempOutputCleaned, setIsTempOutputCleaned] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const wasConverting = useRef(false);
  const cancellationRequested = useRef(false);
  const batchLocked = useRef(false);
  const batchCompletion = useRef<Promise<void> | null>(null);
  const [exportedPaths, setExportedPaths] = useState<Set<string>>(() => new Set());

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

  async function resetAll() {
    if (batchLocked.current || isExporting) return;
    await cleanupCurrentTempFolder();
    options.setStep(1);
    options.setFiles([]);
    setOutputDir(null);
    setIsTempOutputCleaned(false);
    setIsConverting(false);
    setIsExporting(false);
    setIsCancelling(false);
    cancellationRequested.current = false;
    setExportResult(null);
    setExportedPaths(new Set());
  }

  async function startConversion() {
    return withBatchLock(async () => {
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
    await performConversionBatch(jobs, true);
    });
  }

  async function retryFile(fileId: string) {
    if (isConverting) return;
    const file = options.files.find((item) => item.id === fileId);
    if (!file || file.status !== "error" || !file.selectedFormat) return;
    await withBatchLock(() => performConversionBatch([file], false));
  }

  async function retryFailedConversions() {
    if (isConverting) return;
    const jobs = options.files.filter((file) => file.status === "error" && file.selectedFormat);
    if (jobs.length) await withBatchLock(() => performConversionBatch(jobs, false));
  }

  async function continueConversions() {
    if (isConverting) return;
    const jobs = options.files.filter((file) => file.selectedFormat && file.status !== "done" && file.status !== "unsupported");
    if (jobs.length) await withBatchLock(() => performConversionBatch(jobs, false));
  }

  async function withBatchLock(action: () => Promise<void>) {
    if (batchLocked.current) return;
    batchLocked.current = true;
    setIsConverting(true);
    const completion = action();
    batchCompletion.current = completion;
    try { await completion; }
    finally { batchLocked.current = false; batchCompletion.current = null; setIsConverting(false); }
  }

  async function performConversionBatch(jobs: FileItem[], resetExportState: boolean) {
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
    const replacedPaths = new Set(jobs.flatMap((job) => job.result?.outputPath ? [job.result.outputPath] : []));
    setExportedPaths((paths) => new Set([...paths].filter((value) => !replacedPaths.has(value))));
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
            qualityProfile,
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
    // Only jobs that have reached api.convert() exist in the native cancellation
    // registry. Queued jobs are cancelled locally by cancellationRequested.
    const activeJobs = nativeCancellationJobs(options.files);
    options.setFiles((items) => items.map((file) => file.selectedFormat && ["queued", "working"].includes(file.status)
      ? { ...file, status: "canceling", phase: "phase.canceling" }
      : file));
    await Promise.allSettled(activeJobs.map((file) => api.cancelConversion(file.jobId)));
  }

  async function finalizeSuccessfulExport(kind: ExportKind, result: ExportResult) {
    setExportResult(result);
    setExportedPaths((paths) => new Set([...paths, ...convertedExportPlan(options.files).paths]));
    options.showNotice("success", exportNoticeMessage(options.language, kind, result));
  }

  async function exportResults(
    kind: ExportKind,
    exporter: (paths: string[], entries: ExportEntryV1[]) => Promise<ExportResult | null>,
  ) {
    const { entries, paths } = convertedExportPlan(options.files);
    if (!paths.length || isConverting || isExporting || isTempOutputCleaned) return;
    setIsExporting(true);
    options.showNotice("info", kind === "downloads" ? t(options.language, "notice.exportDownloadsPreparing") : t(options.language, "notice.exportFolderChoosing"));
    try {
      const result = await exporter(paths, entries);
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
    const { entries, paths } = convertedExportPlan(options.files);
    if (!paths.length || isConverting || isExporting || isTempOutputCleaned) return;
    setIsExporting(true);
    options.showNotice("info", t(options.language, "notice.exportFolderChoosing"));
    try {
      const destinationDir = await api.pickOutputFolder();
      if (!destinationDir) {
        options.showNotice("info", t(options.language, "notice.exportCancelled"));
        return;
      }
      await finalizeSuccessfulExport("folder", await api.exportToFolder(paths, destinationDir, outputDir, entries));
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
    hasUnexportedResults: options.files.some((file) => file.result?.outputPath && !exportedPaths.has(file.result.outputPath)),
    async cancelAndWait() {
      await cancelConversions();
      await batchCompletion.current;
    },
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
    qualityProfile,
    setQualityProfile,
    resetAll,
    retryFailedConversions,
    retryFile,
    revealCurrentFolder,
    startConversion,
  };
}

function convertedExportPlan(files: FileItem[]) {
  const results = files.flatMap((file) => file.status === "done" && file.result?.outputPath
    ? [{ outputPath: file.result.outputPath, source: file }]
    : []);
  return {
    entries: createExportEntries(results),
    paths: results.map(({ outputPath }) => outputPath),
  };
}
