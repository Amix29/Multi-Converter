import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ImportToast, PageNotice } from "./app/components/AppNotices";
import { SessionGuardDialog } from "./app/components/SessionGuardDialog";
import { useSessionGuard } from "./app/conversion/useSessionGuard";
import {
  feedbackPrivacyStorageKey,
  notificationsStorageKey,
  readStoredFeedbackPrivacyAccepted,
  readStoredNotificationsEnabled,
  shouldShowWelcome,
  welcomeStorageKey,
} from "./app/conversion/model";
import { useConversionWorkflow } from "./app/conversion/useConversionWorkflow";
import { useFileWorkflow } from "./app/conversion/useFileWorkflow";
import { useBatchRecovery } from "./app/conversion/useBatchRecovery";
import { restoredFiles } from "./app/conversion/recoveryModel";
import { selectUniqueImports } from "./app/conversion/largeListModel";
import { RecoveryBanner } from "./app/components/RecoveryBanner";
import { FeedbackDialog, FeedbackPrivacyDialog } from "./app/feedback/FeedbackOverlays";
import { AppTopbar } from "./app/layout/AppTopbar";
import { FilesScreen } from "./app/screens/FilesScreen";
import { FormatScreen } from "./app/screens/FormatScreen";
import { ProgressScreen } from "./app/screens/ProgressScreen";
import type { Notice, NoticeTone } from "./app/types";
import { useStableEvent } from "./app/useStableEvent";
import { WelcomePanel } from "./app/welcome/WelcomePanel";
import { UpdateDialog, UpdateInstallDialog, UpdateReminder } from "./components/UpdateFlow";
import { useAppUpdater } from "./hooks/useAppUpdater";
import { t, useI18n } from "./i18n";
import { api, type DependencyBootstrap } from "./lib/api";
import { repositoryUrl } from "./lib/updateService";
import type { FileItem } from "./app/types";

const isTauriRuntime = "__TAURI_INTERNALS__" in window;
const SettingsPanel = lazy(() => import("./app/settings/SettingsPanel").then((module) => ({ default: module.SettingsPanel })));
const ImageOcrDialog = lazy(() => import("./ocr/ImageOcrDialog").then((module) => ({ default: module.ImageOcrDialog })));

export default function App() {
  const { language, setLanguage } = useI18n();
  const bootStarted = useRef(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(readStoredNotificationsEnabled);
  const [bootInfoLoaded, setBootInfoLoaded] = useState(false);
  const [dependencies, setDependencies] = useState<DependencyBootstrap | null>(null);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(shouldShowWelcome);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isFeedbackPrivacyOpen, setIsFeedbackPrivacyOpen] = useState(false);
  const [feedbackPrivacyAccepted, setFeedbackPrivacyAccepted] = useState(readStoredFeedbackPrivacyAccepted);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [ocrFile, setOcrFile] = useState<FileItem | null>(null);
  const [ocrJobId, setOcrJobId] = useState<string | null>(null);
  const ocrTask = useRef<{ jobId: string; completion: Promise<void> } | null>(null);
  const registerOcrTask = useStableEvent((task: { jobId: string; completion: Promise<void> }) => {
    ocrTask.current = task;
    setOcrJobId(task.jobId);
    const finished = () => {
      if (ocrTask.current?.jobId !== task.jobId) return;
      ocrTask.current = null;
      setOcrJobId(null);
    };
    void task.completion.then(finished, finished);
  });
  const showNotice = useCallback((tone: NoticeTone, message: string) => {
    setNotice({ id: Date.now(), tone, message });
  }, []);

  const fileWorkflow = useFileWorkflow({ language, showNotice });
  const recovery = useBatchRecovery({ language, showNotice });
  const conversionWorkflow = useConversionWorkflow({
    files: fileWorkflow.files,
    language,
    notificationsEnabled,
    setFiles: fileWorkflow.setFiles,
    setStep: fileWorkflow.setStep,
    showNotice,
    beforeBatch: recovery.saveBeforeBatch,
    onReset: recovery.clear,
  });
  const restoreBatch = useStableEvent(async () => {
    if (fileWorkflow.files.length || conversionWorkflow.isConverting) return;
    const restored = await recovery.restore();
    if (!restored) return;
    const incoming = restoredFiles(restored.descriptions, restored.plan);
    fileWorkflow.setFiles((current) => [...current, ...selectUniqueImports(current, incoming).accepted]);
    conversionWorkflow.setQualityProfile(restored.plan.qualityProfile);
    fileWorkflow.setStep(2);
  });
  const updater = useAppUpdater({ bootInfoLoaded, isTauriRuntime, isWelcomeOpen, language, showNotice });
  const setInternetAvailable = useStableEvent(updater.setInternetAvailable);
  const sessionGuard = useSessionGuard({
    isConverting: conversionWorkflow.isConverting || Boolean(ocrJobId),
    isExporting: conversionWorkflow.isExporting,
    hasUnexportedResults: conversionWorkflow.hasUnexportedResults,
    async cancelAndWait() {
      const activeOcr = ocrTask.current;
      await Promise.all([
        conversionWorkflow.cancelAndWait(),
        activeOcr ? api.cancelOcr(activeOcr.jobId).then(() => activeOcr.completion) : Promise.resolve(),
      ]);
    },
    onError: () => showNotice("error", t(language, "session.busy")),
  });
  const startConversion = useStableEvent(() => sessionGuard.request(conversionWorkflow.startConversion));
  const installUpdate = useStableEvent(() => {
    updater.cancelUpdateDialog();
    setIsSettingsOpen(false);
    sessionGuard.request(updater.installAvailableUpdate);
  });
  const cancelConversions = useStableEvent(conversionWorkflow.cancelConversions);
  const continueConversions = useStableEvent(conversionWorkflow.continueConversions);
  const resetConversion = useStableEvent(() => sessionGuard.request(conversionWorkflow.resetAll));
  const retryFile = useStableEvent(conversionWorkflow.retryFile);
  const retryFailed = useStableEvent(conversionWorkflow.retryFailedConversions);
  const exportFolder = useStableEvent(conversionWorkflow.exportResultsToFolder);
  const revealFolder = useStableEvent(conversionWorkflow.revealCurrentFolder);
  const exportDownloads = useStableEvent(() => conversionWorkflow.exportResults(
    "downloads",
    (paths, entries) => api.exportToDownloads(paths, conversionWorkflow.outputDir, entries),
  ));
  const showFormats = useCallback(() => fileWorkflow.setStep(2), [fileWorkflow.setStep]);
  const showFiles = useCallback(() => fileWorkflow.setStep(1), [fileWorkflow.setStep]);
  const showOutputSettings = useCallback(() => fileWorkflow.setStep(2), [fileWorkflow.setStep]);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);
  const closeOcr = useCallback(() => setOcrFile(null), []);

  const updateReminderActive = updater.updateReminderVisible
    && Boolean(updater.updateInfo)
    && !isSettingsOpen
    && !isWelcomeOpen
    && !updater.isUpdateDialogOpen;
  const feedbackLauncherActive = fileWorkflow.step === 1
    && !isSettingsOpen
    && !isWelcomeOpen
    && !updater.isUpdateDialogOpen
    && updater.updateStatus !== "installing"
    && !isFeedbackOpen
    && !isFeedbackPrivacyOpen;
  const importToastActive = Boolean(fileWorkflow.importFeedback?.visible);

  useEffect(() => {
    localStorage.setItem(notificationsStorageKey, notificationsEnabled ? "true" : "false");
  }, [notificationsEnabled]);

  useEffect(() => {
    if (!notice || notice.tone === "error") return;
    const timeout = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    api.welcomeState()
      .then((state) => setIsWelcomeOpen(state.show))
      .catch(() => setIsWelcomeOpen(shouldShowWelcome()));
    api.bootstrapDependencies()
      .then((result) => {
        setDependencies(result);
        setInternetAvailable(result.internetAvailable);
      })
      .catch(() => setInternetAvailable(navigator.onLine))
      .finally(() => setBootInfoLoaded(true));
  }, [setInternetAvailable]);

  function closeWelcome() {
    localStorage.setItem(welcomeStorageKey, "true");
    void api.markWelcomeSeen().catch(() => undefined);
    setIsWelcomeOpen(false);
    updater.showAvailableUpdateReminder();
  }

  const openFeedback = useCallback(() => {
    if (feedbackPrivacyAccepted) setIsFeedbackOpen(true);
    else setIsFeedbackPrivacyOpen(true);
  }, [feedbackPrivacyAccepted]);

  function acceptFeedbackPrivacy() {
    localStorage.setItem(feedbackPrivacyStorageKey, "true");
    setFeedbackPrivacyAccepted(true);
    setIsFeedbackPrivacyOpen(false);
    setIsFeedbackOpen(true);
  }

  return (
    <main className={`app-shell ${notice ? "has-page-notice" : ""} ${updateReminderActive ? "has-update-reminder" : ""} ${importToastActive ? "has-import-toast" : ""}`}>
      <AppTopbar
        step={fileWorkflow.step}
        language={language}
        isConverting={conversionWorkflow.isConverting}
        feedbackVisible={feedbackLauncherActive}
        onFeedback={openFeedback}
        onSettings={openSettings}
        onStep={fileWorkflow.setStep}
      />

      <WelcomePanel isOpen={isWelcomeOpen} language={language} onClose={closeWelcome} />
      <SessionGuardDialog isOpen={sessionGuard.isOpen} isConfirming={sessionGuard.isConfirming}
        isConverting={conversionWorkflow.isConverting || Boolean(ocrJobId)} language={language}
        onCancel={sessionGuard.dismiss} onConfirm={() => void sessionGuard.confirm()} />
      {isSettingsOpen && <Suspense fallback={<span role="status">{t(language, "common.loading")}</span>}><SettingsPanel
        isOpen={isSettingsOpen}
        dependencies={dependencies}
        language={language}
        notificationsEnabled={notificationsEnabled}
        internetAvailable={updater.internetAvailable}
        currentVersion={updater.currentVersion}
        updateInfo={updater.updateInfo}
        updateStatus={updater.updateStatus}
        updateDownloadProgress={updater.updateDownloadProgress}
        updateDownloadSize={updater.updateDownloadSize}
        onClose={closeSettings}
        onLanguage={setLanguage}
        onNotificationsEnabled={setNotificationsEnabled}
        recoveryEnabled={recovery.enabled}
        recoveryBusy={recovery.isBusy || recovery.isLoading}
        onRecoveryEnabled={recovery.configure}
        onCheckForUpdate={() => void updater.checkForAppUpdate(true)}
        onInstallUpdate={installUpdate}
      /></Suspense>}
      <UpdateDialog
        isOpen={updater.isUpdateDialogOpen}
        language={language}
        updateInfo={updater.updateInfo}
        updateStatus={updater.updateStatus}
        updateDownloadProgress={updater.updateDownloadProgress}
        updateDownloadSize={updater.updateDownloadSize}
        onInstall={installUpdate}
        onCancel={updater.cancelUpdateDialog}
      />
      <UpdateInstallDialog
        isVisible={updater.updateStatus === "installing"}
        language={language}
        updateInfo={updater.updateInfo}
        progress={updater.updateDownloadProgress}
        size={updater.updateDownloadSize}
      />

      {updateReminderActive && (
        <div className="floating-corner" data-testid="floating-corner">
          <UpdateReminder
            isVisible
            language={language}
            updateInfo={updater.updateInfo}
            updateStatus={updater.updateStatus}
            onInstall={installUpdate}
            onOpenDetails={() => updater.setIsUpdateDialogOpen(true)}
          />
        </div>
      )}

      <FeedbackPrivacyDialog
        isOpen={isFeedbackPrivacyOpen}
        language={language}
        repositoryUrl={repositoryUrl}
        onAccept={acceptFeedbackPrivacy}
        onClose={() => setIsFeedbackPrivacyOpen(false)}
      />
      <FeedbackDialog
        isOpen={isFeedbackOpen}
        language={language}
        currentVersion={updater.currentVersion}
        onClose={() => setIsFeedbackOpen(false)}
      />
      <PageNotice language={language} notice={notice} onDismiss={() => setNotice(null)} />
      {ocrFile && <Suspense fallback={<span role="status">{t(language, "common.loading")}</span>}><ImageOcrDialog
        isOpen={Boolean(ocrFile)}
        language={language}
        fileName={ocrFile?.name ?? ""}
        path={ocrFile?.path ?? ""}
        onClose={closeOcr}
        onNotice={showNotice}
        onTask={registerOcrTask}
      /></Suspense>}

      <FilesScreen
        recovery={recovery.pending && <RecoveryBanner language={language} count={recovery.pending.files.length} isBusy={recovery.isBusy} onRestore={restoreBatch} onForget={recovery.clear} />}
        isActive={fileWorkflow.step === 1}
        language={language}
        files={fileWorkflow.files}
        isConverting={conversionWorkflow.isConverting}
        isDragOver={fileWorkflow.isDragOver}
        onAddFiles={fileWorkflow.addPickedFiles}
        onClear={() => sessionGuard.request(async () => {
          await conversionWorkflow.resetAll();
          fileWorkflow.resetFiles();
        })}
        onClearUnsupported={fileWorkflow.removeUnsupported}
        onDragOver={fileWorkflow.setIsDragOver}
        onDrop={fileWorkflow.handleHtmlDrop}
        onFormats={showFormats}
        onExtractText={setOcrFile}
        onRemove={fileWorkflow.removeFile}
      />
      <ImportToast language={language} feedback={fileWorkflow.importFeedback} />
      <FormatScreen
        isActive={fileWorkflow.step === 2}
        language={language}
        files={fileWorkflow.files}
        isConverting={conversionWorkflow.isConverting}
        onBack={showFiles}
        onChooseFileFormat={fileWorkflow.applyFileFormat}
        onApplyCompatibleFormat={fileWorkflow.applyCompatibleFormat}
        qualityProfile={conversionWorkflow.qualityProfile}
        onQualityProfile={conversionWorkflow.setQualityProfile}
        onMediaMode={fileWorkflow.applyMediaMode}
        onStart={startConversion}
      />
      <ProgressScreen
        isActive={fileWorkflow.step === 3}
        language={language}
        files={fileWorkflow.files}
        exportResult={conversionWorkflow.exportResult}
        isConverting={conversionWorkflow.isConverting}
        isCancelling={conversionWorkflow.isCancelling}
        isExporting={conversionWorkflow.isExporting}
        isTempOutputCleaned={conversionWorkflow.isTempOutputCleaned}
        onNew={resetConversion}
        onCancel={cancelConversions}
        onContinue={continueConversions}
        onBackToSettings={showOutputSettings}
        onExportDownloads={exportDownloads}
        onExportFolder={exportFolder}
        onExportReport={conversionWorkflow.exportBatchReport}
        onRevealFolder={revealFolder}
        onRetryFile={retryFile}
        onRetryFailed={retryFailed}
      />

    </main>
  );
}
