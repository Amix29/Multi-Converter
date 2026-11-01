<script lang="ts">
  import { t, type LanguageCode } from "../../i18n";

  import {
    compactFileMeta,
    displayFileName,
    hasAvailableTargets,
    targetForFormat,
  } from "../conversion/model";
  import type { FileItem } from "../types";

  let props: {
    file: FileItem;
    language: LanguageCode;
    isActive: boolean;
    onActivate(fileId: string): void;
  } = $props();
  let supported = $derived(hasAvailableTargets(props.file));
  let target = $derived(
    props.file.selectedFormat
      ? targetForFormat(props.file, props.file.selectedFormat)
      : null,
  );
  let selectedLabel = $derived(
    props.file.selectedFormat
      ? (
          target?.extension ||
          target?.label ||
          props.file.selectedFormat
        ).toUpperCase()
      : null,
  );
</script>

<button
  class={`rail-button ${props.isActive ? "is-active" : ""} ${props.file.selectedFormat ? "is-done" : ""}`}
  type="button"
  disabled={!supported}
  title={props.file.name}
  aria-label={props.file.name}
  onclick={() => props.onActivate(props.file.id)}
>
  <strong>{displayFileName(props.file)}</strong>
  <span class="rail-meta"
    >{supported
      ? compactFileMeta(props.file, props.language)
      : t(props.language, "format.unsupported")}</span
  >
  {#if supported}<span
      class={`rail-format ${selectedLabel ? "is-selected" : ""}`}
      >{selectedLabel ?? t(props.language, "format.choose")}</span
    >{/if}
</button>
