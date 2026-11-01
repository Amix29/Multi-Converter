<script lang="ts">
  import { Button } from "../components/ui/button/index.js";
  import { resolveStateUpdate, type StateSetter } from "../lib/stateUpdate";

  import ModalSurface from "../components/ModalSurface.svelte";
  import { untrack } from "svelte";
  import { styleString } from "../lib/styleString";
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { t, type LanguageCode, type TranslationKey } from "../i18n";
  import { api, type OcrDocumentResultV1, type OcrProgressV1 } from "../lib/api";

  function ocrPhaseLabel(language: LanguageCode, phase: string) {
    const keyByPhase: Record<string, string> = {
      starting: "ocr.phase.starting",
      "locating-runtime": "ocr.phase.preparing",
      "extracting-runtime": "ocr.phase.extracting",
      "verifying-runtime": "ocr.phase.verifying",
      "verifying-models": "ocr.phase.verifying",
      preparing: "ocr.phase.preparingImage",
      "preparing-image": "ocr.phase.preparingImage",
      recognizing: "ocr.phase.recognizing",
      normalizing: "ocr.phase.normalizing",
      completed: "ocr.phase.completed",
      canceling: "ocr.phase.cancelling",
    };
    return t(
      language,
      (keyByPhase[phase] || "ocr.processing") as TranslationKey,
    );
  }
  function cleanOcrError(reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    return message.replace(/^[A-Z][A-Z0-9_]+:/, "");
  }
  let props: {
    isOpen: boolean;
    language: LanguageCode;
    fileName: string;
    path: string;
    onClose(): void;
    onTask?(task: { jobId: string; completion: Promise<void> }): void;
    onNotice(tone: "info" | "success" | "error", message: string): void;
  } = $props();
  const surfaceRef: { current: HTMLDivElement | null } = $state({
    current: null,
  });
  const closeButtonRef: { current: HTMLButtonElement | null } = $state({
    current: null,
  });
  const cancelButtonRef: { current: HTMLButtonElement | null } = $state({
    current: null,
  });
  const retryButtonRef: { current: HTMLButtonElement | null } = $state({
    current: null,
  });
  const jobIdRef = { current: "" };
  const taskRef: { current: Promise<void> | null | null } = { current: null };
  const sequenceRef = { current: 0 };
  const cancelledJobs = { current: new Set<string>() };
  let attempt = $state.raw(0);
  const setAttempt: StateSetter<typeof attempt> = (value) => {
    attempt = resolveStateUpdate(value, attempt);
  };
  let result = $state.raw<OcrDocumentResultV1 | null>(null);
  const setResult: StateSetter<typeof result> = (value) => {
    result = resolveStateUpdate(value, result);
  };
  let progress = $state.raw<OcrProgressV1 | null>(null);
  const setProgress: StateSetter<typeof progress> = (value) => {
    progress = resolveStateUpdate(value, progress);
  };
  let error = $state.raw<string | null>(null);
  const setError: StateSetter<typeof error> = (value) => {
    error = resolveStateUpdate(value, error);
  };
  let running = $state.raw(false);
  const setRunning: StateSetter<boolean> = (value) => {
    running = resolveStateUpdate(value, running);
  };
  let cancelling = $state.raw(false);
  const setCancelling: StateSetter<boolean> = (value) => {
    cancelling = resolveStateUpdate(value, cancelling);
  };
  let cancelled = $state.raw(false);
  const setCancelled: StateSetter<boolean> = (value) => {
    cancelled = resolveStateUpdate(value, cancelled);
  };
  $effect(() => {
    void [attempt, props.isOpen, props.path];
    return untrack(() => {
      if (!props.isOpen) return;
      const sequence = ++sequenceRef.current;
      const jobId = crypto.randomUUID();
      jobIdRef.current = jobId;
      setResult(null);
      setProgress({
        schemaVersion: 1,
        jobId,
        progress: 0,
        phase: "starting",
        pageNumber: 1,
        pageCount: 1,
      });
      setError(null);
      setCancelled(false);
      setCancelling(false);
      setRunning(true);
      let disposed = false;
      let unlisten: (() => void) | undefined;
      void api
        .onOcrProgress((payload) => {
          if (
            !disposed &&
            sequenceRef.current === sequence &&
            payload.jobId === jobId &&
            !cancelledJobs.current.has(jobId)
          ) {
            setProgress(payload);
          }
        })
        .then((listener) => {
          if (disposed) listener();
          else unlisten = listener;
        });
      const completion = api
        .recognizeImage(props.path, jobId)
        .then((value) => {
          if (
            !disposed &&
            sequenceRef.current === sequence &&
            !cancelledJobs.current.has(jobId)
          )
            setResult(value);
        })
        .catch((reason: unknown) => {
          if (
            disposed ||
            sequenceRef.current !== sequence ||
            cancelledJobs.current.has(jobId)
          )
            return;
          setError(cleanOcrError(reason));
        })
        .finally(() => {
          if (!disposed && sequenceRef.current === sequence) {
            setRunning(false);
            setCancelling(false);
          }
        });
      taskRef.current = completion;
      props.onTask?.({ jobId, completion });
      return () => {
        disposed = true;
        unlisten?.();
      };
    });
  });
  $effect(() => {
    void [props.isOpen, running];
    return untrack(() => {
      if (props.isOpen && running) cancelButtonRef.current?.focus();
    });
  });
  $effect(() => {
    void [cancelled, cancelling, error, props.isOpen, running];
    return untrack(() => {
      if (props.isOpen && !running && !cancelling && (cancelled || error)) {
        retryButtonRef.current?.focus();
      }
    });
  });
  async function copyResult() {
    if (!result?.text) return;
    try {
      if ("__TAURI_INTERNALS__" in window) await writeText(result.text);
      else await navigator.clipboard.writeText(result.text);
      props.onNotice("success", t(props.language, "ocr.copied"));
    } catch (reason) {
      props.onNotice(
        "error",
        reason instanceof Error ? reason.message : String(reason),
      );
    }
  }
  async function cancel(closeAfter = false) {
    const jobId = jobIdRef.current;
    const completion = taskRef.current;
    if (!jobId || (!running && !cancelling)) {
      if (closeAfter) props.onClose();
      return;
    }
    cancelledJobs.current.add(jobId);
    sequenceRef.current += 1;
    setCancelling(true);
    setCancelled(true);
    setRunning(false);
    if (closeAfter) props.onClose();
    try {
      await api.cancelOcr(jobId);
      await completion;
    } catch (reason) {
      props.onNotice("error", cleanOcrError(reason));
    } finally {
      setCancelling(false);
      if (!closeAfter) {
        window.requestAnimationFrame(() => retryButtonRef.current?.focus());
      }
    }
  }
  let phase = $derived(
    cancelling ? "canceling" : progress?.phase || "starting",
  );
  let indeterminate = $derived(
    phase === "starting" || phase === "recognizing" || phase === "canceling",
  );
  let percentage = $derived(
    Math.min(100, Math.max(0, progress?.progress ?? 0)),
  );
</script>

{#if !!props.isOpen}<ModalSurface
    bind:ref={surfaceRef.current}
    class="ocr-dialog"
    role="dialog"
    aria-labelledby="ocr-title"
    open={props.isOpen}
    overlayClass="ocr-backdrop"
    initialFocus={() => cancelButtonRef.current}
    onEscape={() => {
      if (running || cancelling) void cancel(true);
      else props.onClose();
    }}
  >
    <header class="ocr-dialog-header">
      <div>
        <span>{t(props.language, "ocr.eyebrow")}</span>
        <h2 id="ocr-title">{t(props.language, "ocr.title")}</h2>
        <p title={props.fileName}>{props.fileName}</p>
      </div>
      <button
        bind:this={closeButtonRef.current}
        class="icon-button"
        type="button"
        onclick={() => {
          if (running || cancelling) void cancel(true);
          else props.onClose();
        }}
        aria-label={t(props.language, "common.close")}>×</button
      >
    </header>
    {#if running || cancelling}<section class="ocr-progress" aria-live="polite">
        <div class="ocr-progress-heading">
          <span class="ocr-progress-phase"
            >{ocrPhaseLabel(props.language, phase)}</span
          >
          {#if !indeterminate}<strong>{percentage}%</strong>{/if}
        </div>
        <div
          class={`ocr-progress-track ${indeterminate ? "is-indeterminate" : ""}`}
          role="progressbar"
          aria-label={ocrPhaseLabel(props.language, phase)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : percentage}
        >
          <span
            style={styleString(
              indeterminate ? undefined : { width: `${percentage}%` },
            )}
          ></span>
        </div>
        <p class="ocr-progress-hint">
          {indeterminate
            ? t(props.language, "ocr.progressIndeterminate")
            : t(props.language, "ocr.progressPreparing")}
        </p>
        <Button
          variant="unstyled"
          size="inherit"
          bind:ref={cancelButtonRef.current}
          class="ghost-button"
          type="button"
          disabled={cancelling}
          onclick={() => void cancel(false)}
        >
          {cancelling
            ? t(props.language, "ocr.cancelling")
            : t(props.language, "common.cancel")}
        </Button>
      </section>{/if}
    {#if error}<div class="ocr-error" role="alert">
        <strong>{t(props.language, "ocr.failed")}</strong>
        <p>{error}</p>
        <Button
          variant="unstyled"
          size="inherit"
          bind:ref={retryButtonRef.current}
          class="ghost-button"
          type="button"
          onclick={() => setAttempt((value) => value + 1)}
          >{t(props.language, "ocr.retry")}</Button
        >
      </div>{/if}
    {#if cancelled && !cancelling && !result && !error}<div
        class="ocr-cancelled"
        role="status"
      >
        <strong>{t(props.language, "ocr.cancelled")}</strong>
        <Button
          variant="unstyled"
          size="inherit"
          bind:ref={retryButtonRef.current}
          class="ghost-button"
          type="button"
          onclick={() => setAttempt((value) => value + 1)}
          >{t(props.language, "ocr.retry")}</Button
        >
      </div>{/if}
    {#if result}<section class="ocr-result">
        <label for="ocr-text">{t(props.language, "ocr.result")}</label>
        <textarea id="ocr-text" readonly value={result.text} rows={14}
        ></textarea>
        {#if !result.text}<p class="ocr-empty-result" role="status">
            {t(props.language, "ocr.empty")}
          </p>{/if}
        {#if result.warnings.length > 0}<ul>
            {#each result.warnings as warning, index (`${warning.code}-${index}`)}<li
              >
                {warning.message}
              </li>{/each}
          </ul>{/if}
      </section>{/if}
    <footer class="ocr-actions">
      <Button
        variant="unstyled"
        size="inherit"
        class="ghost-button"
        type="button"
        onclick={() => {
          if (running || cancelling) void cancel(true);
          else props.onClose();
        }}>{t(props.language, "common.close")}</Button
      >
      <Button
        variant="unstyled"
        size="inherit"
        class="primary-button"
        type="button"
        disabled={!result?.text || running || cancelling}
        onclick={() => void copyResult()}
        >{t(props.language, "ocr.copy")}</Button
      >
    </footer>
  </ModalSurface>{/if}
