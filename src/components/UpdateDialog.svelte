<script lang="ts">
  import { Button } from "./ui/button/index.js";
  import { resolveStateUpdate, type StateSetter } from "../lib/stateUpdate";

  import ModalSurface from "./ModalSurface.svelte";
  import { untrack } from "svelte";

  import { t, type LanguageCode } from "../i18n";
  import {
    releaseNotesForLanguage,
    translateReleaseNotesForLanguage,
  } from "../lib/releaseNotes";
  import {
    releasePageUrl,
    type AppUpdateInfo,
    type UpdateDownloadSize,
    type UpdateStatus,
  } from "../lib/updateService";
  import ReleaseNotesMarkdown from "./ReleaseNotesMarkdown.svelte";
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
    isOpen: boolean;
    language: LanguageCode;
    updateInfo: AppUpdateInfo | null;
    updateStatus: UpdateStatus;
    updateDownloadProgress: number | null;
    updateDownloadSize: UpdateDownloadSize | null;
    onInstall(): void;
    onCancel(): void;
  } = $props();
  const dialogRef: { current: HTMLElement | null } = $state({ current: null });
  const cancelButtonRef: { current: HTMLButtonElement | null } = $state({
    current: null,
  });
  let rawReleaseNotes = $derived(props.updateInfo?.body?.trim() ?? "");
  let localizedReleaseNotes = $state.raw("");
  const setLocalizedReleaseNotes: StateSetter<typeof localizedReleaseNotes> = (
    value,
  ) => {
    localizedReleaseNotes = resolveStateUpdate(value, localizedReleaseNotes);
  };
  let installing = $derived(props.updateStatus === "installing");
  $effect(() => {
    void [props.isOpen, props.language, rawReleaseNotes];
    return untrack(() => {
      if (!props.isOpen || !rawReleaseNotes) {
        setLocalizedReleaseNotes("");
        return;
      }
      let disposed = false;
      setLocalizedReleaseNotes(
        releaseNotesForLanguage(rawReleaseNotes, props.language),
      );
      translateReleaseNotesForLanguage(rawReleaseNotes, props.language).then(
        (translated) => {
          if (!disposed) setLocalizedReleaseNotes(translated);
        },
      );
      return () => {
        disposed = true;
      };
    });
  });
  let releaseNotes = $derived(localizedReleaseNotes.trim());
</script>

{#if !(!props.isOpen || !props.updateInfo)}<ModalSurface
    bind:ref={dialogRef.current}
    class="update-dialog"
    role="dialog"
    aria-labelledby="update-dialog-title"
    onmousedown={(event) => event.stopPropagation()}
    open={props.isOpen && Boolean(props.updateInfo)}
    overlayClass="update-overlay"
    initialFocus={() => cancelButtonRef.current}
    onEscape={installing ? undefined : props.onCancel}
    returnFocus={updateDetailsTrigger}
  >
    <header>
      <span class="label">{t(props.language, "update.label")}</span>
      <h2 id="update-dialog-title">
        {t(props.language, "update.dialogTitle", {
          version: props.updateInfo.version,
        })}
      </h2>
    </header>
    <div
      class="update-version-hero"
      aria-label={t(props.language, "update.latestVersion", {
        version: props.updateInfo.version,
      })}
    >
      <span>{t(props.language, "update.availableBadge")}</span>
      <strong>{props.updateInfo.version}</strong>
    </div>
    <p>
      {t(props.language, "update.dialogBody", {
        current: props.updateInfo.currentVersion,
        latest: props.updateInfo.version,
      })}
    </p>
    <section
      class="update-release-notes"
      aria-label={t(props.language, "update.releaseNotes")}
    >
      <strong>{t(props.language, "update.releaseNotes")}</strong>
      {#if releaseNotes}<ReleaseNotesMarkdown body={releaseNotes} />{:else}<p>
          {t(props.language, "update.noReleaseNotes")}
        </p>{/if}
    </section>
    {#if installing}<UpdateProgress
        language={props.language}
        progress={props.updateDownloadProgress}
        size={props.updateDownloadSize}
      />{/if}
    <a
      class="release-link"
      href={releasePageUrl(props.updateInfo.version)}
      target="_blank"
      rel="noreferrer"
    >
      {t(props.language, "update.openRelease")}
    </a>
    <div class="update-actions">
      <Button
        variant="unstyled"
        size="inherit"
        bind:ref={cancelButtonRef.current}
        class="secondary-button"
        type="button"
        disabled={installing}
        onclick={props.onCancel}
      >
        {t(props.language, "update.cancel")}
      </Button>
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
    </div>
  </ModalSurface>{/if}
