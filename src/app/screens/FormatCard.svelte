<script lang="ts">
  import type { ConversionIntent, FileItem } from "../types";

  let props: {
    intent: ConversionIntent;
    file: FileItem;
    onChoose(fileId: string, format: string): void;
  } = $props();
  let selected = $derived(
    props.file.selectedFormat === props.intent.target.format,
  );
</script>

<button
  class={`format-card ${selected ? "is-selected" : ""}`}
  type="button"
  aria-pressed={selected}
  onclick={() => props.onChoose(props.file.id, props.intent.target.format)}
>
  <strong>{props.intent.target.label}</strong>
  <span class="format-extension"
    >{props.intent.target.extension || props.intent.target.format}</span
  >
</button>
