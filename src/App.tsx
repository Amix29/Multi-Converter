import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ImportToast, PageNotice } from "./app/components/AppNotices";
import {
  appModeStorageKey,
  feedbackPrivacyStorageKey,
  notificationsStorageKey,
  readStoredFeedbackPrivacyAccepted,
  readStoredNotificationsEnabled,
  shouldShowWelcome,
  welcomeStorageKey,
} from "./app/conversion/model";
import { useConversionWorkflow } from "./app/conversion/useConversionWorkflow";
import { useFileWorkflow } from "./app/conversion/useFileWorkflow";
import { FeedbackDialog, FeedbackPrivacyDialog } from "./app/feedback/FeedbackOverlays";
import { AppTopbar } from "./app/layout/AppTopbar";
import { FilesScreen } from "./app/screens/FilesScreen";
import { FormatScreen } from "./app/screens/FormatScreen";
import { ProgressScreen } from "./app/screens/ProgressScreen";
import { SettingsPanel } from "./app/settings/SettingsPanel";
import type { Notice, NoticeTone } from "./app/types";
import { useStableEvent } from "./app/useStableEvent";
import { WelcomePanel } from "./app/welcome/WelcomePanel";
import { UpdateDialog, UpdateInstallDialog, UpdateReminder } from "./components/UpdateFlow";
import { useAppUpdater } from "./hooks/useAppUpdater";
import { t, useI18n } from "./i18n";
import { api, type AppMode } from "./lib/api";
import { repositoryUrl } from "./lib/updateService";
import { ImageOcrDialog } from "./ocr/ImageOcrDialog";
import type { FileItem } from "./app/types";
import "./editor/editor.css";
import "./editor/editor-workspace-polish.css";

const EditorWorkspace = lazy(() => import("./editor/EditorWorkspace").then((module) => ({ default: module.EditorWorkspace })));
const isTauriRuntime = "__TAURI_INTERNALS__" in window;

export default function App() {
  const { language, setLanguage } = useI18n();
  const bootStarted = useRef(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(readStoredNotificationsEnabled);
  const [bootInfoLoaded, setBootInfoLoaded] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(shouldShowWelcome);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isFeedbackPrivacyOpen, setIsFeedbackPrivacyOpen] = useState(false);
  const [feedbackPrivacyAccepted, setFeedbackPrivacyAccepted] = useState(readStoredFeedbackPrivacyAccepted);
  const [appMode, setAppMode] = useState<AppMode>(() => localStorage.getItem(appModeStorageKey) === "editor" ? "editor" : "converter");
  const [editorWasOpened, setEditorWasOpened] = useState(appMode === "editor");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [ocrFile, setOcrFile] = useState<FileItem | null>(null);
  const showNotice = useCallback((tone: NoticeTone, message: string) => {
    setNotice({ id: Date.now(), tone, message });
  }, []);

  const fileWorkflow = useFileWorkflow({ appMode, language, showNotice });
  const conversionWorkflow = useConversionWorkflow({
    files: fileWorkflow.files,
    language,
    notificationsEnabled,
    setFiles: fileWorkflow.setFiles,
    setStep: fileWorkflow.setStep,
    showNotice,
  });
  const updater = useAppUpdater({ bootInfoLoaded, isTauriRuntime, isWelcomeOpen, language, showNotice });
  const setInternetAvailable = useStableEvent(updater.setInternetAvailable);
  const startConversion = useStableEvent(conversionWorkflow.startConversion);
  const cancelConversions = useStableEvent(conversionWorkflow.cancelConversions);
  const continueConversions = useStableEvent(conversionWorkflow.continueConversions);
  const resetConversion = useStableEvent(conversionWorkflow.resetAll);
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
  const feedbackLauncherActive = appMode === "converter"
    && fileWorkflow.step === 1
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
    localStorage.setItem(appModeStorageKey, appMode);
    if (appMode === "editor") setEditorWasOpened(true);
  }, [appMode]);

  useEffect(() => {
    if (!notice) return;
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
      .then((dependencies) => setInternetAvailable(dependencies.internetAvailable))
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
    <main className={`app-shell ${appMode === "editor" ? "is-editor-mode" : ""} ${updateReminderActive ? "has-update-reminder" : ""} ${importToastActive ? "has-import-toast" : ""}`}>
      <AppTopbar
        appMode={appMode}
        step={fileWorkflow.step}
        language={language}
        isConverting={conversionWorkflow.isConverting}
        feedbackVisible={feedbackLauncherActive}
        onAppMode={setAppMode}
        onFeedback={openFeedback}
        onSettings={openSettings}
        onStep={fileWorkflow.setStep}
      />

      <WelcomePanel isOpen={isWelcomeOpen} language={language} onClose={closeWelcome} />
      <SettingsPanel
        isOpen={isSettingsOpen}
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
        onCheckForUpdate={() => void updater.checkForAppUpdate(true)}
        onInstallUpdate={() => void updater.installAvailableUpdate()}
      />
      <UpdateDialog
        isOpen={updater.isUpdateDialogOpen}
        language={language}
        updateInfo={updater.updateInfo}
        updateStatus={updater.updateStatus}
        updateDownloadProgress={updater.updateDownloadProgress}
        updateDownloadSize={updater.updateDownloadSize}
        onInstall={() => void updater.installAvailableUpdate()}
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
            onInstall={() => void updater.installAvailableUpdate()}
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
      <ImageOcrDialog
        isOpen={Boolean(ocrFile)}
        language={language}
        fileName={ocrFile?.name ?? ""}
        path={ocrFile?.path ?? ""}
        onClose={closeOcr}
        onNotice={showNotice}
      />

      {appMode === "converter" && (
        <>
          <FilesScreen
            isActive={fileWorkflow.step === 1}
            language={language}
            files={fileWorkflow.files}
            isConverting={conversionWorkflow.isConverting}
            isDragOver={fileWorkflow.isDragOver}
            onAddFiles={fileWorkflow.addPickedFiles}
            onClear={fileWorkflow.resetFiles}
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
            onRevealFolder={revealFolder}
            onRetryFile={retryFile}
            onRetryFailed={retryFailed}
          />
        </>
      )}

      {editorWasOpened && (
        <Suspense fallback={appMode === "editor" ? <div className="editor-loading">{t(language, "editor.loading")}</div> : null}>
          <EditorWorkspace
            isActive={appMode === "editor"}
            language={language}
            nativeDropRequest={fileWorkflow.editorDropRequest}
            onNotice={showNotice}
          />
        </Suspense>
      )}
    </main>
  );
}
