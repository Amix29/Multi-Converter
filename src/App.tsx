import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  api,
  type ConversionResult,
  type DependencyBootstrap,
  type EngineInstallProgress,
  type EngineStatus,
  type ExportResult,
  type FileDescription,
  type TargetFormat,
} from "./lib/api";
import {
  defaultPerformanceMode,
  languageLabel,
  languageOptions,
  performanceDetailKey,
  performanceLabelKey,
  performanceModes,
  pluralKey,
  t,
  translateBackendMessage,
  translateCategory,
  useI18n,
  type LanguageCode,
  type PerformanceMode,
} from "./i18n";
import brandLogoUrl from "./assets/multi-converter-icon-brand-orange.svg";

type Step = 1 | 2 | 3;
type Status = "pending" | "ready" | "queued" | "working" | "canceling" | "canceled" | "done" | "error" | "unsupported";
type NoticeTone = "info" | "success" | "error";
type ExportKind = "downloads" | "folder";
type EngineOperationKind = "install" | "uninstall" | null;
type UpdateStatus = "idle" | "checking" | "available" | "notAvailable" | "installing" | "error";
type ImportFeedback =
  | { state: "analyzing"; count: number | null; visible: boolean }
  | { state: "done"; count: number; visible: boolean }
  | null;

interface FileItem extends FileDescription {
  id: string;
  jobId: string;
  selectedFormat: string | null;
  progress: number;
  phase: string;
  status: Status;
  result: ConversionResult | null;
  convertedFormat: string | null;
  error: string | null;
}

interface ConversionIntent {
  id: string;
  labelKey: Parameters<typeof t>[1];
  target: TargetFormat;
  priority: number;
}

interface AppUpdateInfo {
  version: string;
  currentVersion: string;
  date: string | null;
  body: string | null;
}

interface UpdateDownloadSize {
  downloaded: number;
  total: number | null;
}

const statusLabelKeys: Record<Status, Parameters<typeof t>[1]> = {
  pending: "status.pending",
  ready: "status.ready",
  queued: "status.queued",
  working: "status.working",
  canceling: "status.canceling",
  canceled: "status.canceled",
  done: "status.done",
  error: "status.error",
  unsupported: "status.unsupported",
};

const isTauriRuntime = "__TAURI_INTERNALS__" in window;
const welcomeStorageKey = "multi-converter-welcome-seen";
const notificationsStorageKey = "multi-converter-notifications-enabled";
const updateInstallStorageKey = "multi-converter-update-installation";
const releaseBaseUrl = "https://github.com/Amix29/Multi-Converter/releases";
const latestReleaseUrl = `${releaseBaseUrl}/latest`;
const releaseApiBaseUrl = "https://api.github.com/repos/Amix29/Multi-Converter/releases/tags";
const updateCheckTimeoutMs = 20000;
const releaseNotesTimeoutMs = 8000;

function stepLabels(language: LanguageCode): Array<{ id: Step; label: string; title: string }> {
  return [
    { id: 1, label: "01", title: t(language, "step.files") },
    { id: 2, label: "02", title: t(language, "step.format") },
    { id: 3, label: "03", title: t(language, "step.output") },
  ];
}

function releaseTag(version: string) {
  const normalized = version.trim();
  return normalized.toLowerCase().startsWith("v") ? normalized : `v${normalized}`;
}

function releasePageUrl(version: string) {
  return `${releaseBaseUrl}/tag/${encodeURIComponent(releaseTag(version))}`;
}

async function fetchReleaseBodyForVersion(version: string, fallback: string | null) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), releaseNotesTimeoutMs);
  try {
    const response = await fetch(`${releaseApiBaseUrl}/${encodeURIComponent(releaseTag(version))}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { body?: unknown };
    const body = typeof data.body === "string" ? data.body.trim() : "";
    return body || fallback;
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function checkForUpdateWithTimeout() {
  return withTimeout(check({ timeout: updateCheckTimeoutMs }), updateCheckTimeoutMs + 2500, "update-check-timeout");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

function rememberUpdateInstallation(version: string, progress: number | null, size: UpdateDownloadSize | null) {
  localStorage.setItem(
    updateInstallStorageKey,
    JSON.stringify({
      version,
      progress,
      downloaded: size?.downloaded ?? null,
      total: size?.total ?? null,
      updatedAt: Date.now(),
    }),
  );
}

function readPendingUpdateInstallation(): { version: string; progress: number | null; size: UpdateDownloadSize | null } | null {
  try {
    const raw = localStorage.getItem(updateInstallStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; progress?: unknown; downloaded?: unknown; total?: unknown };
    if (typeof parsed.version !== "string" || !parsed.version.trim()) return null;
    const progress = typeof parsed.progress === "number" && Number.isFinite(parsed.progress) ? clamp(parsed.progress, 0, 100) : null;
    const downloaded = typeof parsed.downloaded === "number" && Number.isFinite(parsed.downloaded) ? Math.max(0, parsed.downloaded) : null;
    const total = typeof parsed.total === "number" && Number.isFinite(parsed.total) && parsed.total > 0 ? parsed.total : null;
    return { version: parsed.version, progress, size: downloaded === null ? null : { downloaded, total } };
  } catch {
    return null;
  }
}

function clearPendingUpdateInstallation() {
  localStorage.removeItem(updateInstallStorageKey);
}

export default function App() {
  const { language, setLanguage } = useI18n();
  const [bootInfo, setBootInfo] = useState<DependencyBootstrap | null>(null);
  const bootStarted = useRef(false);

  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(() => readStoredPerformanceMode());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => readStoredNotificationsEnabled());
  const [currentVersion, setCurrentVersion] = useState("1.0.0");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [updateReminderVisible, setUpdateReminderVisible] = useState(false);
  const [updateCheckStartedAt, setUpdateCheckStartedAt] = useState<number | null>(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState<number | null>(null);
  const [updateDownloadSize, setUpdateDownloadSize] = useState<UpdateDownloadSize | null>(null);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(() => shouldShowWelcome());
  const [welcomeStateLoaded, setWelcomeStateLoaded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [engineStatuses, setEngineStatuses] = useState<EngineStatus[]>([]);
  const [engineProgress, setEngineProgress] = useState<EngineInstallProgress | null>(null);
  const [isEngineOperationRunning, setIsEngineOperationRunning] = useState(false);
  const [engineOperationKind, setEngineOperationKind] = useState<EngineOperationKind>(null);
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTempOutputCleaned, setIsTempOutputCleaned] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [notice, setNotice] = useState<{ id: number; tone: NoticeTone; message: string } | null>(null);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const wasConverting = useRef(false);
  const cancellationRequested = useRef(false);
  const pendingQualityRefresh = useRef(false);
  const updateRef = useRef<Update | null>(null);
  const updateCheckSequence = useRef(0);

  useEffect(() => {
    localStorage.setItem("multi-converter-performance-mode", performanceMode);
  }, [performanceMode]);

  useEffect(() => {
    localStorage.setItem(notificationsStorageKey, notificationsEnabled ? "true" : "false");
  }, [notificationsEnabled]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    getVersion().then(setCurrentVersion).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime || !welcomeStateLoaded || readPendingUpdateInstallation() || isWelcomeOpen || updateStatus !== "idle") return;
    void checkForAppUpdate(false);
  }, [currentVersion, isWelcomeOpen, updateStatus, welcomeStateLoaded]);

  useEffect(() => {
    if (updateStatus !== "checking" || updateCheckStartedAt === null) return;
    const timeout = window.setTimeout(() => {
      updateCheckSequence.current += 1;
      updateRef.current = null;
      setUpdateStatus("error");
      setUpdateCheckStartedAt(null);
      setUpdateDownloadProgress(null);
      setUpdateDownloadSize(null);
      showNotice("error", t(language, "update.checkTimedOut"));
    }, updateCheckTimeoutMs + 2500);
    return () => window.clearTimeout(timeout);
  }, [language, updateCheckStartedAt, updateStatus]);

  useEffect(() => {
    if (!isTauriRuntime || !welcomeStateLoaded || updateStatus !== "idle") return;
    const pendingInstallation = readPendingUpdateInstallation();
    if (!pendingInstallation) return;

    let disposed = false;
    void (async () => {
      setUpdateStatus("checking");
      setUpdateDownloadProgress(pendingInstallation.progress ?? null);
      setUpdateDownloadSize(pendingInstallation.size);
      try {
        const update = await checkForUpdateWithTimeout();
        if (disposed) return;
        updateRef.current = update;
        if (!update) {
          clearPendingUpdateInstallation();
          setUpdateInfo(null);
          setUpdateDownloadProgress(null);
          setUpdateStatus("notAvailable");
          return;
        }
        const releaseBody = await fetchReleaseBodyForVersion(update.version, update.body ?? null);
        if (disposed) return;
        setUpdateInfo({
          version: update.version,
          currentVersion: update.currentVersion || currentVersion,
          date: update.date ?? null,
          body: releaseBody,
        });
        setIsUpdateDialogOpen(false);
        setUpdateReminderVisible(false);
        await performUpdateInstall(update, pendingInstallation.progress ?? 0, pendingInstallation.size);
      } catch (error) {
        if (disposed) return;
        if (error instanceof Error && error.message === "update-check-timeout") {
          clearPendingUpdateInstallation();
        }
        setUpdateStatus("available");
        setUpdateDownloadProgress(null);
        setUpdateDownloadSize(null);
        showNotice("error", updateCheckErrorMessage(language, error));
      }
    })();

    return () => {
      disposed = true;
    };
  }, [currentVersion, language, updateStatus, welcomeStateLoaded]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!importFeedback || importFeedback.state !== "done") return;
    const timeout = window.setTimeout(() => setImportFeedback(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [importFeedback]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    api.engineStatuses().then(setEngineStatuses).catch(() => setEngineStatuses([]));
  }, [isSettingsOpen]);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;

    api.welcomeState()
      .then((state) => setIsWelcomeOpen(state.show))
      .catch(() => setIsWelcomeOpen(shouldShowWelcome()))
      .finally(() => setWelcomeStateLoaded(true));

    api.bootstrapDependencies()
      .then(setBootInfo)
      .catch(() => setBootInfo(null));
  }, [language]);

  async function installQualityMaxExtension() {
    if (isEngineOperationRunning) return;
    setIsEngineOperationRunning(true);
    setEngineOperationKind("install");
    setEngineProgress(null);
    try {
      const dependencies = await api.installQualityMaxExtension();
      setBootInfo(dependencies);
      setEngineStatuses(await api.engineStatuses());
      if (isConverting) {
        pendingQualityRefresh.current = true;
      } else {
        await refreshImportedFilesForCurrentEngines();
      }
      showNotice("success", t(language, "notice.qualityInstalled"));
    } catch (error) {
      showNotice("error", translateBackendMessage(language, error instanceof Error ? error.message : String(error || "")));
    } finally {
      setIsEngineOperationRunning(false);
      setEngineOperationKind(null);
      setEngineProgress(null);
    }
  }

  async function uninstallQualityMaxExtension() {
    if (isEngineOperationRunning) return;
    setIsEngineOperationRunning(true);
    setEngineOperationKind("uninstall");
    setEngineProgress(null);
    try {
      await api.uninstallQualityMaxExtension();
      const dependencies = await api.refreshEngineDiagnostics();
      setBootInfo(dependencies);
      setEngineStatuses(await api.engineStatuses());
      if (isConverting) {
        pendingQualityRefresh.current = true;
      } else {
        await refreshImportedFilesForCurrentEngines();
      }
      showNotice("success", t(language, "notice.qualityUninstalled"));
    } catch (error) {
      showNotice("error", translateBackendMessage(language, error instanceof Error ? error.message : String(error || "")));
    } finally {
      setIsEngineOperationRunning(false);
      setEngineOperationKind(null);
    }
  }

  useEffect(() => {
    let progressUnlisten: (() => void) | undefined;
    let engineProgressUnlisten: (() => void) | undefined;
    let dropUnlisten: (() => void) | undefined;
    let disposed = false;

    api.onProgress((payload) => {
      setFiles((items) =>
        items.map((file) =>
          file.jobId === payload.jobId
            ? { ...file, progress: Math.max(clamp(file.progress, 0, 100), clamp(payload.progress, 0, 100)), phase: payload.phase || "phase.conversion" }
            : file,
        ),
      );
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      progressUnlisten = unlisten;
    });

    api.onEngineInstallProgress((payload) => {
      setEngineProgress(payload);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      engineProgressUnlisten = unlisten;
    });

    api.onFileDrop(async (paths) => {
      if (!paths.length) return;
      await addFilePaths(paths);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      dropUnlisten = unlisten;
    });

    return () => {
      disposed = true;
      progressUnlisten?.();
      engineProgressUnlisten?.();
      dropUnlisten?.();
    };
  }, [language]);

  useEffect(() => {
    if (isConverting) {
      wasConverting.current = true;
      return;
    }

    if (!wasConverting.current) return;
    wasConverting.current = false;

    const selectedFiles = files.filter((file) => file.selectedFormat);
    const allFinished = selectedFiles.length > 0 && selectedFiles.every((file) => file.status === "done" || file.status === "error" || file.status === "canceled");
    if (!allFinished) return;

    if (pendingQualityRefresh.current) {
      pendingQualityRefresh.current = false;
      void refreshImportedFilesForCurrentEngines();
    }

    const failed = selectedFiles.some((file) => file.status === "error");
    void notifyConversionFinished(language, failed, notificationsEnabled);
  }, [files, isConverting, language, notificationsEnabled]);

  useEffect(() => {
    if (!isConverting) return;
    const interval = window.setInterval(() => {
      setFiles((items) =>
        items.map((file) => {
          if (file.status === "queued") {
            return { ...file, progress: Math.max(file.progress, 5) };
          }
          if (file.status !== "working") return file;
          const current = clamp(file.progress, 0, 100);
          if (current >= 94) return file;
          const sizeFactor = file.size > 700 * 1024 * 1024 ? 0.55 : file.size > 120 * 1024 * 1024 ? 0.75 : 1;
          const pace = current < 45 ? 2.8 : current < 75 ? 1.7 : 0.65;
          return { ...file, progress: Math.max(current, Math.min(94, current + pace * sizeFactor)) };
        }),
      );
    }, 900);
    return () => window.clearInterval(interval);
  }, [isConverting]);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ id: Date.now(), tone, message });
  }

  async function checkForAppUpdate(manual: boolean) {
    if (!isTauriRuntime || updateStatus === "installing") return;
    const checkId = updateCheckSequence.current + 1;
    updateCheckSequence.current = checkId;
    setUpdateStatus("checking");
    setUpdateCheckStartedAt(Date.now());
    try {
      const update = await checkForUpdateWithTimeout();
      if (checkId !== updateCheckSequence.current) return;
      updateRef.current = update;
      if (!update) {
        setUpdateInfo(null);
        setUpdateStatus("notAvailable");
        setUpdateCheckStartedAt(null);
        if (manual) showNotice("success", t(language, "update.none"));
        return;
      }
      const releaseBody = await fetchReleaseBodyForVersion(update.version, update.body ?? null);
      if (checkId !== updateCheckSequence.current) return;
      setUpdateInfo({
        version: update.version,
        currentVersion: update.currentVersion || currentVersion,
        date: update.date ?? null,
        body: releaseBody,
      });
      setUpdateStatus("available");
      setUpdateCheckStartedAt(null);
      setUpdateReminderVisible(false);
      if (manual || !isWelcomeOpen) {
        setIsUpdateDialogOpen(true);
      } else {
        setUpdateReminderVisible(true);
      }
    } catch (error) {
      if (isMissingUpdateReleaseError(error)) {
        updateRef.current = null;
        setUpdateInfo(null);
        setUpdateStatus("notAvailable");
        setUpdateCheckStartedAt(null);
        if (manual) showNotice("success", t(language, "update.remoteUnavailable"));
        return;
      }
      if (checkId !== updateCheckSequence.current) return;
      setUpdateStatus("error");
      setUpdateCheckStartedAt(null);
      setUpdateDownloadProgress(null);
      setUpdateDownloadSize(null);
      if (manual) showNotice("error", updateCheckErrorMessage(language, error));
    }
  }

  async function installAvailableUpdate() {
    if (!isTauriRuntime) {
      window.open(latestReleaseUrl, "_blank", "noreferrer");
      return;
    }
    if (updateStatus === "installing") return;
    let update = updateRef.current;
    if (!update) {
      await checkForAppUpdate(true);
      update = updateRef.current;
      if (!update) return;
    }
    await performUpdateInstall(update, 0, null);
  }

  async function performUpdateInstall(update: Update, initialProgress: number | null, initialSize: UpdateDownloadSize | null) {
    const installingVersion = update.version;
    setUpdateStatus("installing");
    setUpdateDownloadProgress(initialProgress);
    setUpdateDownloadSize(initialSize);
    setIsUpdateDialogOpen(false);
    setUpdateReminderVisible(false);
    rememberUpdateInstallation(installingVersion, initialProgress, initialSize);
    try {
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          downloaded = 0;
          contentLength = event.data.contentLength ?? 0;
          const progress = contentLength > 0 ? 0 : null;
          const size = contentLength > 0 ? { downloaded, total: contentLength } : null;
          setUpdateDownloadProgress(progress);
          setUpdateDownloadSize(size);
          rememberUpdateInstallation(installingVersion, progress, size);
        }
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const size = { downloaded, total: contentLength > 0 ? contentLength : null };
          setUpdateDownloadSize(size);
          if (contentLength > 0) {
            const progress = Math.min(100, Math.round((downloaded / contentLength) * 100));
            setUpdateDownloadProgress(progress);
            rememberUpdateInstallation(installingVersion, progress, size);
          } else {
            rememberUpdateInstallation(installingVersion, null, size);
          }
        }
        if (event.event === "Finished") {
          const size = contentLength > 0 ? { downloaded: contentLength, total: contentLength } : downloaded > 0 ? { downloaded, total: null } : null;
          setUpdateDownloadProgress(100);
          setUpdateDownloadSize(size);
          rememberUpdateInstallation(installingVersion, 100, size);
        }
      });
      await relaunch();
    } catch (error) {
      clearPendingUpdateInstallation();
      setUpdateStatus("available");
      setUpdateDownloadProgress(null);
      setUpdateDownloadSize(null);
      showNotice("error", updateCheckErrorMessage(language, error));
    }
  }

  function cancelUpdateDialog() {
    setIsUpdateDialogOpen(false);
    setUpdateReminderVisible(Boolean(updateInfo));
  }

  function closeWelcome() {
    localStorage.setItem(welcomeStorageKey, "true");
    void api.markWelcomeSeen().catch(() => undefined);
    setIsWelcomeOpen(false);
    if (updateInfo && updateStatus === "available") {
      setUpdateReminderVisible(true);
    }
  }

  function addFiles(incomingFiles: FileDescription[]) {
    setFiles((existing) => {
      const knownPaths = new Set(existing.map((file) => file.path));
      const incoming = incomingFiles
        .filter((file) => file && !knownPaths.has(file.path))
        .map<FileItem>((file) => ({
          ...file,
          id: crypto.randomUUID(),
          jobId: crypto.randomUUID(),
          selectedFormat: null,
          progress: 0,
          phase: "phase.waiting",
          status: hasAvailableDescriptionTargets(file) ? "pending" : "unsupported",
          result: null,
          convertedFormat: null,
          error: null,
        }));
      return [...existing, ...incoming];
    });
  }

  async function addFilePaths(paths: string[]) {
    await importFiles(paths.length, async () => {
      const descriptions = await api.describePaths(paths);
      if (!descriptions.length && paths.length) showNotice("error", skippedFilesText(language, paths.length));
      return descriptions;
    });
  }

  async function addPickedFiles() {
    try {
      const paths = await api.pickFilePaths();
      if (paths.length) await addFilePaths(paths);
    } catch (error) {
      setImportFeedback(null);
      showNotice("error", translateBackendMessage(language, error instanceof Error ? error.message : String(error || "")));
    }
  }

  async function importFiles(count: number | null, loader: () => Promise<FileDescription[]>) {
    let feedbackShown = false;
    const timer = window.setTimeout(() => {
      feedbackShown = true;
      setImportFeedback({ state: "analyzing", count, visible: true });
    }, 280);
    try {
      const descriptions = await loader();
      window.clearTimeout(timer);
      if (descriptions.length) addFiles(descriptions);
      if (feedbackShown || descriptions.length > 6) {
        setImportFeedback({ state: "done", count: descriptions.length, visible: true });
      }
    } catch (error) {
      window.clearTimeout(timer);
      setImportFeedback(null);
      showNotice("error", translateBackendMessage(language, error instanceof Error ? error.message : String(error || "")));
    }
  }

  async function refreshImportedFilesForCurrentEngines() {
    const paths = files.map((file) => file.path);
    if (!paths.length) return;
    try {
      const descriptions = await api.describePaths(paths);
      const byPath = new Map(descriptions.map((description) => [description.path, description]));
      setFiles((items) =>
        items.map((file) => {
          const refreshed = byPath.get(file.path);
          if (!refreshed) return file;
          const previousTarget = file.selectedFormat ? getSelectedTarget(file) : null;
          const refreshedStatus: Status = hasAvailableDescriptionTargets(refreshed)
            ? file.status === "unsupported"
              ? "pending"
              : file.status
            : "unsupported";
          const merged = {
            ...file,
            ...refreshed,
            status: refreshedStatus,
          };
          if (!file.selectedFormat) return merged;
          const nextTarget = targetForFormat(merged, file.selectedFormat);
          if (!nextTarget) {
            return { ...merged, selectedFormat: null, progress: 0, phase: "phase.waiting", result: null, convertedFormat: null, error: null };
          }
          const engineChanged =
            previousTarget &&
            file.status === "done" &&
            file.convertedFormat === file.selectedFormat &&
            (previousTarget.engine !== nextTarget.engine || previousTarget.engineLabel !== nextTarget.engineLabel);
          return engineChanged
            ? { ...merged, progress: 0, phase: "phase.waiting", status: "ready", result: null, convertedFormat: null, error: null }
            : merged;
        }),
      );
    } catch (error) {
      showNotice("error", translateBackendMessage(language, error instanceof Error ? error.message : String(error || "")));
    }
  }

  async function handleHtmlDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (paths.length) {
      await addFilePaths(paths);
    }
  }

  function resetFiles() {
    setFiles([]);
  }

  async function cleanupCurrentTempFolder(options: { notifyOnError?: boolean } = {}) {
    if (!outputDir || isTempOutputCleaned) return false;
    try {
      const removed = await api.cleanupTempOutputFolder(outputDir);
      if (removed) setIsTempOutputCleaned(true);
      return removed;
    } catch (error) {
      if (options.notifyOnError === false) {
        console.warn("Temporary cleanup failed", error);
      } else {
        showNotice("error", t(language, "notice.tempCleanupFailed"));
      }
      return false;
    }
  }

  function resetAll() {
    void cleanupCurrentTempFolder();
    setStep(1);
    setFiles([]);
    setOutputDir(null);
    setIsTempOutputCleaned(false);
    setIsConverting(false);
    setIsExporting(false);
    setIsCancelling(false);
    cancellationRequested.current = false;
    setExportResult(null);
  }

  function removeFile(fileId: string) {
    setFiles((items) => {
      const next = items.filter((file) => file.id !== fileId);
      if (!next.length) {
        setStep(1);
      }
      return next;
    });
  }

  function applyFileFormat(fileId: string, format: string) {
    setFiles((items) =>
      items.map((file) => {
        if (file.id !== fileId || !targetForFormat(file, format)) return file;
        return updateFileSelection(file, format);
      }),
    );
  }

  async function startConversion() {
    if (isConverting) return;
    const hasSelectedFiles = files.some((file) => file.selectedFormat && file.status !== "unsupported");
    if (!hasSelectedFiles) return;

    const replacesExistingOutputDir = Boolean(outputDir);
    if (outputDir && !isTempOutputCleaned) {
      await cleanupCurrentTempFolder();
    }
    const tempWasCleanedForBatch = replacesExistingOutputDir || isTempOutputCleaned;
    const jobs = files.filter((file) => shouldConvertFile(file) || shouldReconvertCleanedResult(file, tempWasCleanedForBatch));

    if (!jobs.length) {
      setExportResult(null);
      setStep(3);
      return;
    }

    await runConversionBatch(jobs, true);
  }

  async function retryFile(fileId: string) {
    if (isConverting) return;
    const file = files.find((item) => item.id === fileId);
    if (!file || file.status !== "error" || !file.selectedFormat) return;
    await runConversionBatch([file], false);
  }

  async function retryFailedConversions() {
    if (isConverting) return;
    const jobs = files.filter((file) => file.status === "error" && file.selectedFormat);
    if (!jobs.length) return;
    await runConversionBatch(jobs, false);
  }

  async function continueConversions() {
    if (isConverting) return;
    const jobs = files.filter((file) => file.selectedFormat && file.status !== "done" && file.status !== "unsupported");
    if (!jobs.length) return;
    await runConversionBatch(jobs, false);
  }

  async function runConversionBatch(jobs: FileItem[], resetExportState: boolean) {
    let targetOutputDir: string;
    try {
      targetOutputDir = !resetExportState && outputDir && !isTempOutputCleaned ? outputDir : await api.createTempOutputFolder();
    } catch (error) {
      showNotice("error", translateBackendMessage(language, error instanceof Error ? error.message : String(error || "")));
      return;
    }
    if (!targetOutputDir) return;

    setOutputDir(targetOutputDir);
    setIsTempOutputCleaned(false);
    setExportResult(null);
    setIsConverting(true);
    setIsCancelling(false);
    cancellationRequested.current = false;
    setStep(3);

    const concurrency = conversionConcurrency(performanceMode, jobs);
    const qualityMaxEnabledForBatch = Boolean(bootInfo?.qualityMaxInstalled);
    const jobIds = new Map(jobs.map((job) => [job.id, crypto.randomUUID()]));
    setFiles((items) =>
      items.map((file) => {
        const jobId = jobIds.get(file.id);
        if (!jobId) return file;
        return {
          ...file,
          progress: 0,
          phase: "phase.waiting",
          status: "queued",
          result: null,
          convertedFormat: null,
          error: null,
          jobId,
        };
      }),
    );

    try {
      await runWithConcurrency(jobs, concurrency, async (file) => {
        const jobId = jobIds.get(file.id) ?? crypto.randomUUID();
        if (cancellationRequested.current) {
          setFiles((items) =>
            items.map((item) => (item.id === file.id ? { ...item, status: "canceled", phase: "phase.canceled", jobId } : item)),
          );
          return;
        }
        setFiles((items) =>
          items.map((item) => (item.id === file.id ? { ...item, status: "working", phase: "phase.starting", jobId } : item)),
        );
        try {
          const result = await api.convert({
            id: jobId,
            inputPath: file.path,
            targetFormat: file.selectedFormat as string,
            outputDir: targetOutputDir,
            performanceMode,
            batchConcurrency: concurrency,
            qualityMaxEnabled: qualityMaxEnabledForBatch,
          });
          setFiles((items) =>
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
          const message = error instanceof Error ? error.message : String(error || "phase.conversion");
          const canceled = message.includes("Conversion annulée") || message.includes("Conversion canceled");
          setFiles((items) =>
            items.map((item) =>
              item.id === file.id
                ? { ...item, result: null, convertedFormat: null, error: message, phase: canceled ? "phase.canceled" : message, status: canceled ? "canceled" : "error" }
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
    const activeJobs = files.filter((file) => file.selectedFormat && ["queued", "working"].includes(file.status));
    setFiles((items) =>
      items.map((file) =>
        file.selectedFormat && ["queued", "working"].includes(file.status)
          ? { ...file, status: "canceling", phase: "phase.canceling" }
          : file,
      ),
    );
    await Promise.allSettled(activeJobs.map((file) => api.cancelConversion(file.jobId)));
  }

  async function finalizeSuccessfulExport(kind: ExportKind, result: ExportResult) {
    setExportResult(result);
    showNotice("success", exportNoticeMessage(language, kind, result));
    await cleanupCurrentTempFolder({ notifyOnError: false });
  }

  async function exportResults(kind: ExportKind, exporter: (paths: string[]) => Promise<ExportResult | null>) {
    const paths = getConvertedOutputPaths(files);
    if (!paths.length || isConverting || isExporting || isTempOutputCleaned) return;
    setIsExporting(true);
    showNotice("info", kind === "downloads" ? t(language, "notice.exportDownloadsPreparing") : t(language, "notice.exportFolderChoosing"));
    try {
      const result = await exporter(paths);
      if (!result) {
        showNotice("info", t(language, "notice.exportCancelled"));
        return;
      }
      await finalizeSuccessfulExport(kind, result);
    } catch (error) {
      showNotice("error", translateBackendMessage(language, error instanceof Error ? error.message : String(error || "")));
    } finally {
      setIsExporting(false);
    }
  }

  async function exportResultsToFolder() {
    const paths = getConvertedOutputPaths(files);
    if (!paths.length || isConverting || isExporting || isTempOutputCleaned) return;
    setIsExporting(true);
    showNotice("info", t(language, "notice.exportFolderChoosing"));
    try {
      const destinationDir = await api.pickOutputFolder();
      if (!destinationDir) {
        showNotice("info", t(language, "notice.exportCancelled"));
        return;
      }
      const result = await api.exportToFolder(paths, destinationDir, outputDir);
      await finalizeSuccessfulExport("folder", result);
    } catch (error) {
      showNotice("error", translateBackendMessage(language, error instanceof Error ? error.message : String(error || "")));
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
      showNotice("error", t(language, "notice.revealFailed"));
    }
  }

  const hasFiles = files.length > 0;
  const hasConvertibleFiles = files.some(hasAvailableTargets);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img src={brandLogoUrl} alt="" />
          </div>
          <div>
            <h1>Multi-Converter</h1>
          </div>
        </div>

        <nav className="process-strip" aria-label={t(language, "app.progress")}>
          {stepLabels(language).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`process-step ${step === item.id ? "is-active" : ""} ${step > item.id ? "is-done" : ""}`}
              disabled={item.id > step || isConverting}
              onClick={() => setStep(item.id)}
            >
              <span>{item.label}</span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={t(language, "app.settings")}
            title={t(language, "app.settings")}
            onClick={() => setIsSettingsOpen(true)}
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <WelcomePanel
        isOpen={isWelcomeOpen}
        language={language}
        onClose={closeWelcome}
      />

      <SettingsPanel
        isOpen={isSettingsOpen}
        language={language}
        bootInfo={bootInfo}
        engineStatuses={engineStatuses}
        performanceMode={performanceMode}
        notificationsEnabled={notificationsEnabled}
        currentVersion={currentVersion}
        updateInfo={updateInfo}
        updateStatus={updateStatus}
        updateDownloadProgress={updateDownloadProgress}
        updateDownloadSize={updateDownloadSize}
        onClose={() => setIsSettingsOpen(false)}
        onLanguage={setLanguage}
        onPerformanceMode={setPerformanceMode}
        onNotificationsEnabled={setNotificationsEnabled}
        onCheckForUpdate={() => void checkForAppUpdate(true)}
        onInstallUpdate={() => void installAvailableUpdate()}
        onInstallQualityMax={installQualityMaxExtension}
        onUninstallQualityMax={uninstallQualityMaxExtension}
        engineProgress={engineProgress}
        engineOperationBusy={isEngineOperationRunning}
        engineOperationKind={engineOperationKind}
      />

      <UpdateDialog
        isOpen={isUpdateDialogOpen}
        language={language}
        updateInfo={updateInfo}
        updateStatus={updateStatus}
        updateDownloadProgress={updateDownloadProgress}
        updateDownloadSize={updateDownloadSize}
        onInstall={() => void installAvailableUpdate()}
        onCancel={cancelUpdateDialog}
      />

      <UpdateInstallDialog
        isVisible={updateStatus === "installing"}
        language={language}
        updateInfo={updateInfo}
        progress={updateDownloadProgress}
        size={updateDownloadSize}
      />

      <UpdateReminder
        isVisible={updateReminderVisible && Boolean(updateInfo) && !isSettingsOpen && !isWelcomeOpen && !isUpdateDialogOpen}
        language={language}
        updateInfo={updateInfo}
        updateStatus={updateStatus}
        onInstall={() => void installAvailableUpdate()}
        onOpenDetails={() => setIsUpdateDialogOpen(true)}
      />

      <PageNotice language={language} notice={notice} onDismiss={() => setNotice(null)} />

      <section className={`screen upload-screen ${step === 1 ? "is-active" : ""}`} aria-labelledby="upload-title">
        <h2 id="upload-title" className="visually-hidden">{t(language, "step.files")}</h2>

        <div className="upload-grid">
          <section
            className={`drop-zone ${isDragOver ? "is-over" : ""}`}
            aria-label={t(language, "upload.dropZone")}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsDragOver(false);
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void handleHtmlDrop(event)}
          >
            <div className="sketch-orbit" aria-hidden="true">
              <img src={brandLogoUrl} alt="" />
            </div>
            <div>
              <strong>{isDragOver ? t(language, "upload.dropFiles") : t(language, "upload.dragDrop")}</strong>
            </div>
            <button className="primary-button" type="button" onClick={() => void addPickedFiles()}>
              {t(language, "upload.browse")}
            </button>
          </section>
        </div>

        {files.length > 0 && (
          <p className="file-summary" aria-live="polite">
            {uploadedFilesSummary(language, files.length, fileSummary(files, language))}
          </p>
        )}

        <section className="file-lane" aria-label={t(language, "upload.selectedFiles")}>
          {!files.length && <div className="empty-state">{t(language, "upload.empty")}</div>}
          {files.map((file) => (
            <article className="file-ticket" key={file.id}>
              <div>
                <strong>{displayFileName(file)}</strong>
                <span>{compactFileMeta(file, language)}</span>
              </div>
              {!file.targets.length && <span className="ticket-status is-error">{t(language, "upload.unsupported")}</span>}
              <button className="remove-file-button" type="button" aria-label={`${t(language, "upload.removeFile")} ${file.name}`} onClick={() => removeFile(file.id)}>
                ×
              </button>
            </article>
          ))}
        </section>

        {hasFiles && (
          <footer className="screen-actions">
            <button className="ghost-button" type="button" disabled={isConverting} onClick={resetFiles}>
              {t(language, "upload.clear")}
            </button>
            {hasConvertibleFiles && (
              <button
                className="primary-button"
                type="button"
                disabled={isConverting}
                onClick={() => setStep(2)}
              >
                {t(language, "upload.goFormat")}
              </button>
            )}
          </footer>
        )}
      </section>

      <ImportToast language={language} feedback={importFeedback} />

      <FormatScreen
        isActive={step === 2}
        language={language}
        files={files}
        isConverting={isConverting}
        onBack={() => setStep(1)}
        onChooseFileFormat={applyFileFormat}
        onStart={startConversion}
      />

      <ProgressScreen
        isActive={step === 3}
        language={language}
        files={files}
        exportResult={exportResult}
        isConverting={isConverting}
        isCancelling={isCancelling}
        isExporting={isExporting}
        isTempOutputCleaned={isTempOutputCleaned}
        onNew={resetAll}
        onCancel={cancelConversions}
        onContinue={continueConversions}
        onBackToSettings={() => setStep(2)}
        onExportDownloads={() => exportResults("downloads", (paths) => api.exportToDownloads(paths, outputDir))}
        onExportFolder={exportResultsToFolder}
        onRevealFolder={revealCurrentFolder}
        onRetryFile={retryFile}
        onRetryFailed={retryFailedConversions}
      />
    </main>
  );
}

function FormatScreen(props: {
  isActive: boolean;
  language: LanguageCode;
  files: FileItem[];
  isConverting: boolean;
  onBack(): void;
  onChooseFileFormat(fileId: string, format: string): void;
  onStart(): void;
}) {
  const language = props.language;
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryByFileId, setCategoryByFileId] = useState<Record<string, string>>({});
  const configurable = props.files.filter(hasAvailableTargets);
  const readyCount = configurable.filter((file) => file.selectedFormat).length;
  const canStart = configurable.length > 0 && readyCount === configurable.length && !props.isConverting;
  const activeFile = configurable.find((file) => file.id === activeFileId) ?? configurable.find((file) => !file.selectedFormat) ?? configurable[0] ?? null;
  const optionGroups = activeFile ? groupedFormatOptions(activeFile) : { recommended: [], other: [] };
  const allIntents = uniqueIntents([...optionGroups.recommended, ...optionGroups.other]);
  const availableCategories = Array.from(new Map(allIntents.map((intent) => [intent.target.categoryId, translateCategory(language, intent.target.categoryId || intent.target.category)])).entries());
  const requestedCategory = activeFile ? categoryByFileId[activeFile.id] ?? "all" : "all";
  const category = requestedCategory === "all" || availableCategories.some(([id]) => id === requestedCategory) ? requestedCategory : "all";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredIntents = allIntents.filter((intent) => {
    const matchesCategory = category === "all" || intent.target.categoryId === category;
    const extension = intent.target.extension || intent.target.format;
    const matchesQuery =
      !normalizedQuery ||
      intent.target.format.toLowerCase().includes(normalizedQuery) ||
      intent.target.label.toLowerCase().includes(normalizedQuery) ||
      extension.toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  });
  const selectedIntent = activeFile?.selectedFormat ? allIntents.find((intent) => intent.target.format === activeFile.selectedFormat) ?? null : null;
  const compatibleForSelection =
    activeFile && selectedIntent
      ? props.files.filter((file) => file.id !== activeFile.id && targetForFormat(file, selectedIntent.target.format) && file.selectedFormat !== selectedIntent.target.format)
      : [];

  useEffect(() => {
    if (!activeFileId && configurable[0]) setActiveFileId(configurable[0].id);
    if (activeFileId && !configurable.some((file) => file.id === activeFileId)) setActiveFileId(configurable[0]?.id ?? null);
  }, [activeFileId, configurable]);

  function chooseFormat(file: FileItem, format: string) {
    props.onChooseFileFormat(file.id, format);
  }

  function applyCompatible(format: string) {
    props.files.forEach((file) => {
      if (file.id !== activeFile?.id && targetForFormat(file, format) && file.selectedFormat !== format) props.onChooseFileFormat(file.id, format);
    });
  }

  function chooseCategory(nextCategory: string) {
    if (!activeFile) return;
    setCategoryByFileId((current) => ({ ...current, [activeFile.id]: nextCategory }));
  }

  function renderFormatCard(intent: ConversionIntent, file: FileItem) {
    const isSelected = file.selectedFormat === intent.target.format;
    return (
      <button
        className={`format-card ${isSelected ? "is-selected" : ""}`}
        key={intent.target.format}
        type="button"
        aria-pressed={isSelected}
        onClick={() => chooseFormat(file, intent.target.format)}
      >
        <strong>{intent.target.label}</strong>
        <span className="format-extension">{intent.target.extension || intent.target.format}</span>
      </button>
    );
  }

  return (
    <section className={`screen format-screen ${props.isActive ? "is-active" : ""}`} aria-labelledby="format-title">
      <section className="format-board format-choice-board">
        <div className="screen-copy compact">
          <h2 id="format-title">{t(language, "format.title")}</h2>
        </div>

        <section className="format-workspace">
          <aside className="file-rail" aria-label={t(language, "format.files")}>
            <div className="format-rail-header">
              <span className="label">{readyCountText(language, readyCount, configurable.length)}</span>
            </div>
            <div className="rail-scroll">
              {props.files.map((file) => {
                const isActive = activeFile?.id === file.id;
                const isDone = Boolean(file.selectedFormat);
                const selectedTarget = file.selectedFormat ? targetForFormat(file, file.selectedFormat) : null;
                const selectedFormatLabel = file.selectedFormat ? (selectedTarget?.extension || selectedTarget?.label || file.selectedFormat).toUpperCase() : null;
                return (
                  <button
                    className={`rail-button ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`}
                    key={file.id}
                    type="button"
                    disabled={!hasAvailableTargets(file)}
                    onClick={() => setActiveFileId(file.id)}
                  >
                    <strong>{displayFileName(file)}</strong>
                    <span className="rail-meta">{hasAvailableTargets(file) ? compactFileMeta(file, language) : t(language, "format.unsupported")}</span>
                    {hasAvailableTargets(file) && (
                      <span className={`rail-format ${selectedFormatLabel ? "is-selected" : ""}`}>
                        {selectedFormatLabel ?? t(language, "format.choose")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="format-picker" aria-label={t(language, "format.available")}>
            {activeFile ? (
              <>
                <div className="format-tools">
                  <label className="search-box">
                    <span>{t(language, "format.filter")}</span>
                    <input value={query} placeholder={t(language, "format.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
                  </label>
                  {availableCategories.length > 1 && (
                    <div className="category-filter" aria-label={t(language, "format.categories")}>
                      <button className={category === "all" ? "is-active" : ""} type="button" onClick={() => chooseCategory("all")}>
                        {t(language, "format.all")}
                      </button>
                      {availableCategories.map(([id, label]) => (
                        <button className={category === id ? "is-active" : ""} key={id} type="button" onClick={() => chooseCategory(id)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedIntent && compatibleForSelection.length > 0 && (
                  <button className="apply-compatible-button" type="button" onClick={() => applyCompatible(selectedIntent.target.format)}>
                    {fileGroupId(activeFile) === "video" ? t(language, "format.applyVideoCompatible") : t(language, "format.batchApply")}
                  </button>
                )}

                <div className="format-results">
                  {filteredIntents.length > 0 && <div className="format-card-grid">{filteredIntents.map((intent) => renderFormatCard(intent, activeFile))}</div>}
                  {!filteredIntents.length && <div className="empty-state">{allIntents.length ? t(language, "format.noResult") : t(language, "format.noFormat")}</div>}
                </div>
              </>
            ) : (
              <div className="empty-state">{props.files.length ? t(language, "format.noRecommendation") : t(language, "format.addFilesFirst")}</div>
            )}
          </section>
        </section>

        <footer className="screen-actions">
          <button className="ghost-button" type="button" onClick={props.onBack}>
            {t(language, "format.back")}
          </button>
          {canStart && (
            <button className="primary-button" type="button" onClick={props.onStart}>
              {t(language, "format.start")}
            </button>
          )}
        </footer>
      </section>
    </section>
  );
}


function PageNotice(props: { language: LanguageCode; notice: { tone: NoticeTone; message: string } | null; onDismiss(): void }) {
  if (!props.notice) return null;

  return (
    <aside className={`page-notice is-${props.notice.tone}`} role="status" aria-live="polite">
      <span />
      <p>{props.notice.message}</p>
      <button type="button" aria-label={t(props.language, "app.close")} onClick={props.onDismiss}>
        <CloseIcon />
      </button>
    </aside>
  );
}

function UpdateDialog(props: {
  isOpen: boolean;
  language: LanguageCode;
  updateInfo: AppUpdateInfo | null;
  updateStatus: UpdateStatus;
  updateDownloadProgress: number | null;
  updateDownloadSize: UpdateDownloadSize | null;
  onInstall(): void;
  onCancel(): void;
}) {
  if (!props.isOpen || !props.updateInfo) return null;
  const installing = props.updateStatus === "installing";
  const releaseNotes = props.updateInfo.body?.trim();

  return (
    <div className="update-overlay" role="presentation" onMouseDown={installing ? undefined : props.onCancel}>
      <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <span className="label">{t(props.language, "update.label")}</span>
          <h2 id="update-dialog-title">{t(props.language, "update.dialogTitle", { version: props.updateInfo.version })}</h2>
        </header>
        <div className="update-version-hero" aria-label={t(props.language, "update.latestVersion", { version: props.updateInfo.version })}>
          <span>{t(props.language, "update.availableBadge")}</span>
          <strong>{props.updateInfo.version}</strong>
        </div>
        <p>{t(props.language, "update.dialogBody", { current: props.updateInfo.currentVersion, latest: props.updateInfo.version })}</p>
        <section className="update-release-notes" aria-label={t(props.language, "update.releaseNotes")}>
          <strong>{t(props.language, "update.releaseNotes")}</strong>
          {releaseNotes ? <ReleaseNotes body={releaseNotes} /> : <p>{t(props.language, "update.noReleaseNotes")}</p>}
        </section>
        {installing && <UpdateProgress language={props.language} progress={props.updateDownloadProgress} size={props.updateDownloadSize} />}
        <a className="release-link" href={releasePageUrl(props.updateInfo.version)} target="_blank" rel="noreferrer">
          {t(props.language, "update.openRelease")}
        </a>
        <div className="update-actions">
          <button className="secondary-button" type="button" disabled={installing} onClick={props.onCancel}>
            {t(props.language, "update.cancel")}
          </button>
          <button className="primary-button" type="button" disabled={installing} onClick={props.onInstall}>
            {installing ? t(props.language, "update.installing") : t(props.language, "update.install")}
          </button>
        </div>
      </section>
    </div>
  );
}

function UpdateInstallDialog(props: {
  isVisible: boolean;
  language: LanguageCode;
  updateInfo: AppUpdateInfo | null;
  progress: number | null;
  size: UpdateDownloadSize | null;
}) {
  if (!props.isVisible) return null;
  const version = props.updateInfo?.version ?? "";

  return (
    <div className="update-install-overlay" role="presentation">
      <section className="update-install-dialog" role="alertdialog" aria-modal="true" aria-labelledby="update-install-title">
        <span className="label">{t(props.language, "update.label")}</span>
        <h2 id="update-install-title">{t(props.language, "update.installingTitle", { version })}</h2>
        <p>{t(props.language, "update.installingBody")}</p>
        <UpdateProgress language={props.language} progress={props.progress} size={props.size} />
      </section>
    </div>
  );
}

function ReleaseNotes(props: { body: string }) {
  const lines = props.body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  const blocks: ReactNode[] = [];
  let pendingList: string[] = [];

  const flushList = () => {
    if (!pendingList.length) return;
    const items = pendingList;
    pendingList = [];
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {items.map((item, index) => (
          <li key={`${index}-${item}`}>{renderReleaseNoteInline(item)}</li>
        ))}
      </ul>,
    );
  };

  for (const line of lines) {
    if (!line || line.startsWith("# Multi-Converter ")) {
      flushList();
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      blocks.push(<h3 key={`heading-${blocks.length}`}>{line.slice(3)}</h3>);
      continue;
    }

    if (line.startsWith("- ")) {
      pendingList.push(line.slice(2));
      continue;
    }

    flushList();
    blocks.push(<p key={`paragraph-${blocks.length}`}>{renderReleaseNoteInline(line.replace(/^#\s+/, ""))}</p>);
  }

  flushList();

  return <div className="release-note-content">{blocks}</div>;
}

function renderReleaseNoteInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function UpdateReminder(props: {
  isVisible: boolean;
  language: LanguageCode;
  updateInfo: AppUpdateInfo | null;
  updateStatus: UpdateStatus;
  onInstall(): void;
  onOpenDetails(): void;
}) {
  if (!props.isVisible || !props.updateInfo) return null;
  const installing = props.updateStatus === "installing";

  return (
    <aside className="update-reminder" role="status" aria-live="polite">
      <div>
        <span>{t(props.language, "update.availableBadge")}</span>
        <strong>{t(props.language, "update.reminderTitle", { version: props.updateInfo.version })}</strong>
        <button type="button" onClick={props.onOpenDetails}>{t(props.language, "update.details")}</button>
      </div>
      <button className="primary-button" type="button" disabled={installing} onClick={props.onInstall}>
        {installing ? t(props.language, "update.installing") : t(props.language, "update.install")}
      </button>
    </aside>
  );
}

function UpdateProgress(props: { language: LanguageCode; progress: number | null; size?: UpdateDownloadSize | null }) {
  const label = props.progress === null ? t(props.language, "update.installing") : t(props.language, "update.progress", { progress: props.progress });
  const sizeLabel = props.size ? updateDownloadSizeLabel(props.size) : null;
  return (
    <div className={`update-progress ${props.progress === null ? "is-indeterminate" : ""}`}>
      <div className="update-progress-header">
        <span>{label}</span>
        {sizeLabel && <strong>{sizeLabel}</strong>}
      </div>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={props.progress ?? undefined}>
        <div className="progress-bar" style={props.progress === null ? undefined : { width: `${props.progress}%` }} />
      </div>
    </div>
  );
}

function updateDownloadSizeLabel(size: UpdateDownloadSize) {
  const downloaded = formatMegabytes(size.downloaded);
  return size.total ? `${downloaded} / ${formatMegabytes(size.total)}` : downloaded;
}

function formatMegabytes(bytes: number) {
  const value = bytes / (1024 * 1024);
  return `${Math.max(0, Math.round(value))} Mo`;
}

function ImportToast(props: { language: LanguageCode; feedback: ImportFeedback }) {
  if (!props.feedback?.visible) return null;
  const label =
    props.feedback.state === "analyzing"
      ? props.feedback.count
        ? importAnalyzingText(props.language, props.feedback.count)
        : t(props.language, "import.analyzingUnknown")
      : importedFilesText(props.language, props.feedback.count);

  return (
    <aside className={`import-toast is-${props.feedback.state}`} role="status" aria-live="polite">
      <span className="import-spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        {props.feedback.state === "analyzing" && (
          <div className="import-progress" aria-hidden="true">
            <span />
          </div>
        )}
      </div>
    </aside>
  );
}

function SettingsPanel(props: {
  isOpen: boolean;
  language: LanguageCode;
  bootInfo: DependencyBootstrap | null;
  engineStatuses: EngineStatus[];
  engineProgress: EngineInstallProgress | null;
  engineOperationBusy: boolean;
  engineOperationKind: EngineOperationKind;
  performanceMode: PerformanceMode;
  notificationsEnabled: boolean;
  currentVersion: string;
  updateInfo: AppUpdateInfo | null;
  updateStatus: UpdateStatus;
  updateDownloadProgress: number | null;
  updateDownloadSize: UpdateDownloadSize | null;
  onClose(): void;
  onLanguage(language: LanguageCode): void;
  onPerformanceMode(mode: PerformanceMode): void;
  onNotificationsEnabled(enabled: boolean): void;
  onCheckForUpdate(): void;
  onInstallUpdate(): void;
  onInstallQualityMax(): void;
  onUninstallQualityMax(): void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isUninstallConfirmOpen, setIsUninstallConfirmOpen] = useState(false);
  const [uninstallVisualProgress, setUninstallVisualProgress] = useState(0);

  useEffect(() => {
    if (!props.isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [props.isOpen, props.onClose]);

  useEffect(() => {
    if (!props.engineOperationBusy || props.engineOperationKind !== "uninstall") {
      setUninstallVisualProgress(0);
      return;
    }
    setUninstallVisualProgress(8);
    const interval = window.setInterval(() => {
      setUninstallVisualProgress((value) => Math.min(92, value + (value < 52 ? 9 : 4)));
    }, 260);
    return () => window.clearInterval(interval);
  }, [props.engineOperationBusy, props.engineOperationKind]);

  if (!props.isOpen) return null;
  const qualityInstalled = Boolean(props.bootInfo?.qualityMaxInstalled);
  const internetAvailable = props.bootInfo?.internetAvailable ?? navigator.onLine;
  const extensionSize = qualitySizeText(props.language, props.engineStatuses);
  const qualityProgress = extensionProgressSummary(
    props.engineStatuses,
    props.engineProgress,
    props.engineOperationKind,
    props.engineOperationBusy,
    uninstallVisualProgress,
    props.language,
  );
  const extensionBusy = props.engineOperationBusy && (props.engineOperationKind === "install" || props.engineOperationKind === "uninstall");
  const handleLanguageSelection = (value: string) => {
    if (languageOptions.includes(value as LanguageCode)) {
      props.onLanguage(value as LanguageCode);
    }
  };

  return (
    <div className="settings-overlay" role="presentation" onMouseDown={props.onClose}>
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <div>
            <h2 id="settings-title">{t(props.language, "settings.title")}</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" aria-label={t(props.language, "app.close")} onClick={props.onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="settings-grid">
          <section className="settings-column">
            <section className="setting-select language-setting" aria-labelledby="language-setting-title">
              <span className="label" id="language-setting-title">{t(props.language, "settings.language")}</span>
              <div className="language-choice-grid" role="radiogroup" aria-labelledby="language-setting-title">
                {languageOptions.map((languageOption) => (
                  <button
                    key={languageOption}
                    type="button"
                    className={`language-choice ${props.language === languageOption ? "is-selected" : ""}`}
                    role="radio"
                    aria-checked={props.language === languageOption}
                    onClick={() => handleLanguageSelection(languageOption)}
                  >
                    {languageLabel(props.language, languageOption)}
                  </button>
                ))}
              </div>
            </section>

            <section className="performance-setting" aria-labelledby="performance-title">
              <div className="setting-heading">
                <span className="label" id="performance-title">
                  {t(props.language, "settings.performance")}
                </span>
              </div>

              <div className="option-stack">
                {performanceModes.map((mode) => (
                  <label className={`option-card ${props.performanceMode === mode ? "is-selected" : ""}`} key={mode}>
                    <input
                      type="radio"
                      name="performance-mode"
                      value={mode}
                      checked={props.performanceMode === mode}
                      onChange={() => props.onPerformanceMode(mode)}
                    />
                    <b className="option-icon" aria-hidden="true">
                      {performanceIcon(mode)}
                    </b>
                    <span>
                      <strong>{t(props.language, performanceLabelKey(mode))}</strong>
                      <em>{t(props.language, performanceDetailKey(mode))}</em>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="setting-toggle" aria-labelledby="notifications-setting-title">
              <div>
                <span className="label" id="notifications-setting-title">{t(props.language, "settings.notifications")}</span>
                <p>{t(props.language, "settings.notificationsDetail")}</p>
              </div>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={props.notificationsEnabled}
                  onChange={(event) => props.onNotificationsEnabled(event.currentTarget.checked)}
                />
                <span aria-hidden="true" />
              </label>
            </section>

          </section>

          <section className="settings-side">
            <section className="extension-card quality-extension-card" aria-labelledby="quality-extension-title">
              <div className="extension-heading">
                <span className="label">{t(props.language, "quality.label")}</span>
                <strong id="quality-extension-title">{t(props.language, "quality.title")}</strong>
                <b className={qualityInstalled ? "extension-state is-installed" : "extension-state"}>
                  {qualityInstalled ? t(props.language, "quality.installed") : t(props.language, "quality.notInstalled")}
                </b>
              </div>
              <p>{t(props.language, "quality.description")}</p>
              <em>{t(props.language, "quality.estimatedSize", { size: extensionSize })}</em>
              {qualityProgress && (
                <div className={`engine-progress ${qualityProgress.indeterminate ? "is-indeterminate" : ""}`}>
                  <span>{qualityProgress.label}</span>
                  {!qualityProgress.indeterminate && <strong>{qualityProgress.percent}%</strong>}
                  <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={qualityProgress.indeterminate ? undefined : qualityProgress.percent}>
                    <div className="progress-bar" style={qualityProgress.indeterminate ? undefined : { width: `${qualityProgress.percent}%` }} />
                  </div>
                  {qualityProgress.meta && <small>{qualityProgress.meta}</small>}
                </div>
              )}
              <div className="settings-actions">
                {qualityInstalled ? (
                  <button className="secondary-button danger-button" type="button" disabled={extensionBusy} onClick={() => setIsUninstallConfirmOpen(true)}>
                    {props.engineOperationKind === "uninstall" ? t(props.language, "quality.uninstalling") : t(props.language, "quality.uninstall")}
                  </button>
                ) : (
                  <button className="primary-button" type="button" disabled={!internetAvailable || extensionBusy} onClick={props.onInstallQualityMax}>
                    {props.engineOperationKind === "install" ? t(props.language, "quality.installing") : t(props.language, "quality.install")}
                  </button>
                )}
              </div>
              {!internetAvailable && !qualityInstalled && <small>{t(props.language, "quality.internetRequired")}</small>}
            </section>

            <section className="update-settings-card" aria-labelledby="update-settings-title">
              <div className="update-settings-heading">
                <div>
                  <span className="label">{t(props.language, "update.label")}</span>
                  <strong id="update-settings-title">{t(props.language, "update.settingsTitle")}</strong>
                </div>
                {props.updateStatus === "available" && <b>{t(props.language, "update.availableBadge")}</b>}
              </div>
              <p>{t(props.language, "update.currentVersion", { version: props.currentVersion })}</p>
              {props.updateInfo ? (
                <div className="update-version-inline">
                  <span>{t(props.language, "update.latestVersion", { version: props.updateInfo.version })}</span>
                  <strong>{props.updateInfo.version}</strong>
                </div>
              ) : (
                <p>{props.updateStatus === "notAvailable" ? t(props.language, "update.none") : t(props.language, "update.unknown")}</p>
              )}
              {props.updateStatus === "installing" && <UpdateProgress language={props.language} progress={props.updateDownloadProgress} size={props.updateDownloadSize} />}
              <div className="settings-actions">
                {props.updateInfo ? (
                  <button className="primary-button" type="button" disabled={props.updateStatus === "installing"} onClick={props.onInstallUpdate}>
                    {props.updateStatus === "installing" ? t(props.language, "update.installing") : t(props.language, "update.install")}
                  </button>
                ) : (
                  <button className="secondary-button" type="button" disabled={props.updateStatus === "checking"} onClick={props.onCheckForUpdate}>
                    {props.updateStatus === "checking" ? t(props.language, "update.checking") : t(props.language, "update.check")}
                  </button>
                )}
              </div>
            </section>
          </section>
        </div>

        {isUninstallConfirmOpen && (
          <div className="confirm-layer" role="presentation" onMouseDown={() => setIsUninstallConfirmOpen(false)}>
            <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="uninstall-title" onMouseDown={(event) => event.stopPropagation()}>
              <h3 id="uninstall-title">{t(props.language, "quality.uninstallTitle")}</h3>
              <p>{t(props.language, "quality.uninstallBody")}</p>
              <div className="confirm-actions">
                <button className="secondary-button" type="button" onClick={() => setIsUninstallConfirmOpen(false)}>
                  {t(props.language, "quality.cancel")}
                </button>
                <button
                  className="primary-button danger-button"
                  type="button"
                  onClick={() => {
                    setIsUninstallConfirmOpen(false);
                    props.onUninstallQualityMax();
                  }}
                >
                  {t(props.language, "quality.confirmUninstall")}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function WelcomePanel(props: {
  isOpen: boolean;
  language: LanguageCode;
  onClose(): void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [furthestSlideIndex, setFurthestSlideIndex] = useState(0);
  const slides = useMemo(() => welcomeSlides(), []);
  const slide = slides[slideIndex];
  const isFirstSlide = slideIndex === 0;
  const isLastSlide = slideIndex === slides.length - 1;

  useEffect(() => {
    if (props.isOpen) {
      setSlideIndex(0);
      setFurthestSlideIndex(0);
    }
  }, [props.isOpen]);

  useEffect(() => {
    if (!props.isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") advanceWelcomeStep(slides.length, setSlideIndex, setFurthestSlideIndex);
      if (event.key === "ArrowLeft") setSlideIndex((index) => Math.max(0, index - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [props.isOpen, slides.length]);

  if (!props.isOpen) return null;

  return (
    <div className="welcome-overlay" role="presentation">
      <section
        className="welcome-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="welcome-header">
          <div className="welcome-brand-mark" aria-hidden="true">
            <img src={brandLogoUrl} alt="" />
          </div>
          <div className="welcome-progress" aria-label={t(props.language, "welcome.progress", { current: slideIndex + 1, total: slides.length })}>
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={index === slideIndex ? "is-active" : ""}
                aria-label={t(props.language, "welcome.goToStep", { step: index + 1 })}
                aria-current={index === slideIndex ? "step" : undefined}
                disabled={index > furthestSlideIndex}
                onClick={() => {
                  if (index <= furthestSlideIndex) setSlideIndex(index);
                }}
              />
            ))}
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" aria-label={t(props.language, "app.close")} onClick={props.onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="welcome-layout">
          <div className="welcome-copy">
            <span className="eyebrow">{t(props.language, slide.eyebrowKey)}</span>
            <h2 id="welcome-title">{t(props.language, slide.titleKey)}</h2>
            <p>{t(props.language, slide.bodyKey)}</p>
          </div>

          <WelcomePreview kind={slide.preview} language={props.language} />
        </div>

        <footer className="welcome-actions">
          <button className="secondary-button" type="button" disabled={isFirstSlide} onClick={() => setSlideIndex((index) => Math.max(0, index - 1))}>
            {t(props.language, "welcome.back")}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              if (isLastSlide) {
                props.onClose();
                return;
              }
              advanceWelcomeStep(slides.length, setSlideIndex, setFurthestSlideIndex);
            }}
          >
            {isLastSlide ? t(props.language, "welcome.start") : t(props.language, "welcome.next")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function advanceWelcomeStep(
  slideCount: number,
  setSlideIndex: (updater: (index: number) => number) => void,
  setFurthestSlideIndex: (updater: (index: number) => number) => void,
) {
  setSlideIndex((index) => {
    const nextIndex = Math.min(slideCount - 1, index + 1);
    setFurthestSlideIndex((furthestIndex) => Math.max(furthestIndex, nextIndex));
    return nextIndex;
  });
}

type WelcomePreviewKind = "hello" | "language" | "performance" | "extension" | "convert";

function welcomeSlides(): Array<{
  id: WelcomePreviewKind;
  eyebrowKey: Parameters<typeof t>[1];
  titleKey: Parameters<typeof t>[1];
  bodyKey: Parameters<typeof t>[1];
  preview: WelcomePreviewKind;
}> {
  return [
    { id: "hello", eyebrowKey: "welcome.eyebrow", titleKey: "welcome.helloTitle", bodyKey: "welcome.helloBody", preview: "hello" },
    { id: "language", eyebrowKey: "welcome.stepSettings", titleKey: "welcome.languageTitle", bodyKey: "welcome.languageText", preview: "language" },
    { id: "performance", eyebrowKey: "welcome.stepSettings", titleKey: "welcome.performanceTitle", bodyKey: "welcome.performanceText", preview: "performance" },
    { id: "extension", eyebrowKey: "welcome.stepExtension", titleKey: "welcome.extensionTitle", bodyKey: "welcome.extensionText", preview: "extension" },
    { id: "convert", eyebrowKey: "welcome.stepStart", titleKey: "welcome.convertTitle", bodyKey: "welcome.convertText", preview: "convert" },
  ];
}

function WelcomePreview(props: { kind: WelcomePreviewKind; language: LanguageCode }) {
  if (props.kind === "hello") {
    return (
      <div className="welcome-preview welcome-preview-app is-hello" aria-label={t(props.language, "welcome.previewLabel")}>
        <div className="mini-capture-frame mini-app-capture">
          <MiniAppTopbar language={props.language} />
          <MiniUploadArea language={props.language} />
        </div>
      </div>
    );
  }

  if (props.kind === "language") {
    return (
      <div className="welcome-preview welcome-preview-settings is-language" aria-label={t(props.language, "welcome.previewLabel")}>
        <div className="mini-capture-frame mini-settings-capture">
          <MiniSettingsPanel language={props.language} focus="language" />
        </div>
      </div>
    );
  }

  if (props.kind === "performance") {
    return (
      <div className="welcome-preview welcome-preview-settings is-performance" aria-label={t(props.language, "welcome.previewLabel")}>
        <div className="mini-capture-frame mini-settings-capture">
          <MiniSettingsPanel language={props.language} focus="performance" />
        </div>
      </div>
    );
  }

  if (props.kind === "extension") {
    return (
      <div className="welcome-preview welcome-preview-settings is-extension" aria-label={t(props.language, "welcome.previewLabel")}>
        <div className="mini-capture-frame mini-settings-capture">
          <MiniSettingsPanel language={props.language} focus="extension" />
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-preview welcome-preview-app is-convert" aria-label={t(props.language, "welcome.previewLabel")}>
      <div className="mini-capture-frame mini-app-capture">
        <MiniAppTopbar language={props.language} />
        <MiniUploadArea language={props.language} />
        <div className="empty-state">{t(props.language, "upload.empty")}</div>
      </div>
    </div>
  );
}

function MiniAppTopbar(props: { language: LanguageCode }) {
  return (
    <div className="topbar mini-topbar" aria-hidden="true">
      <div className="brand">
        <div className="brand-mark">
          <img src={brandLogoUrl} alt="" />
        </div>
        <div>
          <h1>Multi-Converter</h1>
        </div>
      </div>
      <nav className="process-strip">
        {stepLabels(props.language).map((item) => (
          <button key={item.id} type="button" className={`process-step ${item.id === 1 ? "is-active" : ""}`} disabled>
            <span>{item.label}</span>
            <strong>{item.title}</strong>
          </button>
        ))}
      </nav>
      <div className="topbar-actions">
        <button className="icon-button" type="button" disabled>
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}

function MiniUploadArea(props: { language: LanguageCode }) {
  return (
    <section className="drop-zone mini-drop-zone" aria-hidden="true">
      <div className="sketch-orbit">
        <img src={brandLogoUrl} alt="" />
      </div>
      <div>
        <strong>{t(props.language, "upload.dragDrop")}</strong>
      </div>
      <button className="primary-button" type="button" disabled>
        {t(props.language, "upload.browse")}
      </button>
    </section>
  );
}

function MiniSettingsPanel(props: { language: LanguageCode; focus: "language" | "performance" | "extension" }) {
  return (
    <section className={`settings-panel mini-settings-panel is-${props.focus}`} aria-hidden="true">
      <header className="settings-header">
        <div>
          <h2>{t(props.language, "settings.title")}</h2>
        </div>
        <button className="icon-button" type="button" disabled>
          <CloseIcon />
        </button>
      </header>

      <div className="settings-grid">
        <section className="settings-column">
          <label className={`setting-select ${props.focus === "language" ? "mini-focus" : ""}`} htmlFor="mini-language-select">
            <span className="label">{t(props.language, "settings.language")}</span>
            <select id="mini-language-select" value={props.language} disabled>
              {languageOptions.map((languageOption) => (
                <option key={languageOption} value={languageOption}>
                  {languageLabel(props.language, languageOption)}
                </option>
              ))}
            </select>
          </label>

          <section className={`performance-setting ${props.focus === "performance" ? "mini-focus" : ""}`} aria-labelledby="mini-performance-title">
            <div className="setting-heading">
              <span className="label" id="mini-performance-title">
                {t(props.language, "settings.performance")}
              </span>
            </div>

            <div className="option-stack">
              {performanceModes.map((mode) => (
                <label className={`option-card ${mode === "balanced" ? "is-selected" : ""}`} key={mode}>
                  <input type="radio" name="mini-performance-mode" value={mode} checked={mode === "balanced"} readOnly disabled />
                  <b className="option-icon" aria-hidden="true">
                    {performanceIcon(mode)}
                  </b>
                  <span>
                    <strong>{t(props.language, performanceLabelKey(mode))}</strong>
                    <em>{t(props.language, performanceDetailKey(mode))}</em>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </section>

        <section className={`extension-card quality-extension-card ${props.focus === "extension" ? "mini-focus" : ""}`} aria-labelledby="mini-quality-extension-title">
          <div className="extension-heading">
            <span className="label">{t(props.language, "quality.label")}</span>
            <strong id="mini-quality-extension-title">{t(props.language, "quality.title")}</strong>
            <b className="extension-state">{t(props.language, "quality.notInstalled")}</b>
          </div>
          <p>{t(props.language, "quality.description")}</p>
          <em>{t(props.language, "quality.estimatedSize", { size: t(props.language, "quality.sizeFallback") })}</em>
          <div className="settings-actions">
            <button className="primary-button" type="button" disabled>
              {t(props.language, "quality.install")}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function extensionProgressSummary(
  engineStatuses: EngineStatus[],
  engineProgress: EngineInstallProgress | null,
  operationKind: EngineOperationKind,
  operationBusy: boolean,
  uninstallProgress: number,
  language: LanguageCode,
) {
  if (!operationBusy) return null;
  if (operationKind === "uninstall") {
    return {
      label: t(language, "quality.uninstallInProgress"),
      percent: uninstallProgress,
      meta: uninstallProgress > 0 ? `${uninstallProgress}%` : "",
      indeterminate: false,
    };
  }
  if (operationKind !== "install") return null;

  const qualityEngines = engineStatuses.filter((engine) => engine.mode === "qualityMax" && (engine.downloadSizeBytes ?? 0) > 0);
  const totalBytes = qualityEngines.reduce((sum, engine) => sum + (engine.downloadSizeBytes ?? 0), 0);
  if (!engineProgress || totalBytes <= 0) {
    return { label: t(language, "quality.installInProgress"), percent: 0, meta: "", indeterminate: true };
  }

  const currentIndex = qualityEngines.findIndex((engine) => engine.id === engineProgress.engineId);
  const safeCurrentIndex = Math.max(0, currentIndex);
  const completedBefore = safeCurrentIndex > 0 ? qualityEngines.slice(0, safeCurrentIndex).reduce((sum, engine) => sum + (engine.downloadSizeBytes ?? 0), 0) : 0;
  const currentTotal = qualityEngines[currentIndex]?.downloadSizeBytes ?? engineProgress.totalBytes ?? 0;
  const currentEquivalentBytes = currentTotal * installStageProgress(engineProgress);
  const processedBytes = Math.min(totalBytes, completedBefore + currentEquivalentBytes);
  const downloadedBytes = Math.min(totalBytes, completedBefore + Math.min(engineProgress.downloadedBytes || 0, currentTotal));
  const percent = Math.min(99, Math.max(0, Math.round((processedBytes / totalBytes) * 100)));
  const stageLabel = installStageLabel(language, engineProgress.stage);

  return {
    label: t(language, "quality.installingEngine", { engine: engineProgress.engineName, stage: stageLabel }),
    percent,
    meta: `${formatBytes(downloadedBytes, language)} / ${formatBytes(totalBytes, language)}`,
    indeterminate: false,
  };
}

function installStageProgress(progress: EngineInstallProgress) {
  const normalized = progress.stage.trim().toLowerCase();
  const downloadedRatio = progress.totalBytes > 0 ? clamp(progress.downloadedBytes / progress.totalBytes, 0, 1) : clamp(progress.percent / 100, 0, 1);
  if (normalized === "téléchargement") return downloadedRatio * 0.72;
  if (normalized === "vérification") return 0.78;
  if (normalized === "extraction") return 0.9;
  if (normalized === "test santé") return 0.97;
  if (normalized === "terminé") return 1;
  return downloadedRatio;
}

function qualitySizeText(language: LanguageCode, engineStatuses: EngineStatus[]) {
  const qualityEngines = engineStatuses.filter((engine) => engine.mode === "qualityMax");
  const downloadBytes = qualityEngines.reduce((sum, engine) => sum + (engine.downloadSizeBytes ?? 0), 0);
  const installedBytes = qualityEngines.reduce((sum, engine) => sum + (engine.estimatedInstalledSizeBytes ?? engine.installedSizeBytes ?? 0), 0);
  if (downloadBytes <= 0) return t(language, "quality.sizeFallback");
  if (installedBytes <= 0) return t(language, "quality.sizeDownloadDetail", { download: formatBytes(downloadBytes, language) });
  return t(language, "quality.sizeDetail", {
    download: formatBytes(downloadBytes, language),
    installed: formatBytes(installedBytes, language),
  });
}

function installStageLabel(language: LanguageCode, stage: string) {
  const normalized = stage.trim().toLowerCase();
  if (normalized === "téléchargement") return t(language, "quality.downloading");
  if (normalized === "vérification") return t(language, "quality.verifying");
  if (normalized === "extraction") return t(language, "quality.extracting");
  if (normalized === "test santé") return t(language, "quality.testing");
  if (normalized === "terminé") return t(language, "quality.finalizing");
  return t(language, "quality.installInProgress");
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L14 2.5h-4L9.6 5a8 8 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a8 8 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z" />
    </svg>
  );
}

function ProgressScreen(props: {
  isActive: boolean;
  language: LanguageCode;
  files: FileItem[];
  exportResult: ExportResult | null;
  isConverting: boolean;
  isCancelling: boolean;
  isExporting: boolean;
  isTempOutputCleaned: boolean;
  onNew(): void;
  onCancel(): void;
  onContinue(): void;
  onBackToSettings(): void;
  onExportDownloads(): void;
  onExportFolder(): void;
  onRevealFolder(): void;
  onRetryFile(fileId: string): void;
  onRetryFailed(): void;
}) {
  const language = props.language;
  const convertibles = props.files.filter((file) => file.selectedFormat);
  const completed = convertibles.filter((file) => file.status === "done").length;
  const failed = convertibles.filter((file) => file.status === "error").length;
  const canceled = convertibles.filter((file) => file.status === "canceled" || file.status === "canceling").length;
  const total = convertibles.length;
  const rawAverage = total
    ? Math.round(convertibles.reduce((sum, file) => sum + (file.status === "done" ? 100 : clamp(file.progress || 0, 0, 100)), 0) / total)
    : 0;
  const canExport = completed > 0 && !props.isConverting && !props.isExporting && !props.isTempOutputCleaned;
  const isFinished = total > 0 && !props.isConverting && completed + failed + canceled === total;
  const canContinue = !props.isConverting && convertibles.some((file) => file.status !== "done" && file.status !== "unsupported");
  const activeFile = convertibles.find((file) => file.status === "working" || file.status === "canceling") ?? convertibles.find((file) => file.status === "queued") ?? null;
  const progressSessionKey = convertibles.map((file) => file.jobId).join("|");
  const lastGlobalProgressRef = useRef({ key: progressSessionKey, value: 0 });
  if (lastGlobalProgressRef.current.key !== progressSessionKey) {
    lastGlobalProgressRef.current = { key: progressSessionKey, value: 0 };
  }
  const average = isFinished && completed + failed + canceled === total && failed + canceled === 0
    ? 100
    : Math.max(lastGlobalProgressRef.current.value, rawAverage);
  lastGlobalProgressRef.current.value = average;
  const progressValue = `${average}%`;

  let title = t(language, "progress.pendingTitle");
  let subtitle = t(language, "progress.pendingSubtitle");
  if (total && props.isConverting) {
    title = props.isCancelling ? t(language, "progress.cancelingTitle") : t(language, "progress.workingTitle");
    subtitle = "";
  } else if (canceled && completed + failed + canceled === total) {
    title = t(language, "progress.canceledTitle");
    subtitle = "";
  } else if (failed) {
    title = t(language, "progress.errorTitle");
    subtitle = progressErrorSummary(language, completed, failed);
  } else if (props.exportResult) {
    title = t(language, "progress.savedTitle");
    subtitle = t(language, "progress.exportReady");
  } else if (completed === total && total > 0) {
    title = t(language, "progress.doneTitle");
    subtitle = "";
  }

  return (
    <section className={`screen progress-screen ${props.isActive ? "is-active" : ""}`} aria-labelledby="progress-title">
      <section className="progress-panel">
        <section className="progress-hero">
          <div className="progress-dial-cluster">
            <div className="conversion-dial" aria-hidden="true">
              <span style={{ "--value": `${average}%` } as React.CSSProperties} />
              <strong>{progressValue}</strong>
            </div>
          </div>
          <div className="screen-copy compact">
            <h2 id="progress-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
            {props.exportResult && <p>{exportedFilesText(language, props.exportResult.files.length)}</p>}
            {total > 0 && <p className="conversion-count">{progressSummaryText(language, completed, failed, canceled, total)}</p>}
          </div>
        </section>

        <section className="job-list" aria-label={t(language, "app.progress")}>
          {!convertibles.length && <div className="empty-state">{t(language, "progress.empty")}</div>}
          {convertibles.map((file) => {
            const fileProgress = file.status === "done" ? 100 : file.status === "error" || file.status === "canceled" ? file.progress : clamp(file.progress, 0, 100);
            const progressLabel = `${Math.floor(fileProgress)}%`;
            return (
              <article className="job-row" key={file.id}>
                <div className="job-main">
                  <div>
                    <strong>{displayFileName(file)}</strong>
                    <span>→ {(file.convertedFormat || file.selectedFormat || "").toUpperCase()}</span>
                  </div>
                  <em className={`job-state ${file.status === "done" ? "is-done" : ""} ${file.status === "error" ? "is-error" : ""}`}>
                    {t(language, statusLabelKeys[file.status])}
                  </em>
                </div>
                <div className="file-progress-line">
                  <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fileProgress}>
                    <div className={`progress-bar ${file.status === "error" ? "is-error" : ""}`} style={{ width: `${fileProgress}%` }} />
                  </div>
                  <span>{file.status === "done" ? "100%" : progressLabel}</span>
                </div>
                {file.status === "error" && isFinished && (
                  <button className="secondary-button retry-button" type="button" disabled={props.isExporting} onClick={() => props.onRetryFile(file.id)}>
                    {t(language, "progress.retry")}
                  </button>
                )}
              </article>
            );
          })}
        </section>

        <footer className="screen-actions progress-actions">
          <div className="conversion-actions">
            {props.isConverting ? (
              <button className="primary-button" type="button" disabled={props.isCancelling} onClick={props.onCancel}>
                {props.isCancelling ? t(language, "progress.canceling") : t(language, "progress.cancel")}
              </button>
            ) : (
              <>
                {props.files.length > 0 && (
                  <button className="ghost-button" type="button" disabled={props.isExporting} onClick={props.onNew}>
                    {t(language, "progress.newConversion")}
                  </button>
                )}
                {canContinue && canceled > 0 && (
                  <button className="primary-button" type="button" disabled={props.isExporting} onClick={props.onContinue}>
                    {t(language, "progress.continue")}
                  </button>
                )}
                {!isFinished && props.files.length > 0 && (
                  <button className="secondary-button" type="button" disabled={props.isExporting} onClick={props.onBackToSettings}>
                    {t(language, "progress.modify")}
                  </button>
                )}
                {failed > 0 && (
                  <button className="secondary-button" type="button" disabled={props.isExporting} onClick={props.onRetryFailed}>
                    {t(language, "progress.retryFailed")}
                  </button>
                )}
              </>
            )}
          </div>
          {!props.isConverting && completed > 0 && (
            <div className="destination-actions">
              {props.exportResult ? (
                <button className="primary-button" type="button" disabled={props.isExporting} onClick={props.onRevealFolder}>
                  {t(language, "progress.openFolder")}
                </button>
              ) : (
                <>
                  {canExport && (
                    <button className="primary-button" type="button" onClick={props.onExportDownloads}>
                      {props.isExporting ? t(language, "progress.copying") : t(language, "progress.download")}
                    </button>
                  )}
                  {canExport && (
                    <button className="secondary-button" type="button" onClick={props.onExportFolder}>
                      {props.isExporting ? t(language, "progress.copying") : t(language, "progress.folder")}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </footer>
      </section>
    </section>
  );
}

function isAvailableTarget(target: TargetFormat) {
  return target.engineAvailable && (!target.availability || target.availability === "available");
}

function hasAvailableDescriptionTargets(file: FileDescription) {
  return file.targets.some(isAvailableTarget);
}

function hasAvailableTargets(file: FileItem) {
  return hasAvailableDescriptionTargets(file);
}

function displayFileName(file: FileDescription) {
  const extension = (file.extension || file.sourceFormat || "").replace(/^\./, "").toLowerCase();
  if (!extension) return file.name;
  const suffix = `.${extension}`;
  return file.name.toLowerCase().endsWith(suffix) ? file.name.slice(0, -suffix.length) || file.name : file.name;
}

function availableTargetsForFile(file: FileItem) {
  return file.targets.filter(isAvailableTarget);
}

function targetForFormat(file: FileItem, format: string) {
  return availableTargetsForFile(file).find((target) => target.format === format) ?? null;
}

function updateFileSelection(file: FileItem, format: string): FileItem {
  const isCached = isConvertedForSelection({ ...file, selectedFormat: format });
  return {
    ...file,
    selectedFormat: format,
    progress: isCached ? 100 : 0,
    phase: isCached ? "phase.done" : "phase.waiting",
    status: isCached ? "done" : "ready",
    result: isCached ? file.result : null,
    convertedFormat: isCached ? file.convertedFormat : null,
    error: null,
  };
}

function fileGroupId(file: FileDescription) {
  if (file.categoryId === "documents") return "documents";
  if (file.categoryId === "images") return "images";
  if (file.categoryId === "audio") return "audio";
  if (file.categoryId === "video") return "video";
  return "other";
}

function uniqueIntents(intents: ConversionIntent[]) {
  const byFormat = new Map<string, ConversionIntent>();
  intents.forEach((intent) => {
    const existing = byFormat.get(intent.target.format);
    if (!existing || intent.priority < existing.priority) byFormat.set(intent.target.format, intent);
  });
  return Array.from(byFormat.values()).sort((a, b) => a.priority - b.priority || a.target.rank - b.target.rank);
}

function groupedFormatOptions(file: FileItem) {
  const intents = uniqueIntents(availableTargetsForFile(file).map((target) => intentForTarget(target, file)));
  const recommendedFormats = new Set(preferredFormatsForGroup(fileGroupId(file), [file]));
  const recommended = intents.filter((intent) => recommendedFormats.has(intent.target.format) || isPrimaryIntent(intent));
  const recommendedFormatSet = new Set(recommended.map((intent) => intent.target.format));
  return {
    recommended,
    other: intents.filter((intent) => !recommendedFormatSet.has(intent.target.format)),
  };
}

function preferredFormatsForGroup(groupId: string, files: FileItem[]) {
  const formats = new Set(files.map((file) => file.sourceFormat).filter((format): format is string => Boolean(format)));
  if (groupId === "images") return formats.size === 1 && (formats.has("jpg") || formats.has("jpeg")) ? ["png", "webp"] : ["jpg", "png", "webp"];
  if (groupId === "audio") return formats.size === 1 && formats.has("mp3") ? ["m4a", "wav", "flac"] : ["mp3", "m4a", "wav"];
  if (groupId === "video") return formats.size === 1 && formats.has("mp4") ? ["webm", "mov", "mkv"] : ["mp4", "webm", "mov"];
  if (groupId === "documents") {
    const onlyPdf = files.length > 0 && files.every((file) => file.sourceFormat === "pdf");
    if (onlyPdf) return ["txt", "html", "png", "jpg"];
    return formats.size === 1 && formats.has("pdf") ? ["txt", "odt", "docx"] : ["pdf", "odt", "txt", "docx"];
  }
  return [];
}

function isPrimaryIntent(intent: ConversionIntent) {
  return intent.priority < 50;
}

function intentForTarget(target: TargetFormat, file: FileDescription): ConversionIntent {
  const format = target.format;
  let labelKey: Parameters<typeof t>[1] = "format.intent.other";
  let priority = 90 + target.rank;

  if (target.categoryId === "audio" && file.categoryId === "video") {
    labelKey = "format.intent.audio";
    priority = formatPopularityPriority("audio", format, target.rank);
  } else if (target.categoryId === "video" && file.categoryId !== "video") {
    labelKey = "format.intent.video";
    priority = formatPopularityPriority("video", format, target.rank);
  } else if (format === "jpg" || format === "mp4" || format === "mp3") {
    labelKey = "format.intent.compatibility";
    priority = 10;
  } else if (format === "webp") {
    labelKey = "format.intent.lighter";
    priority = file.categoryId === "images" ? formatPopularityPriority("images", format, target.rank) : 80 + target.rank;
  } else if (format === "png") {
    labelKey = "format.intent.quality";
    priority = file.categoryId === "images" || file.sourceFormat === "pdf" ? formatPopularityPriority("images", format, target.rank) : 80 + target.rank;
  } else if (format === "pdf") {
    labelKey = "format.intent.document";
    priority = 10;
  } else if (format === "txt") {
    labelKey = "format.intent.text";
    priority = file.categoryId === "documents" ? formatPopularityPriority("documents", format, target.rank) : file.sourceFormat === "pdf" ? 10 : 35;
  } else if (format === "odt" || format === "docx" || format === "rtf") {
    labelKey = "format.intent.editable";
    priority = file.categoryId === "documents" ? formatPopularityPriority("documents", format, target.rank) : 80 + target.rank;
  } else if (format === "m4a" || format === "wav" || format === "flac" || format === "ogg") {
    labelKey = "format.intent.audio";
    priority = formatPopularityPriority("audio", format, target.rank);
  } else if (format === "webm" || format === "mov" || format === "mkv") {
    labelKey = "format.intent.video";
    priority = formatPopularityPriority("video", format, target.rank);
  } else if (file.categoryId === "documents" && ["html", "csv", "json", "xml"].includes(format)) {
    priority = formatPopularityPriority("documents", format, target.rank);
  }

  return {
    id: `${labelKey}-${target.format}`,
    labelKey,
    target,
    priority,
  };
}

function formatPopularityPriority(groupId: string, format: string, fallbackRank: number) {
  const preferred: Record<string, string[]> = {
    documents: ["pdf", "docx", "odt", "rtf", "txt", "html", "csv", "json", "xml"],
    images: ["jpg", "jpeg", "png", "webp", "tiff", "bmp", "ico"],
    video: ["mp4", "webm", "mkv", "mov", "avi", "wmv", "mpg"],
    audio: ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "wma"],
  };
  const index = preferred[groupId]?.indexOf(format.toLowerCase()) ?? -1;
  return index >= 0 ? 10 + index : 80 + fallbackRank;
}

function intentText(intent: ConversionIntent, language: LanguageCode) {
  return `${t(language, intent.labelKey)} → ${intent.target.label}`;
}

function groupLabel(groupId: string, language: LanguageCode) {
  if (groupId === "other") return t(language, "category.unknown");
  return translateCategory(language, groupId);
}

function fileSummary(files: FileDescription[], language: LanguageCode) {
  const counts = new Map<string, number>();
  files.forEach((file) => {
    const label = groupLabel(fileGroupId(file), language).toLowerCase();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return Array.from(counts, ([label, count]) => `${count} ${label}`).join(", ");
}

function fileCountText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.count", count), { count });
}

function uploadedFilesSummary(language: LanguageCode, count: number, summary: string) {
  return t(language, "upload.summaryByCategory", { countText: fileCountText(language, count), summary });
}

function readyCountText(language: LanguageCode, ready: number, total: number) {
  return t(language, pluralKey("progress.readyCount", ready), { ready, total });
}

function importAnalyzingText(language: LanguageCode, count: number) {
  return t(language, "import.analyzingCount", { countText: fileCountText(language, count) });
}

function importedFilesText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.added", count), { count });
}

function convertedFilesText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.converted", count), { count });
}

function exportedFilesText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.exported", count), { count });
}

function skippedFilesText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.skipped", count), { count });
}

function progressErrorSummary(language: LanguageCode, completed: number, failed: number) {
  return t(language, "progress.errorSummary", { completed, failed });
}

function progressSummaryText(language: LanguageCode, completed: number, failed: number, canceled: number, total: number) {
  const parts = [convertedFilesText(language, completed)];
  if (failed > 0) parts.push(t(language, "progress.summaryFailed", { count: failed }));
  if (canceled > 0) parts.push(t(language, pluralKey("file.canceled", canceled), { count: canceled }));
  parts.push(t(language, "progress.ofTotal", { total: fileCountText(language, total) }));
  return parts.join(t(language, "progress.summarySeparator"));
}

function isConvertedForSelection(file: FileItem) {
  return Boolean(file.selectedFormat && file.result && file.status === "done" && file.convertedFormat === file.selectedFormat);
}

function shouldConvertFile(file: FileItem) {
  return Boolean(file.selectedFormat && file.status !== "unsupported" && !isConvertedForSelection(file));
}

function shouldReconvertCleanedResult(file: FileItem, isTempOutputCleaned: boolean) {
  return Boolean(isTempOutputCleaned && file.selectedFormat && file.status === "done");
}

function getConvertedOutputPaths(files: FileItem[]) {
  return files.filter((file) => file.status === "done" && file.result?.outputPath).map((file) => file.result!.outputPath);
}

async function notifyConversionFinished(language: LanguageCode, failed: boolean, enabled: boolean) {
  if (!isTauriRuntime || !enabled) return;

  try {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      permissionGranted = (await requestPermission()) === "granted";
    }
    if (!permissionGranted) return;

    sendNotification({
      title: "Multi-Converter",
      body: failed ? t(language, "notice.conversionsFinishedWithErrors") : t(language, "notice.conversionsFinished"),
    });
  } catch (error) {
    console.warn("System notification failed", error);
  }
}

function updateCheckErrorMessage(language: LanguageCode, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message === "update-check-timeout") {
    return t(language, "update.checkTimedOut");
  }
  if (isMissingUpdateReleaseError(error)) {
    return t(language, "update.remoteUnavailable");
  }
  return translateBackendMessage(language, message);
}

function isMissingUpdateReleaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  return normalized.includes("valid release json") || normalized.includes("latest.json");
}

function exportNoticeMessage(language: LanguageCode, kind: ExportKind, result: ExportResult) {
  if (kind === "downloads") {
    return result.destinationCreated ? t(language, "notice.exportDownloadsCreated") : t(language, "notice.exportDownloadsReady");
  }
  return result.destinationCreated
    ? t(language, "notice.exportFolderCreated", { folder: folderName(result.destinationDir) })
    : t(language, "notice.exportFolderReady", { folder: folderName(result.destinationDir) });
}

function folderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function getSelectedTarget(file: FileItem) {
  return file.targets.find((target) => target.format === file.selectedFormat) ?? null;
}

function conversionLabel(file: FileItem, language: LanguageCode) {
  const target = getSelectedTarget(file);
  if (!target) return t(language, "common.notConverted");
  return `${target.label} · ${translateCategory(language, target.categoryId || target.category)}`;
}

function compactFileMeta(file: FileDescription, language: LanguageCode) {
  const extension = file.extension || t(language, "format.noExtension");
  const warnings = file.warnings?.map((warning) => fileWarningText(warning.code, language)) ?? [];
  return [extension, formatBytes(file.size, language), ...warnings].join(" · ");
}

function fileWarningText(code: string, language: LanguageCode) {
  if (code === "largeFile") return t(language, "file.warningLarge");
  if (code === "memoryIntensive") return t(language, "file.warningMemory");
  if (code === "partialFolderImport") return t(language, "file.warningPartialImport");
  return t(language, "file.warningGeneric");
}

function performanceIcon(mode: PerformanceMode) {
  if (mode === "energySaver") return "🔋";
  if (mode === "highPerformance") return "⚡";
  return "⚖️";
}

function formatBytes(bytes: number, language: LanguageCode) {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${t(language, "common.bytes")}`;
  const units = [
    t(language, "common.bytes"),
    t(language, "common.kilobytes"),
    t(language, "common.megabytes"),
    t(language, "common.gigabytes"),
  ];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function readStoredPerformanceMode(): PerformanceMode {
  const value = localStorage.getItem("multi-converter-performance-mode");
  return value === "energySaver" || value === "balanced" || value === "highPerformance" ? value : defaultPerformanceMode;
}

function readStoredNotificationsEnabled() {
  return localStorage.getItem(notificationsStorageKey) !== "false";
}

function shouldShowWelcome() {
  if (import.meta.env.DEV) return true;
  return false;
}

function conversionConcurrency(mode: PerformanceMode, jobs: FileItem[]) {
  const total = jobs.length;
  const totalBytes = jobs.reduce((sum, file) => sum + Math.max(0, file.size || 0), 0);
  const largestBytes = jobs.reduce((max, file) => Math.max(max, file.size || 0), 0);
  const heavyBatch = totalBytes > 1.4 * 1024 * 1024 * 1024 || largestBytes > 850 * 1024 * 1024;
  if (mode === "energySaver") return 1;
  if (mode === "balanced") return Math.max(1, Math.min(heavyBatch ? 1 : 2, total));
  if (heavyBatch) return Math.max(1, Math.min(2, total));
  return Math.max(1, Math.min(total > 8 ? 4 : 3, total));
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}
