<script lang="ts">
  import ModalSurface from "./ModalSurface.svelte";
  
  
  import { t, type LanguageCode } from "../i18n";
  
  import { type AppUpdateInfo, type UpdateDownloadSize } from "../lib/updateService";
  
  import UpdateProgress from "./UpdateProgress.svelte";
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
    progress: number | null;
    size: UpdateDownloadSize | null;
  } = $props();
  const dialogRef: { current: HTMLElement | null } = $state({ current: null });
  let version = $derived(props.updateInfo?.version ?? "");
</script>

{#if !!props.isVisible}<ModalSurface
    bind:ref={dialogRef.current}
    class="update-install-dialog"
    role="alertdialog"
    aria-labelledby="update-install-title"
    open={props.isVisible}
    overlayClass="update-install-overlay"
  >
    <span class="label">{t(props.language, "update.label")}</span>
    <h2 id="update-install-title">
      {t(props.language, "update.installingTitle", { version })}
    </h2>
    <p>{t(props.language, "update.installingBody")}</p>
    <UpdateProgress
      language={props.language}
      progress={props.progress}
      size={props.size}
    />
  </ModalSurface>{/if}
