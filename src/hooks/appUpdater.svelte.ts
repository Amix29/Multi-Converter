import { createUpdateSchedule } from "./updateSchedule.svelte.js";

import { resolveStateUpdate, type StateSetter } from "../lib/stateUpdate";
import { untrack } from "svelte";
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
interface AppUpdaterOptions {
  bootInfoLoaded: boolean;
  isTauriRuntime: boolean;
  language: LanguageCode;
  showNotice(tone: UpdateNoticeTone, message: string): void;
}
const autoUpdateInitialDelayMs = 900;
export function createAppUpdater(options: AppUpdaterOptions) {
  let currentVersion = $state.raw(minimumReportVersion);
  const setCurrentVersion: StateSetter<typeof currentVersion> = (value) => {
    currentVersion = resolveStateUpdate(value, currentVersion);
  };
  let updateStatus = $state.raw<UpdateStatus>("idle");
  const setUpdateStatus: StateSetter<typeof updateStatus> = (value) => {
    updateStatus = resolveStateUpdate(value, updateStatus);
  };
  let updateInfo = $state.raw<AppUpdateInfo | null>(null);
  const setUpdateInfo: StateSetter<typeof updateInfo> = (value) => {
    updateInfo = resolveStateUpdate(value, updateInfo);
  };
  let isUpdateDialogOpen = $state.raw(false);
  const setIsUpdateDialogOpen: StateSetter<boolean> = (value) => {
    isUpdateDialogOpen = resolveStateUpdate(value, isUpdateDialogOpen);
  };
  let updateReminderVisible = $state.raw(false);
  const setUpdateReminderVisible: StateSetter<boolean> = (value) => {
    updateReminderVisible = resolveStateUpdate(value, updateReminderVisible);
  };
  let updateCheckStartedAt = $state.raw<number | null>(null);
  const setUpdateCheckStartedAt: StateSetter<typeof updateCheckStartedAt> = (
    value,
  ) => {
    updateCheckStartedAt = resolveStateUpdate(value, updateCheckStartedAt);
  };
  let updateDownloadProgress = $state.raw<number | null>(null);
  const setUpdateDownloadProgress: StateSetter<
    typeof updateDownloadProgress
  > = (value) => {
    updateDownloadProgress = resolveStateUpdate(value, updateDownloadProgress);
  };
  let updateDownloadSize = $state.raw<UpdateDownloadSize | null>(null);
  const setUpdateDownloadSize: StateSetter<typeof updateDownloadSize> = (
    value,
  ) => {
    updateDownloadSize = resolveStateUpdate(value, updateDownloadSize);
  };
  let internetAvailable = $state.raw((() => navigator.onLine)());
  const setInternetAvailable: StateSetter<typeof internetAvailable> = (
    value,
  ) => {
    internetAvailable = resolveStateUpdate(value, internetAvailable);
  };
  const updateRef: { current: Update | null | null } = { current: null };
  const updateCheckSequence = { current: 0 };
  const automaticUpdateCheckStarted = { current: false };
  const lastAutomaticUpdateCheckAt = { current: 0 };
  const setAppUpdateStatus = (status: UpdateStatus) => {
    setUpdateStatus(status);
  };
  const canRunAutomaticUpdateCheck = () => {
    return (
      options.isTauriRuntime &&
      options.bootInfoLoaded &&
      internetAvailable &&
      updateStatus === "idle" &&
      !readPendingUpdateInstallation()
    );
  };
  const checkForAppUpdate = async (manual: boolean) => {
    if (
      !options.isTauriRuntime ||
      updateStatus === "checking" ||
      updateStatus === "installing"
    )
      return;
    if (!internetAvailable) {
      if (manual)
        options.showNotice(
          "error",
          t(options.language, "update.internetRequired"),
        );
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
        if (manual)
          options.showNotice("success", t(options.language, "update.none"));
        return;
      }
      const releaseBody = await fetchReleaseBodyForVersion(
        update.version,
        update.body ?? null,
      );
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
      setIsUpdateDialogOpen(true);
    } catch (error) {
      if (checkId !== updateCheckSequence.current) return;
      if (isMissingUpdateReleaseError(error)) {
        updateRef.current = null;
        setUpdateInfo(null);
        setAppUpdateStatus("error");
        setUpdateCheckStartedAt(null);
        if (manual)
          options.showNotice(
            "error",
            t(options.language, "update.remoteUnavailable"),
          );
        return;
      }
      if (isUpdateCheckTimeout(error)) {
        updateRef.current = null;
        setUpdateInfo(null);
        setAppUpdateStatus("error");
        setUpdateCheckStartedAt(null);
        setUpdateDownloadProgress(null);
        setUpdateDownloadSize(null);
        if (manual)
          options.showNotice(
            "error",
            updateCheckErrorMessage(options.language, error),
          );
        return;
      }
      setAppUpdateStatus("error");
      setUpdateCheckStartedAt(null);
      setUpdateDownloadProgress(null);
      setUpdateDownloadSize(null);
      if (manual)
        options.showNotice(
          "error",
          updateCheckErrorMessage(options.language, error),
        );
    }
  };
  const performUpdateInstall = async (
    update: Update,
    initialProgress: number | null,
    initialSize: UpdateDownloadSize | null,
  ) => {
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
          const size =
            contentLength > 0 ? { downloaded, total: contentLength } : null;
          setUpdateDownloadProgress(progress);
          setUpdateDownloadSize(size);
          rememberUpdateInstallation(installingVersion, progress, size);
        }
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const size = {
            downloaded,
            total: contentLength > 0 ? contentLength : null,
          };
          setUpdateDownloadSize(size);
          if (contentLength > 0) {
            const progress = Math.min(
              100,
              Math.round((downloaded / contentLength) * 100),
            );
            setUpdateDownloadProgress(progress);
            rememberUpdateInstallation(installingVersion, progress, size);
          } else {
            rememberUpdateInstallation(installingVersion, null, size);
          }
        }
        if (event.event === "Finished") {
          const size =
            contentLength > 0
              ? { downloaded: contentLength, total: contentLength }
              : downloaded > 0
                ? { downloaded, total: null }
                : null;
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
      options.showNotice(
        "error",
        updateCheckErrorMessage(options.language, error),
      );
    }
  };
  const installAvailableUpdate = async () => {
    if (!options.isTauriRuntime) {
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
  };
  const cancelUpdateDialog = () => {
    setIsUpdateDialogOpen(false);
    setUpdateReminderVisible(Boolean(updateInfo));
  };
  $effect(() => {
    void [options.isTauriRuntime];
    return untrack(() => {
      if (!options.isTauriRuntime) return;
      getVersion()
        .then(setCurrentVersion)
        .catch(() => undefined);
    });
  });
  if (import.meta.env.DEV || import.meta.env.MODE === "preview") {
    $effect(() => {
      void [currentVersion, options.isTauriRuntime, setAppUpdateStatus];
      return untrack(() => {
        // Keep this browser-only hook available for built preview QA; the Tauri runtime ignores it.
        if (options.isTauriRuntime) return;
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
      });
    });
  }

  $effect(() => {
    void [
      canRunAutomaticUpdateCheck,
      checkForAppUpdate,
      internetAvailable,
      options.bootInfoLoaded,
      options.isTauriRuntime,
    ];
    return untrack(() => {
      if (
        !options.isTauriRuntime ||
        !options.bootInfoLoaded ||
        automaticUpdateCheckStarted.current ||
        !internetAvailable
      )
        return;
      const timeout = window.setTimeout(() => {
        if (!canRunAutomaticUpdateCheck()) return;
        automaticUpdateCheckStarted.current = true;
        void checkForAppUpdate(false);
      }, autoUpdateInitialDelayMs);
      return () => window.clearTimeout(timeout);
    });
  });
  $effect(() => {
    void [
      options.language,
      setAppUpdateStatus,
      updateCheckStartedAt,
      updateStatus,
    ];
    return untrack(() => {
      if (updateStatus !== "checking") return;
      if (updateCheckStartedAt === null) {
        setUpdateCheckStartedAt(Date.now());
        return;
      }
      const timeout = window.setTimeout(() => {
        updateCheckSequence.current += 1;
        updateRef.current = null;
        setUpdateInfo(null);
        setAppUpdateStatus("error");
        setUpdateCheckStartedAt(null);
        setUpdateDownloadProgress(null);
        setUpdateDownloadSize(null);
        options.showNotice(
          "error",
          updateCheckErrorMessage(
            options.language,
            new Error("update-check-timeout"),
          ),
        );
      }, updateCheckTimeoutMs + 2500);
      return () => window.clearTimeout(timeout);
    });
  });
  $effect(() => {
    void [];
    return untrack(() => {
      const refreshBrowserNetwork = () => {
        setInternetAvailable(navigator.onLine);
      };
      window.addEventListener("online", refreshBrowserNetwork);
      window.addEventListener("offline", refreshBrowserNetwork);
      return () => {
        window.removeEventListener("online", refreshBrowserNetwork);
        window.removeEventListener("offline", refreshBrowserNetwork);
      };
    });
  });
  $effect(() => {
    void [
      currentVersion,
      options.isTauriRuntime,
      options.language,
      performUpdateInstall,
      setAppUpdateStatus,
      updateStatus,
    ];
    return untrack(() => {
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
          const releaseBody = await fetchReleaseBodyForVersion(
            update.version,
            update.body ?? null,
          );
          if (disposed || checkId !== updateCheckSequence.current) return;
          setUpdateInfo({
            version: update.version,
            currentVersion: update.currentVersion || currentVersion,
            date: update.date ?? null,
            body: releaseBody,
          });
          setIsUpdateDialogOpen(false);
          setUpdateReminderVisible(false);
          await performUpdateInstall(
            update,
            pendingInstallation.progress ?? 0,
            pendingInstallation.size,
          );
        } catch (error) {
          if (disposed || checkId !== updateCheckSequence.current) return;
          if (
            error instanceof Error &&
            error.message === "update-check-timeout"
          ) {
            clearPendingUpdateInstallation();
          }
          setAppUpdateStatus("error");
          setUpdateCheckStartedAt(null);
          setUpdateDownloadProgress(null);
          setUpdateDownloadSize(null);
          options.showNotice(
            "error",
            updateCheckErrorMessage(options.language, error),
          );
        }
      })();
      return () => {
        disposed = true;
      };
    });
  });

  createUpdateSchedule({
    get active() {
      return options.isTauriRuntime && options.bootInfoLoaded;
    },
    get lastCheckedAt() {
      return lastAutomaticUpdateCheckAt.current;
    },
    canCheck: canRunAutomaticUpdateCheck,
    check: () => checkForAppUpdate(false),
  });
  return {
    cancelUpdateDialog,
    checkForAppUpdate,
    get currentVersion() {
      return currentVersion;
    },
    installAvailableUpdate,
    get internetAvailable() {
      return internetAvailable;
    },
    get isUpdateDialogOpen() {
      return isUpdateDialogOpen;
    },
    setInternetAvailable,
    setIsUpdateDialogOpen,
    get updateDownloadProgress() {
      return updateDownloadProgress;
    },
    get updateDownloadSize() {
      return updateDownloadSize;
    },
    get updateInfo() {
      return updateInfo;
    },
    get updateReminderVisible() {
      return updateReminderVisible;
    },
    get updateStatus() {
      return updateStatus;
    },
  };
}
