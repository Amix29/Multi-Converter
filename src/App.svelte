<script lang="ts">
  import { repositoryUrl } from "./lib/updateService";
  import { t } from "./i18n";
  import ImportToast from "./app/components/ImportToast.svelte";
  import PageNotice from "./app/components/PageNotice.svelte";
  import SessionGuardDialog from "./app/components/SessionGuardDialog.svelte";
  import RecoveryBanner from "./app/components/RecoveryBanner.svelte";
  import FeedbackDialog from "./app/feedback/FeedbackDialog.svelte";
  import FeedbackPrivacyDialog from "./app/feedback/FeedbackPrivacyDialog.svelte";
  import AppTopbar from "./app/layout/AppTopbar.svelte";
  import FilesScreen from "./app/screens/FilesScreen.svelte";
  import FormatScreen from "./app/screens/FormatScreen.svelte";
  import ProgressScreen from "./app/screens/ProgressScreen.svelte";
  import WelcomePanel from "./app/welcome/WelcomePanel.svelte";
  import UpdateDialog from "./components/UpdateDialog.svelte";
  import UpdateInstallDialog from "./components/UpdateInstallDialog.svelte";
  import UpdateReminder from "./components/UpdateReminder.svelte";
  import { createApplication } from "./app/application.svelte.js";
  const application = createApplication();
</script>

<main
  class={`app-shell ${application.notice ? "has-page-notice" : ""} ${application.updateReminderActive ? "has-update-reminder" : ""} ${application.importToastActive ? "has-import-toast" : ""}`}
>
  <AppTopbar
    step={application.fileWorkflow.step}
    language={application.language}
    isConverting={application.conversionWorkflow.isConverting}
    feedbackVisible={application.feedbackLauncherActive}
    onFeedback={application.openFeedback}
    onSettings={application.openSettings}
    onStep={application.fileWorkflow.setStep}
  />
  <WelcomePanel
    isOpen={application.isWelcomeOpen}
    language={application.language}
    onClose={application.closeWelcome}
  />
  <SessionGuardDialog
    isOpen={application.sessionGuard.isOpen}
    isConfirming={application.sessionGuard.isConfirming}
    isConverting={application.conversionWorkflow.isConverting ||
      Boolean(application.ocrJobId)}
    language={application.language}
    onCancel={application.sessionGuard.dismiss}
    onConfirm={() => void application.sessionGuard.confirm()}
  />
  {#if application.isSettingsOpen}{#await import("./app/settings/SettingsPanel.svelte")}<span
        role="status">{t(application.language, "common.loading")}</span
      >{:then loaded}<loaded.default
        theme={application.theme.preference}
        onTheme={application.theme.setPreference}
        isOpen={application.isSettingsOpen}
        dependencies={application.dependencies}
        language={application.language}
        notificationsEnabled={application.notificationsEnabled}
        internetAvailable={application.updater.internetAvailable}
        currentVersion={application.updater.currentVersion}
        updateInfo={application.updater.updateInfo}
        updateStatus={application.updater.updateStatus}
        updateDownloadProgress={application.updater.updateDownloadProgress}
        updateDownloadSize={application.updater.updateDownloadSize}
        onClose={application.closeSettings}
        onLanguage={application.setLanguage}
        onNotificationsEnabled={application.setNotificationsEnabled}
        recoveryEnabled={application.recovery.enabled}
        recoveryBusy={application.recovery.isBusy ||
          application.recovery.isLoading}
        onRecoveryEnabled={application.recovery.configure}
        onCheckForUpdate={() =>
          void application.updater.checkForAppUpdate(true)}
        onInstallUpdate={application.installUpdate}
      />{/await}{/if}
  <UpdateDialog
    isOpen={application.updater.isUpdateDialogOpen}
    language={application.language}
    updateInfo={application.updater.updateInfo}
    updateStatus={application.updater.updateStatus}
    updateDownloadProgress={application.updater.updateDownloadProgress}
    updateDownloadSize={application.updater.updateDownloadSize}
    onInstall={application.installUpdate}
    onCancel={application.updater.cancelUpdateDialog}
  />
  <UpdateInstallDialog
    isVisible={application.updater.updateStatus === "installing"}
    language={application.language}
    updateInfo={application.updater.updateInfo}
    progress={application.updater.updateDownloadProgress}
    size={application.updater.updateDownloadSize}
  />
  {#if application.updateReminderActive}<div
      class="floating-corner"
      data-testid="floating-corner"
    >
      <UpdateReminder
        isVisible
        language={application.language}
        updateInfo={application.updater.updateInfo}
        updateStatus={application.updater.updateStatus}
        onInstall={application.installUpdate}
        onOpenDetails={() => application.updater.setIsUpdateDialogOpen(true)}
      />
    </div>{/if}
  <FeedbackPrivacyDialog
    isOpen={application.isFeedbackPrivacyOpen}
    language={application.language}
    {repositoryUrl}
    onAccept={application.acceptFeedbackPrivacy}
    onClose={() => application.setIsFeedbackPrivacyOpen(false)}
  />
  <FeedbackDialog
    isOpen={application.isFeedbackOpen}
    language={application.language}
    currentVersion={application.updater.currentVersion}
    onClose={() => application.setIsFeedbackOpen(false)}
  />
  <PageNotice
    language={application.language}
    notice={application.notice}
    onDismiss={() => application.setNotice(null)}
  />
  {#if application.ocrFile}{#await import("./ocr/ImageOcrDialog.svelte")}<span
        role="status">{t(application.language, "common.loading")}</span
      >{:then loaded}<loaded.default
        isOpen={Boolean(application.ocrFile)}
        language={application.language}
        fileName={application.ocrFile?.name ?? ""}
        path={application.ocrFile?.path ?? ""}
        onClose={application.closeOcr}
        onNotice={application.showNotice}
        onTask={application.registerOcrTask}
      />{/await}{/if}
  <FilesScreen
    isActive={application.fileWorkflow.step === 1}
    language={application.language}
    files={application.fileWorkflow.files}
    isConverting={application.conversionWorkflow.isConverting}
    isDragOver={application.fileWorkflow.isDragOver}
    onAddFiles={application.fileWorkflow.addPickedFiles}
    onClear={() =>
      application.sessionGuard.request(async () => {
        await application.conversionWorkflow.resetAll();
        application.fileWorkflow.resetFiles();
      })}
    onClearUnsupported={application.fileWorkflow.removeUnsupported}
    onDragOver={application.fileWorkflow.setIsDragOver}
    onDrop={application.fileWorkflow.handleHtmlDrop}
    onFormats={application.showFormats}
    onExtractText={application.setOcrFile}
    onRemove={application.fileWorkflow.removeFile}
    >{#snippet recoveryContent()}{#if application.recovery.pending}<RecoveryBanner
          language={application.language}
          count={application.recovery.pending.files.length}
          isBusy={application.recovery.isBusy}
          onRestore={application.restoreBatch}
          onForget={application.recovery.clear}
        />{/if}{/snippet}</FilesScreen
  >
  <ImportToast
    language={application.language}
    feedback={application.fileWorkflow.importFeedback}
  />
  <FormatScreen
    isActive={application.fileWorkflow.step === 2}
    language={application.language}
    files={application.fileWorkflow.files}
    isConverting={application.conversionWorkflow.isConverting}
    onBack={application.showFiles}
    onChooseFileFormat={application.fileWorkflow.applyFileFormat}
    onApplyCompatibleFormat={application.fileWorkflow.applyCompatibleFormat}
    qualityProfile={application.conversionWorkflow.qualityProfile}
    onQualityProfile={application.conversionWorkflow.setQualityProfile}
    onMediaMode={application.fileWorkflow.applyMediaMode}
    onStart={application.startConversion}
  />
  <ProgressScreen
    isActive={application.fileWorkflow.step === 3}
    language={application.language}
    files={application.fileWorkflow.files}
    exportResult={application.conversionWorkflow.exportResult}
    isConverting={application.conversionWorkflow.isConverting}
    isCancelling={application.conversionWorkflow.isCancelling}
    isExporting={application.conversionWorkflow.isExporting}
    isTempOutputCleaned={application.conversionWorkflow.isTempOutputCleaned}
    onNew={application.resetConversion}
    onCancel={application.cancelConversions}
    onContinue={application.continueConversions}
    onBackToSettings={application.showOutputSettings}
    onExportDownloads={application.exportDownloads}
    onExportFolder={application.exportFolder}
    onExportReport={application.conversionWorkflow.exportBatchReport}
    onRevealFolder={application.revealFolder}
    onRetryFile={application.retryFile}
    onRetryFailed={application.retryFailed}
  />
</main>
