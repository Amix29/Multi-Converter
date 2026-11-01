<script lang="ts">
  import { styleString } from "../lib/styleString";

  import { t, type LanguageCode } from "../i18n";

  import { type UpdateDownloadSize } from "../lib/updateService";

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
    language: LanguageCode;
    progress: number | null;
    size?: UpdateDownloadSize | null;
  } = $props();
  let label = $derived(
    props.progress === null
      ? t(props.language, "update.installing")
      : t(props.language, "update.progress", { progress: props.progress }),
  );
  let sizeLabel = $derived(
    props.size ? updateDownloadSizeLabel(props.size) : null,
  );
</script>

<div
  class={`update-progress ${props.progress === null ? "is-indeterminate" : ""}`}
>
  <div class="update-progress-header">
    <span>{label}</span>
    {#if sizeLabel}<strong>{sizeLabel}</strong>{/if}
  </div>
  <div
    class="progress-track"
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={props.progress ?? undefined}
  >
    <div
      class="progress-bar"
      style={styleString(
        props.progress === null ? undefined : { width: `${props.progress}%` },
      )}
    ></div>
  </div>
</div>
