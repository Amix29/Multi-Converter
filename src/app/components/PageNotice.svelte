<script lang="ts">
  import { t, type LanguageCode } from "../../i18n";

  import type { Notice } from "../types";
  import CloseIcon from "./CloseIcon.svelte";

  let props: {
    language: LanguageCode;
    notice: Notice | null;
    onDismiss(): void;
  } = $props();
</script>

{#if !!props.notice}<aside
    class={`page-notice is-${props.notice.tone}`}
    role={props.notice.tone === "error" ? "alert" : "status"}
    aria-live={props.notice.tone === "error" ? "assertive" : "polite"}
  >
    <span></span>
    <p>{props.notice.message}</p>
    <button
      type="button"
      aria-label={t(props.language, "app.close")}
      onclick={props.onDismiss}><CloseIcon /></button
    >
  </aside>{/if}
