<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  import ModalSurface from "../../components/ModalSurface.svelte";
  
  
  import { t, type LanguageCode } from "../../i18n";

  let props: {
    isOpen: boolean;
    isConfirming: boolean;
    isConverting: boolean;
    language: LanguageCode;
    onCancel(): void;
    onConfirm(): void;
  } = $props();
  const surfaceRef: { current: HTMLElement | null } = $state({ current: null });
  const cancelRef: { current: HTMLButtonElement | null } = $state({
    current: null,
  });
</script>

{#if !!props.isOpen}<ModalSurface
    bind:ref={surfaceRef.current}
    class="feedback-panel"
    role="alertdialog"
    aria-labelledby="session-guard-title"
    aria-describedby="session-guard-description"
    open={props.isOpen}
    overlayClass="feedback-overlay"
    initialFocus={() => cancelRef.current}
    onEscape={props.isConfirming ? undefined : props.onCancel}
  >
    <h2 id="session-guard-title">{t(props.language, "session.title")}</h2>
    <p id="session-guard-description">
      {t(
        props.language,
        props.isConverting ? "session.running" : "session.unsaved",
      )}
    </p>
    <div class="screen-actions">
      <Button
        variant="unstyled"
        size="inherit"
        bind:ref={cancelRef.current}
        class="primary-button"
        type="button"
        disabled={props.isConfirming}
        onclick={props.onCancel}
      >
        {t(props.language, "session.stay")}
      </Button>
      <Button
        variant="unstyled"
        size="inherit"
        class="secondary-button"
        type="button"
        disabled={props.isConfirming}
        onclick={props.onConfirm}
      >
        {t(
          props.language,
          props.isConfirming ? "progress.canceling" : "session.discard",
        )}
      </Button>
    </div>
  </ModalSurface>{/if}
