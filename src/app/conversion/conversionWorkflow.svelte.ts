import { createOutputActions } from "./outputActions";

import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";
import { untrack } from "svelte";

import { api, type ExportResult, type QualityProfile } from "../../lib/api";
import { t, translateBackendMessage, type LanguageCode } from "../../i18n";
import type { FileItem, NoticeTone, Step } from "../types";

import { conversionConcurrency, notifyConversionFinished, nativeCancellationJobs, runWithConcurrency, shouldConvertFile, shouldReconvertCleanedResult } from "./model";

export function createConversionWorkflow(options: {
  files: FileItem[];
  language: LanguageCode;
  notificationsEnabled: boolean;
  setFiles: (value: FileItem[] | ((current: FileItem[]) => FileItem[])) => void;
  setStep: (value: Step | ((current: Step) => Step)) => void;
  showNotice(tone: NoticeTone, message: string): void;
  beforeBatch?(files: FileItem[], quality: QualityProfile): Promise<void>;
  onReset?(): Promise<void>;
}) {
  let outputDir = $state.raw<string | null>(null);
  const setOutputDir: StateSetter<typeof outputDir> = (value) => {
    outputDir = resolveStateUpdate(value, outputDir);
  };
  let qualityProfile = $state.raw<QualityProfile>("balanced");
  const setQualityProfile: StateSetter<typeof qualityProfile> = (value) => {
    qualityProfile = resolveStateUpdate(value, qualityProfile);
  };
  let isConverting = $state.raw(false);
  const setIsConverting: StateSetter<boolean> = (value) => {
    isConverting = resolveStateUpdate(value, isConverting);
  };
  let isCancelling = $state.raw(false);
  const setIsCancelling: StateSetter<boolean> = (value) => {
    isCancelling = resolveStateUpdate(value, isCancelling);
  };
  let isExporting = $state.raw(false);
  const setIsExporting: StateSetter<boolean> = (value) => {
    isExporting = resolveStateUpdate(value, isExporting);
  };
  let isTempOutputCleaned = $state.raw(false);
  const setIsTempOutputCleaned: StateSetter<boolean> = (value) => {
    isTempOutputCleaned = resolveStateUpdate(value, isTempOutputCleaned);
  };
  let exportResult = $state.raw<ExportResult | null>(null);
  const setExportResult: StateSetter<typeof exportResult> = (value) => {
    exportResult = resolveStateUpdate(value, exportResult);
  };
  const wasConverting = { current: false };
  const cancellationRequested = { current: false };
  const batchLocked = { current: false };
  const batchCompletion: { current: Promise<void> | null | null } = {
    current: null,
  };
  let exportedPaths = $state.raw<Set<string>>((() => new Set())());
  const setExportedPaths: StateSetter<typeof exportedPaths> = (value) => {
    exportedPaths = resolveStateUpdate(value, exportedPaths);
  };
  $effect(() => {
    void [
      isConverting,
      options.files,
      options.language,
      options.notificationsEnabled,
    ];
    return untrack(() => {
      if (isConverting) {
        wasConverting.current = true;
        return;
      }
      if (!wasConverting.current) return;
      wasConverting.current = false;
      const selectedFiles = options.files.filter((file) => file.selectedFormat);
      const allFinished =
        selectedFiles.length > 0 &&
        selectedFiles.every(
          (file) =>
            file.status === "done" ||
            file.status === "error" ||
            file.status === "canceled",
        );
      if (!allFinished) return;
      void notifyConversionFinished(
        options.language,
        selectedFiles.some((file) => file.status === "error"),
        options.notificationsEnabled,
      );
    });
  });
  async function cleanupCurrentTempFolder(
    cleanupOptions: {
      notifyOnError?: boolean;
    } = {},
  ) {
    if (!outputDir || isTempOutputCleaned) return false;
    try {
      const removed = await api.cleanupTempOutputFolder(outputDir);
      if (removed) setIsTempOutputCleaned(true);
      return removed;
    } catch (error) {
      if (cleanupOptions.notifyOnError === false)
        console.warn("Temporary cleanup failed", error);
      else
        options.showNotice(
          "error",
          t(options.language, "notice.tempCleanupFailed"),
        );
      return false;
    }
  }
  async function resetAll() {
    if (batchLocked.current || isExporting) return;
    await cleanupCurrentTempFolder();
    await options.onReset?.();
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
    if (isConverting) return;
    return withBatchLock(async () => {
      if (
        !options.files.some(
          (file) => file.selectedFormat && file.status !== "unsupported",
        )
      )
        return;
      const replacesExistingOutputDir = Boolean(outputDir);
      if (outputDir && !isTempOutputCleaned) await cleanupCurrentTempFolder();
      const tempWasCleanedForBatch =
        replacesExistingOutputDir || isTempOutputCleaned;
      const jobs = options.files.filter(
        (file) =>
          shouldConvertFile(file) ||
          shouldReconvertCleanedResult(file, tempWasCleanedForBatch),
      );
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
    const jobs = options.files.filter(
      (file) => file.status === "error" && file.selectedFormat,
    );
    if (jobs.length)
      await withBatchLock(() => performConversionBatch(jobs, false));
  }
  async function continueConversions() {
    if (isConverting) return;
    const jobs = options.files.filter(
      (file) =>
        file.selectedFormat &&
        file.status !== "done" &&
        file.status !== "unsupported",
    );
    if (jobs.length)
      await withBatchLock(() => performConversionBatch(jobs, false));
  }
  async function withBatchLock(action: () => Promise<void>) {
    if (batchLocked.current) return;
    batchLocked.current = true;
    cancellationRequested.current = false;
    setIsCancelling(false);
    setIsConverting(true);
    const completion = action();
    batchCompletion.current = completion;
    try {
      await completion;
    } finally {
      batchLocked.current = false;
      batchCompletion.current = null;
      setIsConverting(false);
    }
  }
  async function performConversionBatch(
    jobs: FileItem[],
    resetExportState: boolean,
  ) {
    if (resetExportState) await options.beforeBatch?.(jobs, qualityProfile);
    let targetOutputDir: string;
    try {
      targetOutputDir =
        !resetExportState && outputDir && !isTempOutputCleaned
          ? outputDir
          : await api.createTempOutputFolder();
    } catch (error) {
      options.showNotice(
        "error",
        translateBackendMessage(
          options.language,
          error instanceof Error ? error.message : String(error || ""),
        ),
      );
      return;
    }
    if (!targetOutputDir) return;
    setOutputDir(targetOutputDir);
    setIsTempOutputCleaned(false);
    setExportResult(null);
    setIsConverting(true);
    options.setStep(3);
    const concurrency = conversionConcurrency(jobs);
    const replacedPaths = new Set(
      jobs.flatMap((job) =>
        job.result?.outputPath ? [job.result.outputPath] : [],
      ),
    );
    setExportedPaths(
      (paths) =>
        new Set([...paths].filter((value) => !replacedPaths.has(value))),
    );
    const jobIds = new Map(jobs.map((job) => [job.id, crypto.randomUUID()]));
    options.setFiles((items) =>
      items.map((file) => {
        const jobId = jobIds.get(file.id);
        return jobId
          ? {
              ...file,
              progress: 0,
              phase: "phase.waiting",
              status: "queued",
              result: null,
              convertedFormat: null,
              error: null,
              jobId,
            }
          : file;
      }),
    );
    try {
      await runWithConcurrency(jobs, concurrency, async (file) => {
        const jobId = jobIds.get(file.id) ?? crypto.randomUUID();
        if (cancellationRequested.current) {
          options.setFiles((items) =>
            items.map((item) =>
              item.id === file.id
                ? {
                    ...item,
                    status: "canceled",
                    phase: "phase.canceled",
                    jobId,
                  }
                : item,
            ),
          );
          return;
        }
        options.setFiles((items) =>
          items.map((item) =>
            item.id === file.id
              ? { ...item, status: "working", phase: "phase.starting", jobId }
              : item,
          ),
        );
        try {
          const result = await api.convert({
            id: jobId,
            inputPath: file.path,
            targetFormat: file.selectedFormat as string,
            outputDir: targetOutputDir,
            batchConcurrency: concurrency,
            qualityProfile,
            mediaMode: file.mediaMode ?? "convert",
          });
          options.setFiles((items) =>
            items.map((item) =>
              item.id === file.id
                ? {
                    ...item,
                    result,
                    convertedFormat: file.selectedFormat,
                    progress: 100,
                    phase: "phase.done",
                    status: "done",
                    error: null,
                  }
                : item,
            ),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error || "phase.conversion");
          const canceled =
            message.includes("Conversion annulée") ||
            message.includes("Conversion canceled");
          options.setFiles((items) =>
            items.map((item) =>
              item.id === file.id
                ? {
                    ...item,
                    result: null,
                    convertedFormat: null,
                    error: message,
                    phase: canceled ? "phase.canceled" : message,
                    status: canceled ? "canceled" : "error",
                  }
                : item,
            ),
          );
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
    options.setFiles((items) =>
      items.map((file) =>
        file.selectedFormat && ["queued", "working"].includes(file.status)
          ? { ...file, status: "canceling", phase: "phase.canceling" }
          : file,
      ),
    );
    await Promise.allSettled(
      activeJobs.map((file) => api.cancelConversion(file.jobId)),
    );
  }

  const output = createOutputActions({
    get outputDir() {
      return outputDir;
    },
    get isConverting() {
      return isConverting;
    },
    get isExporting() {
      return isExporting;
    },
    get isTempOutputCleaned() {
      return isTempOutputCleaned;
    },
    get exportResult() {
      return exportResult;
    },
    get files() {
      return options.files;
    },
    get language() {
      return options.language;
    },
    setExportResult,
    setIsExporting,
    setExportedPaths,
    showNotice: options.showNotice,
  });
  return {
    get hasUnexportedResults() {
      return options.files.some(
        (file) =>
          file.result?.outputPath && !exportedPaths.has(file.result.outputPath),
      );
    },
    async cancelAndWait() {
      await cancelConversions();
      await batchCompletion.current;
    },
    cancelConversions,
    continueConversions,
    get exportResult() {
      return exportResult;
    },
    get exportResults() {
      return output.exportResults;
    },
    get exportResultsToFolder() {
      return output.exportResultsToFolder;
    },
    get exportBatchReport() {
      return output.exportBatchReport;
    },
    get isCancelling() {
      return isCancelling;
    },
    get isConverting() {
      return isConverting;
    },
    get isExporting() {
      return isExporting;
    },
    get isTempOutputCleaned() {
      return isTempOutputCleaned;
    },
    get outputDir() {
      return outputDir;
    },
    get qualityProfile() {
      return qualityProfile;
    },
    setQualityProfile,
    resetAll,
    retryFailedConversions,
    retryFile,
    get revealCurrentFolder() {
      return output.revealCurrentFolder;
    },
    startConversion,
  };
}
