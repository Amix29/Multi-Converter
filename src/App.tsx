import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import { WelcomePanel } from "./app/welcome/WelcomePanel";
import { UpdateDialog, UpdateInstallDialog, UpdateReminder } from "./components/UpdateFlow";
import { useAppUpdater } from "./hooks/useAppUpdater";
import { t, useI18n } from "./i18n";
import { api, type AppMode } from "./lib/api";
import { repositoryUrl } from "./lib/updateService";
import { ImageOcrDialog } from "./ocr/ImageOcrDialog";
import type { FileItem } from "./app/types";
import "./editor/editor.css";

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
      .then((dependencies) => updater.setInternetAvailable(dependencies.internetAvailable))
      .catch(() => updater.setInternetAvailable(navigator.onLine))
      .finally(() => setBootInfoLoaded(true));
  }, [language]);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ id: Date.now(), tone, message });
  }

  function closeWelcome() {
    localStorage.setItem(welcomeStorageKey, "true");
    void api.markWelcomeSeen().catch(() => undefined);
    setIsWelcomeOpen(false);
    updater.showAvailableUpdateReminder();
  }

  function openFeedback() {
    if (feedbackPrivacyAccepted) setIsFeedbackOpen(true);
    else setIsFeedbackPrivacyOpen(true);
  }

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
        onSettings={() => setIsSettingsOpen(true)}
        onStep={(step) => fileWorkflow.setStep(step)}
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
        onClose={() => setIsSettingsOpen(false)}
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
        onClose={() => setOcrFile(null)}
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
            onAddFiles={() => void fileWorkflow.addPickedFiles()}
            onClear={fileWorkflow.resetFiles}
            onDragOver={fileWorkflow.setIsDragOver}
            onDrop={(event) => void fileWorkflow.handleHtmlDrop(event)}
            onFormats={() => fileWorkflow.setStep(2)}
            onExtractText={setOcrFile}
            onRemove={fileWorkflow.removeFile}
          />
          <ImportToast language={language} feedback={fileWorkflow.importFeedback} />
          <FormatScreen
            isActive={fileWorkflow.step === 2}
            language={language}
            files={fileWorkflow.files}
            isConverting={conversionWorkflow.isConverting}
            onBack={() => fileWorkflow.setStep(1)}
            onChooseFileFormat={fileWorkflow.applyFileFormat}
            onStart={() => void conversionWorkflow.startConversion()}
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
            onNew={conversionWorkflow.resetAll}
            onCancel={() => void conversionWorkflow.cancelConversions()}
            onContinue={() => void conversionWorkflow.continueConversions()}
            onBackToSettings={() => fileWorkflow.setStep(2)}
            onExportDownloads={() => void conversionWorkflow.exportResults("downloads", (paths) => api.exportToDownloads(paths, conversionWorkflow.outputDir))}
            onExportFolder={() => void conversionWorkflow.exportResultsToFolder()}
            onRevealFolder={() => void conversionWorkflow.revealCurrentFolder()}
            onRetryFile={(fileId) => void conversionWorkflow.retryFile(fileId)}
            onRetryFailed={() => void conversionWorkflow.retryFailedConversions()}
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
