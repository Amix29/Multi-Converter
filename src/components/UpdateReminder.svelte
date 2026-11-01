<script lang="ts">
  import { Button } from "./ui/button/index.js";
  
  

  import { t, type LanguageCode } from "../i18n";
  
  import { type AppUpdateInfo, type UpdateDownloadSize, type UpdateStatus } from "../lib/updateService";
  

  function updateDownloadSizeLabel(size: UpdateDownloadSize) {
    const downloaded = formatMegabytes(size.downloaded);
    return size.total
      ? `${downloaded} / ${formatMegabytes(size.total)}`
      : downloaded;
  }
  function formatMegabytes(bytes: number) {
    const value = bytes / (1024 * 1024);
    return `${Math.max(0, Math.round(value))} Mo`;
  }
  function updateDetailsTrigger() {
    return document.querySelector<HTMLElement>("[data-update-details-trigger]");
  }
  let props: {
    isVisible: boolean;
    language: LanguageCode;
    updateInfo: AppUpdateInfo | null;
    updateStatus: UpdateStatus;
    onInstall(): void;
    onOpenDetails(): void;
  } = $props();
  let installing = $derived(props.updateStatus === "installing");
</script>

{#if !(!props.isVisible || !props.updateInfo)}<aside
    class="update-reminder"
    data-testid="update-reminder"
    role="status"
    aria-live="polite"
  >
    <div>
      <span>{t(props.language, "update.availableBadge")}</span>
      <strong>
        {t(props.language, "update.reminderTitle", {
          version: props.updateInfo.version,
        })}
      </strong>
      <button
        data-update-details-trigger
        type="button"
        onclick={props.onOpenDetails}
      >
        {t(props.language, "update.details")}
      </button>
    </div>
    <Button
      variant="unstyled"
      size="inherit"
      class="primary-button"
      type="button"
      disabled={installing}
      onclick={props.onInstall}
    >
      {installing
        ? t(props.language, "update.installing")
        : t(props.language, "update.install")}
    </Button>
  </aside>{/if}
