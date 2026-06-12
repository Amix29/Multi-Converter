import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { type Update } from "@tauri-apps/plugin-updater";
import { t, type LanguageCode } from "../i18n";
import {
  checkForUpdateWithTimeout,
  clearPendingUpdateInstallation,
  fetchReleaseBodyForVersion,
  isMissingUpdateReleaseError,
  isUpdateCheckTimeout,
  latestReleaseUrl,
  minimumReportVersion,
  readPendingUpdateInstallation,
  rememberUpdateInstallation,
  updateCheckErrorMessage,
  updateCheckTimeoutMs,
  type AppUpdateInfo,
  type UpdateDownloadSize,
  type UpdateStatus,
} from "../lib/updateService";

type UpdateNoticeTone = "success" | "error";

interface UseAppUpdaterOptions {
  bootInfoLoaded: boolean;
  isTauriRuntime: boolean;
  isWelcomeOpen: boolean;
  language: LanguageCode;
  showNotice(tone: UpdateNoticeTone, message: string): void;
}

const autoUpdateInitialDelayMs = 900;
const autoUpdatePollEveryMs = 6 * 60 * 60 * 1000;
const autoUpdatePollTickMs = 30 * 60 * 1000;
const autoUpdateResumeAfterMs = 2 * 60 * 60 * 1000;

export function useAppUpdater(options: UseAppUpdaterOptions) {
  const [currentVersion, setCurrentVersion] = useState(minimumReportVersion);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [updateReminderVisible, setUpdateReminderVisible] = useState(false);
  const [updateCheckStartedAt, setUpdateCheckStartedAt] = useState<number | null>(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState<number | null>(null);
  const [updateDownloadSize, setUpdateDownloadSize] = useState<UpdateDownloadSize | null>(null);
  const [internetAvailable, setInternetAvailable] = useState(() => navigator.onLine);

  const updateRef = useRef<Update | null>(null);
  const updateCheckSequence = useRef(0);
  const updateStatusRef = useRef<UpdateStatus>("idle");
  const internetAvailableRef = useRef(internetAvailable);
  const automaticUpdateCheckStarted = useRef(false);
  const lastAutomaticUpdateCheckAt = useRef(0);
  const isWelcomeOpenRef = useRef(options.isWelcomeOpen);
  const showNoticeRef = useRef(options.showNotice);

  useEffect(() => {
    updateStatusRef.current = updateStatus;
  }, [updateStatus]);

  useEffect(() => {
    internetAvailableRef.current = internetAvailable;
  }, [internetAvailable]);

  useEffect(() => {
    isWelcomeOpenRef.current = options.isWelcomeOpen;
  }, [options.isWelcomeOpen]);

  useEffect(() => {
    showNoticeRef.current = options.showNotice;
  }, [options.showNotice]);

  const setAppUpdateStatus = useCallback((status: UpdateStatus) => {
    updateStatusRef.current = status;
    setUpdateStatus(status);
  }, []);

  const canRunAutomaticUpdateCheck = useCallback(() => {
    return (
      options.isTauriRuntime &&
      options.bootInfoLoaded &&
      internetAvailableRef.current &&
      updateStatusRef.current === "idle" &&
      !readPendingUpdateInstallation()
    );
  }, [options.bootInfoLoaded, options.isTauriRuntime]);

  const checkForAppUpdate = useCallback(
    async (manual: boolean) => {
      if (!options.isTauriRuntime || updateStatusRef.current === "checking" || updateStatusRef.current === "installing") return;
      if (!internetAvailableRef.current) {
        if (manual) showNoticeRef.current("error", t(options.language, "update.internetRequired"));
        return;
      }

      if (!manual) lastAutomaticUpdateCheckAt.current = Date.now();

      const checkId = updateCheckSequence.current + 1;
      updateCheckSequence.current = checkId;
      setAppUpdateStatus("checking");
      setUpdateCheckStartedAt(Date.now());
      try {
        const update = await checkForUpdateWithTimeout();
        if (checkId !== updateCheckSequence.current) return;
        updateRef.current = update;
        if (!update) {
          setUpdateInfo(null);
          setAppUpdateStatus("notAvailable");
          setUpdateCheckStartedAt(null);
          if (manual) showNoticeRef.current("success", t(options.language, "update.none"));
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
        setAppUpdateStatus("available");
        setUpdateCheckStartedAt(null);
        setUpdateReminderVisible(false);
        if (manual || !isWelcomeOpenRef.current) {
          setIsUpdateDialogOpen(true);
        } else {
          setUpdateReminderVisible(true);
        }
      } catch (error) {
        if (isMissingUpdateReleaseError(error)) {
          updateRef.current = null;
          setUpdateInfo(null);
          setAppUpdateStatus("notAvailable");
          setUpdateCheckStartedAt(null);
          if (manual) showNoticeRef.current("success", t(options.language, "update.remoteUnavailable"));
          return;
        }
        if (checkId !== updateCheckSequence.current) return;
        if (isUpdateCheckTimeout(error)) {
          updateRef.current = null;
          setUpdateInfo(null);
          setAppUpdateStatus("notAvailable");
          setUpdateCheckStartedAt(null);
          setUpdateDownloadProgress(null);
          setUpdateDownloadSize(null);
          if (manual) showNoticeRef.current("success", t(options.language, "update.none"));
          return;
        }
        setAppUpdateStatus("error");
        setUpdateCheckStartedAt(null);
        setUpdateDownloadProgress(null);
        setUpdateDownloadSize(null);
        if (manual) showNoticeRef.current("error", updateCheckErrorMessage(options.language, error));
      }
    },
    [currentVersion, options.isTauriRuntime, options.language, setAppUpdateStatus],
  );

  const performUpdateInstall = useCallback(
    async (update: Update, initialProgress: number | null, initialSize: UpdateDownloadSize | null) => {
      const installingVersion = update.version;
      setAppUpdateStatus("installing");
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
        setAppUpdateStatus("available");
        setUpdateDownloadProgress(null);
        setUpdateDownloadSize(null);
        showNoticeRef.current("error", updateCheckErrorMessage(options.language, error));
      }
    },
    [options.language, setAppUpdateStatus],
  );

  const installAvailableUpdate = useCallback(async () => {
    if (!options.isTauriRuntime) {
      window.open(latestReleaseUrl, "_blank", "noreferrer");
      return;
    }
    if (updateStatusRef.current === "installing") return;
    let update = updateRef.current;
    if (!update) {
      await checkForAppUpdate(true);
      update = updateRef.current;
      if (!update) return;
    }
    await performUpdateInstall(update, 0, null);
  }, [checkForAppUpdate, options.isTauriRuntime, performUpdateInstall]);

  const cancelUpdateDialog = useCallback(() => {
    setIsUpdateDialogOpen(false);
    setUpdateReminderVisible(Boolean(updateInfo));
  }, [updateInfo]);

  const showAvailableUpdateReminder = useCallback(() => {
    if (updateInfo && updateStatusRef.current === "available") {
      setUpdateReminderVisible(true);
    }
  }, [updateInfo]);

  useEffect(() => {
    if (!options.isTauriRuntime) return;
    getVersion().then(setCurrentVersion).catch(() => undefined);
  }, [options.isTauriRuntime]);

  useEffect(() => {
    if (!import.meta.env.DEV || options.isTauriRuntime) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mockUpdate") !== "1") return;
    const version = params.get("mockUpdateVersion") || "9.9.9";
    setUpdateInfo({
      version,
      currentVersion,
      date: null,
      body: `# Multi-Converter v${version}\n\n## Highlights\n\n- Preview update reminder for interface QA.\n\n## Download And Installation\n\n- Preview only.\n\n## Validation\n\n- Preview only.`,
    });
    setAppUpdateStatus("available");
    setUpdateReminderVisible(true);
  }, [currentVersion, options.isTauriRuntime, setAppUpdateStatus]);

  useEffect(() => {
    if (!options.isTauriRuntime || !options.bootInfoLoaded || automaticUpdateCheckStarted.current || !internetAvailable) return;
    const timeout = window.setTimeout(() => {
      if (!canRunAutomaticUpdateCheck()) return;
      automaticUpdateCheckStarted.current = true;
      void checkForAppUpdate(false);
    }, autoUpdateInitialDelayMs);
    return () => window.clearTimeout(timeout);
  }, [canRunAutomaticUpdateCheck, checkForAppUpdate, internetAvailable, options.bootInfoLoaded, options.isTauriRuntime]);

  useEffect(() => {
    if (updateStatus !== "checking") return;
    if (updateCheckStartedAt === null) {
      setUpdateCheckStartedAt(Date.now());
      return;
    }
    const timeout = window.setTimeout(() => {
      updateCheckSequence.current += 1;
      updateRef.current = null;
      setUpdateInfo(null);
      setAppUpdateStatus("notAvailable");
      setUpdateCheckStartedAt(null);
      setUpdateDownloadProgress(null);
      setUpdateDownloadSize(null);
    }, updateCheckTimeoutMs + 2500);
    return () => window.clearTimeout(timeout);
  }, [setAppUpdateStatus, updateCheckStartedAt, updateStatus]);

  useEffect(() => {
    const refreshBrowserNetwork = () => {
      setInternetAvailable(navigator.onLine);
    };
    window.addEventListener("online", refreshBrowserNetwork);
    window.addEventListener("offline", refreshBrowserNetwork);
    return () => {
      window.removeEventListener("online", refreshBrowserNetwork);
      window.removeEventListener("offline", refreshBrowserNetwork);
    };
  }, []);

  useEffect(() => {
    if (!options.isTauriRuntime || updateStatus !== "idle") return;
    const pendingInstallation = readPendingUpdateInstallation();
    if (!pendingInstallation) return;

    let disposed = false;
    automaticUpdateCheckStarted.current = true;
    const checkId = updateCheckSequence.current + 1;
    updateCheckSequence.current = checkId;
    void (async () => {
      setAppUpdateStatus("checking");
      setUpdateCheckStartedAt(Date.now());
      setUpdateDownloadProgress(pendingInstallation.progress ?? null);
      setUpdateDownloadSize(pendingInstallation.size);
      try {
        const update = await checkForUpdateWithTimeout();
        if (disposed || checkId !== updateCheckSequence.current) return;
        updateRef.current = update;
        if (!update) {
          clearPendingUpdateInstallation();
          setUpdateInfo(null);
          setUpdateCheckStartedAt(null);
          setUpdateDownloadProgress(null);
          setAppUpdateStatus("notAvailable");
          return;
        }
        const releaseBody = await fetchReleaseBodyForVersion(update.version, update.body ?? null);
        if (disposed || checkId !== updateCheckSequence.current) return;
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
        if (disposed || checkId !== updateCheckSequence.current) return;
        if (error instanceof Error && error.message === "update-check-timeout") {
          clearPendingUpdateInstallation();
        }
        setAppUpdateStatus("error");
        setUpdateCheckStartedAt(null);
        setUpdateDownloadProgress(null);
        setUpdateDownloadSize(null);
        showNoticeRef.current("error", updateCheckErrorMessage(options.language, error));
      }
    })();

    return () => {
      disposed = true;
    };
  }, [currentVersion, options.isTauriRuntime, options.language, performUpdateInstall, setAppUpdateStatus, updateStatus]);

  useEffect(() => {
    if (!options.isTauriRuntime || !options.bootInfoLoaded) return;
    const interval = window.setInterval(() => {
      if (Date.now() - lastAutomaticUpdateCheckAt.current < autoUpdatePollEveryMs) return;
      if (!canRunAutomaticUpdateCheck()) return;
      void checkForAppUpdate(false);
    }, autoUpdatePollTickMs);
    return () => window.clearInterval(interval);
  }, [canRunAutomaticUpdateCheck, checkForAppUpdate, options.bootInfoLoaded, options.isTauriRuntime]);

  useEffect(() => {
    if (!options.isTauriRuntime || !options.bootInfoLoaded) return;
    const checkAfterResume = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastAutomaticUpdateCheckAt.current < autoUpdateResumeAfterMs) return;
      if (!canRunAutomaticUpdateCheck()) return;
      void checkForAppUpdate(false);
    };
    window.addEventListener("focus", checkAfterResume);
    document.addEventListener("visibilitychange", checkAfterResume);
    return () => {
      window.removeEventListener("focus", checkAfterResume);
      document.removeEventListener("visibilitychange", checkAfterResume);
    };
  }, [canRunAutomaticUpdateCheck, checkForAppUpdate, options.bootInfoLoaded, options.isTauriRuntime]);

  return {
    cancelUpdateDialog,
    checkForAppUpdate,
    currentVersion,
    installAvailableUpdate,
    internetAvailable,
    isUpdateDialogOpen,
    setInternetAvailable,
    setIsUpdateDialogOpen,
    showAvailableUpdateReminder,
    updateDownloadProgress,
    updateDownloadSize,
    updateInfo,
    updateReminderVisible,
    updateStatus,
  };
}
