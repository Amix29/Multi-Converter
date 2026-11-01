<script lang="ts">
  
  
  import { t, type LanguageCode } from "../../i18n";
  import { importAnalyzingText, importedFilesText } from "../conversion/model";
  import type { ImportFeedback } from "../types";
  

  let props: {
    language: LanguageCode;
    feedback: ImportFeedback;
  } = $props();
  let label = $derived(
    !props.feedback
      ? ""
      : props.feedback.state === "analyzing"
        ? props.feedback.count
          ? importAnalyzingText(props.language, props.feedback.count)
          : t(props.language, "import.analyzingUnknown")
        : importedFilesText(props.language, props.feedback.count),
  );
</script>

{#if !!props.feedback?.visible}<aside
    class={`import-toast is-${props.feedback.state}`}
    role="status"
    aria-live="polite"
  >
    <span class="import-spinner" aria-hidden="true"></span>
    <div>
      <strong>{label}</strong>
      {#if props.feedback.state === "analyzing"}<div
          class="import-progress"
          aria-hidden="true"
        >
          <span></span>
        </div>{/if}
    </div>
  </aside>{/if}
