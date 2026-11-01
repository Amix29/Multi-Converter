import { resolveStateUpdate, type StateSetter } from "../lib/stateUpdate";
import { untrack } from "svelte";

import { createSessionGuard } from "./conversion/sessionGuard.svelte.js";
import {
  feedbackPrivacyStorageKey,
  notificationsStorageKey,
  readStoredFeedbackPrivacyAccepted,
  readStoredNotificationsEnabled,
  shouldShowWelcome,
  welcomeStorageKey,
} from "./conversion/model";
import { createConversionWorkflow } from "./conversion/conversionWorkflow.svelte.js";
import { createFileWorkflow } from "./conversion/fileWorkflow.svelte.js";
import { createBatchRecovery } from "./conversion/batchRecovery.svelte.js";
import { restoredFiles } from "./conversion/recoveryModel";
import { selectUniqueImports } from "./conversion/largeListModel";
import type { Notice, NoticeTone } from "./types";
import { createTheme } from "./theme.svelte.js";
import { createAppUpdater } from "../hooks/appUpdater.svelte.js";
import { createI18n } from "../i18n/state.svelte.js";
import { t } from "../i18n";
import { api, type DependencyBootstrap } from "../lib/api";

import type { FileItem } from "./types";

export function createApplication() {
  const isTauriRuntime = "__TAURI_INTERNALS__" in window;
  const theme = createTheme();
  const locale = createI18n();
  let language = $derived(locale.language);
  const setLanguage = locale.setLanguage;
  const bootStarted = { current: false };
  let notificationsEnabled = $state.raw(readStoredNotificationsEnabled());
  const setNotificationsEnabled: StateSetter<typeof notificationsEnabled> = (
    value,
  ) => {
    notificationsEnabled = resolveStateUpdate(value, notificationsEnabled);
  };
  let bootInfoLoaded = $state.raw(false);
  const setBootInfoLoaded: StateSetter<boolean> = (value) => {
    bootInfoLoaded = resolveStateUpdate(value, bootInfoLoaded);
  };
  let dependencies = $state.raw<DependencyBootstrap | null>(null);
  const setDependencies: StateSetter<typeof dependencies> = (value) => {
    dependencies = resolveStateUpdate(value, dependencies);
  };
  let isWelcomeOpen = $state.raw(shouldShowWelcome());
  const setIsWelcomeOpen: StateSetter<typeof isWelcomeOpen> = (value) => {
    isWelcomeOpen = resolveStateUpdate(value, isWelcomeOpen);
  };
  let isSettingsOpen = $state.raw(false);
  const setIsSettingsOpen: StateSetter<boolean> = (value) => {
    isSettingsOpen = resolveStateUpdate(value, isSettingsOpen);
  };
  let isFeedbackOpen = $state.raw(false);
  const setIsFeedbackOpen: StateSetter<boolean> = (value) => {
    isFeedbackOpen = resolveStateUpdate(value, isFeedbackOpen);
  };
  let isFeedbackPrivacyOpen = $state.raw(false);
  const setIsFeedbackPrivacyOpen: StateSetter<boolean> = (value) => {
    isFeedbackPrivacyOpen = resolveStateUpdate(value, isFeedbackPrivacyOpen);
  };
  let feedbackPrivacyAccepted = $state.raw(readStoredFeedbackPrivacyAccepted());
  const setFeedbackPrivacyAccepted: StateSetter<
    typeof feedbackPrivacyAccepted
  > = (value) => {
    feedbackPrivacyAccepted = resolveStateUpdate(
      value,
      feedbackPrivacyAccepted,
    );
  };
  let notice = $state.raw<Notice | null>(null);
  const setNotice: StateSetter<typeof notice> = (value) => {
    notice = resolveStateUpdate(value, notice);
  };
  let ocrFile = $state.raw<FileItem | null>(null);
  const setOcrFile: StateSetter<typeof ocrFile> = (value) => {
    ocrFile = resolveStateUpdate(value, ocrFile);
  };
  let ocrJobId = $state.raw<string | null>(null);
  const setOcrJobId: StateSetter<typeof ocrJobId> = (value) => {
    ocrJobId = resolveStateUpdate(value, ocrJobId);
  };
  const ocrTask: {
    current: {
      jobId: string;
      completion: Promise<void>;
    } | null | null;
  } = { current: null };
  const registerOcrTask = (task: {
    jobId: string;
    completion: Promise<void>;
  }) => {
    ocrTask.current = task;
    setOcrJobId(task.jobId);
    const finished = () => {
      if (ocrTask.current?.jobId !== task.jobId) return;
      ocrTask.current = null;
      setOcrJobId(null);
    };
    void task.completion.then(finished, finished);
  };
  const showNotice = (tone: NoticeTone, message: string) => {
    setNotice({ id: Date.now(), tone, message });
  };
  const fileWorkflow = createFileWorkflow({
    get language() {
      return language;
    },
    get showNotice() {
      return showNotice;
    },
  });
  const recovery = createBatchRecovery({
    get language() {
      return language;
    },
    get showNotice() {
      return showNotice;
    },
  });
  const conversionWorkflow = createConversionWorkflow({
    get files() {
      return fileWorkflow.files;
    },
    get language() {
      return language;
    },
    get notificationsEnabled() {
      return notificationsEnabled;
    },
    get setFiles() {
      return fileWorkflow.setFiles;
    },
    get setStep() {
      return fileWorkflow.setStep;
    },
    get showNotice() {
      return showNotice;
    },
    get beforeBatch() {
      return recovery.saveBeforeBatch;
    },
    get onReset() {
      return recovery.clear;
    },
  });
  const restoreBatch = async () => {
    if (fileWorkflow.files.length || conversionWorkflow.isConverting) return;
    const restored = await recovery.restore();
    if (!restored) return;
    const incoming = restoredFiles(restored.descriptions, restored.plan);
    fileWorkflow.setFiles((current) => [
      ...current,
      ...selectUniqueImports(current, incoming).accepted,
    ]);
    conversionWorkflow.setQualityProfile(restored.plan.qualityProfile);
    fileWorkflow.setStep(2);
  };
  const updater = createAppUpdater({
    get bootInfoLoaded() {
      return bootInfoLoaded;
    },
    get isTauriRuntime() {
      return isTauriRuntime;
    },
    get isWelcomeOpen() {
      return isWelcomeOpen;
    },
    get language() {
      return language;
    },
    get showNotice() {
      return showNotice;
    },
  });
  const setInternetAvailable = updater.setInternetAvailable;
  const sessionGuard = createSessionGuard({
    get isConverting() {
      return conversionWorkflow.isConverting || Boolean(ocrJobId);
    },
    get isExporting() {
      return conversionWorkflow.isExporting;
    },
    get hasUnexportedResults() {
      return conversionWorkflow.hasUnexportedResults;
    },
    async cancelAndWait() {
      const activeOcr = ocrTask.current;
      await Promise.all([
        conversionWorkflow.cancelAndWait(),
        activeOcr
          ? api.cancelOcr(activeOcr.jobId).then(() => activeOcr.completion)
          : Promise.resolve(),
      ]);
    },
    get onError() {
      return () => showNotice("error", t(language, "session.busy"));
    },
  });
  const startConversion = () =>
    sessionGuard.request(conversionWorkflow.startConversion);
  const installUpdate = () => {
    updater.cancelUpdateDialog();
    setIsSettingsOpen(false);
    sessionGuard.request(updater.installAvailableUpdate);
  };
  const cancelConversions = conversionWorkflow.cancelConversions;
  const continueConversions = conversionWorkflow.continueConversions;
  const resetConversion = () =>
    sessionGuard.request(conversionWorkflow.resetAll);
  const retryFile = conversionWorkflow.retryFile;
  const retryFailed = conversionWorkflow.retryFailedConversions;
  const exportFolder = conversionWorkflow.exportResultsToFolder;
  const revealFolder = conversionWorkflow.revealCurrentFolder;
  const exportDownloads = () =>
    conversionWorkflow.exportResults("downloads", (paths, entries) =>
      api.exportToDownloads(paths, conversionWorkflow.outputDir, entries),
    );
  const showFormats = () => fileWorkflow.setStep(2);
  const showFiles = () => fileWorkflow.setStep(1);
  const showOutputSettings = () => fileWorkflow.setStep(2);
  const openSettings = () => setIsSettingsOpen(true);
  const closeSettings = () => setIsSettingsOpen(false);
  const closeOcr = () => setOcrFile(null);
  let updateReminderActive = $derived(
    updater.updateReminderVisible &&
      Boolean(updater.updateInfo) &&
      !isSettingsOpen &&
      !isWelcomeOpen &&
      !updater.isUpdateDialogOpen,
  );
  let feedbackLauncherActive = $derived(
    fileWorkflow.step === 1 &&
      !isSettingsOpen &&
      !isWelcomeOpen &&
      !updater.isUpdateDialogOpen &&
      updater.updateStatus !== "installing" &&
      !isFeedbackOpen &&
      !isFeedbackPrivacyOpen,
  );
  let importToastActive = $derived(
    Boolean(fileWorkflow.importFeedback?.visible),
  );
  $effect(() => {
    void [notificationsEnabled];
    return untrack(() => {
      localStorage.setItem(
        notificationsStorageKey,
        notificationsEnabled ? "true" : "false",
      );
    });
  });
  $effect(() => {
    void [notice];
    return untrack(() => {
      if (!notice || notice.tone === "error") return;
      const timeout = window.setTimeout(() => setNotice(null), 5200);
      return () => window.clearTimeout(timeout);
    });
  });
  $effect(() => {
    void [setInternetAvailable];
    return untrack(() => {
      if (bootStarted.current) return;
      bootStarted.current = true;
      api
        .welcomeState()
        .then((state) => setIsWelcomeOpen(state.show))
        .catch(() => setIsWelcomeOpen(shouldShowWelcome()));
      api
        .bootstrapDependencies()
        .then((result) => {
          setDependencies(result);
          setInternetAvailable(result.internetAvailable);
        })
        .catch(() => setInternetAvailable(navigator.onLine))
        .finally(() => setBootInfoLoaded(true));
    });
  });
  function closeWelcome() {
    localStorage.setItem(welcomeStorageKey, "true");
    void api.markWelcomeSeen().catch(() => undefined);
    setIsWelcomeOpen(false);
    updater.showAvailableUpdateReminder();
  }
  const openFeedback = () => {
    if (feedbackPrivacyAccepted) setIsFeedbackOpen(true);
    else setIsFeedbackPrivacyOpen(true);
  };
  function acceptFeedbackPrivacy() {
    localStorage.setItem(feedbackPrivacyStorageKey, "true");
    setFeedbackPrivacyAccepted(true);
    setIsFeedbackPrivacyOpen(false);
    setIsFeedbackOpen(true);
  }
  return {
    get notice() {
      return notice;
    },
    get updateReminderActive() {
      return updateReminderActive;
    },
    get importToastActive() {
      return importToastActive;
    },
    get fileWorkflow() {
      return fileWorkflow;
    },
    get language() {
      return language;
    },
    get conversionWorkflow() {
      return conversionWorkflow;
    },
    get feedbackLauncherActive() {
      return feedbackLauncherActive;
    },
    get openFeedback() {
      return openFeedback;
    },
    get openSettings() {
      return openSettings;
    },
    get isWelcomeOpen() {
      return isWelcomeOpen;
    },
    closeWelcome,
    get sessionGuard() {
      return sessionGuard;
    },
    get ocrJobId() {
      return ocrJobId;
    },
    get isSettingsOpen() {
      return isSettingsOpen;
    },
    get theme() {
      return theme;
    },
    get dependencies() {
      return dependencies;
    },
    get notificationsEnabled() {
      return notificationsEnabled;
    },
    get updater() {
      return updater;
    },
    get closeSettings() {
      return closeSettings;
    },
    get setLanguage() {
      return setLanguage;
    },
    setNotificationsEnabled,
    get recovery() {
      return recovery;
    },
    get installUpdate() {
      return installUpdate;
    },
    get isFeedbackPrivacyOpen() {
      return isFeedbackPrivacyOpen;
    },
    acceptFeedbackPrivacy,
    setIsFeedbackPrivacyOpen,
    get isFeedbackOpen() {
      return isFeedbackOpen;
    },
    setIsFeedbackOpen,
    setNotice,
    get ocrFile() {
      return ocrFile;
    },
    get closeOcr() {
      return closeOcr;
    },
    get showNotice() {
      return showNotice;
    },
    get registerOcrTask() {
      return registerOcrTask;
    },
    get showFormats() {
      return showFormats;
    },
    setOcrFile,
    get restoreBatch() {
      return restoreBatch;
    },
    get showFiles() {
      return showFiles;
    },
    get startConversion() {
      return startConversion;
    },
    get resetConversion() {
      return resetConversion;
    },
    get cancelConversions() {
      return cancelConversions;
    },
    get continueConversions() {
      return continueConversions;
    },
    get showOutputSettings() {
      return showOutputSettings;
    },
    get exportDownloads() {
      return exportDownloads;
    },
    get exportFolder() {
      return exportFolder;
    },
    get revealFolder() {
      return revealFolder;
    },
    get retryFile() {
      return retryFile;
    },
    get retryFailed() {
      return retryFailed;
    },
  };
}
