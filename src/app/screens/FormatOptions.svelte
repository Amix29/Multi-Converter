<script lang="ts">
  import type { FileItem } from "../types";
  import type { MediaMode, QualityProfile } from "../../lib/api";
  import type { LanguageCode } from "../../i18n";
  import MediaModeSelector from "./MediaModeSelector.svelte";
  import QualityProfileSelector from "./QualityProfileSelector.svelte";
  import { supportsStreamCopy } from "../conversion/mediaOptions";
  import { supportsQualityProfile } from "./qualitySupport";
  let props: {
    file: FileItem;
    language: LanguageCode;
    qualityProfile: QualityProfile;
    onQualityProfile(value: QualityProfile): void;
    onMediaMode(fileId: string, value: MediaMode): void;
  } = $props();
</script>

{#if supportsStreamCopy(props.file)}
  <MediaModeSelector
    language={props.language}
    value={props.file.mediaMode ?? "convert"}
    onChange={(value) => props.onMediaMode(props.file.id, value)}
  />
{/if}
{#if props.file.mediaMode !== "copy" && supportsQualityProfile(props.file.selectedFormat, props.file.sourceFormat)}
  <QualityProfileSelector
    language={props.language}
    value={props.qualityProfile}
    onChange={props.onQualityProfile}
  />
{/if}
