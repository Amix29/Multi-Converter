import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";
import { useModalAccessibility } from "../hooks/useModalAccessibility";
import { t, type LanguageCode, type TranslationKey } from "../i18n";
import { api, type OcrDocumentResultV1, type OcrProgressV1 } from "../lib/api";

export function ImageOcrDialog(props: {
  isOpen: boolean;
  language: LanguageCode;
  fileName: string;
  path: string;
  onClose(): void;
  onTask?(task: { jobId: string; completion: Promise<void> }): void;
  onNotice(tone: "info" | "success" | "error", message: string): void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const jobIdRef = useRef("");
  const taskRef = useRef<Promise<void> | null>(null);
  const sequenceRef = useRef(0);
  const cancelledJobs = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<OcrDocumentResultV1 | null>(null);
  const [progress, setProgress] = useState<OcrProgressV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useModalAccessibility({
    isOpen: props.isOpen,
    surfaceRef,
    initialFocusRef: cancelButtonRef,
    onEscape: () => {
      if (running || cancelling) void cancel(true);
      else props.onClose();
    },
  });

  useEffect(() => {
    if (!props.isOpen) return;
    const sequence = ++sequenceRef.current;
    const jobId = crypto.randomUUID();
    jobIdRef.current = jobId;
    setResult(null);
    setProgress({ schemaVersion: 1, jobId, progress: 0, phase: "starting", pageNumber: 1, pageCount: 1 });
    setError(null);
    setCancelled(false);
    setCancelling(false);
    setRunning(true);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void api.onOcrProgress((payload) => {
      if (!disposed && sequenceRef.current === sequence && payload.jobId === jobId && !cancelledJobs.current.has(jobId)) {
        setProgress(payload);
      }
    }).then((listener) => { if (disposed) listener(); else unlisten = listener; });
    const completion = api.recognizeImage(props.path, jobId)
      .then((value) => {
        if (!disposed && sequenceRef.current === sequence && !cancelledJobs.current.has(jobId)) setResult(value);
      })
      .catch((reason: unknown) => {
        if (disposed || sequenceRef.current !== sequence || cancelledJobs.current.has(jobId)) return;
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
  }, [attempt, props.isOpen, props.path]);

  useEffect(() => {
    if (props.isOpen && running) cancelButtonRef.current?.focus();
  }, [props.isOpen, running]);

  useEffect(() => {
    if (props.isOpen && !running && !cancelling && (cancelled || error)) {
      retryButtonRef.current?.focus();
    }
  }, [cancelled, cancelling, error, props.isOpen, running]);

  if (!props.isOpen) return null;

  async function copyResult() {
    if (!result?.text) return;
    try {
      if ("__TAURI_INTERNALS__" in window) await writeText(result.text);
      else await navigator.clipboard.writeText(result.text);
      props.onNotice("success", t(props.language, "ocr.copied"));
    } catch (reason) {
      props.onNotice("error", reason instanceof Error ? reason.message : String(reason));
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

  const phase = cancelling ? "canceling" : progress?.phase || "starting";
  const indeterminate = phase === "starting" || phase === "recognizing" || phase === "canceling";
  const percentage = Math.min(100, Math.max(0, progress?.progress ?? 0));

  return (
    <div className="ocr-backdrop">
      <div ref={surfaceRef} className="ocr-dialog" role="dialog" aria-modal="true" aria-labelledby="ocr-title" tabIndex={-1}>
        <header className="ocr-dialog-header">
          <div>
            <span>{t(props.language, "ocr.eyebrow")}</span>
            <h2 id="ocr-title">{t(props.language, "ocr.title")}</h2>
            <p title={props.fileName}>{props.fileName}</p>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={() => {
            if (running || cancelling) void cancel(true);
            else props.onClose();
          }} aria-label={t(props.language, "common.close")}>×</button>
        </header>

        {(running || cancelling) && (
          <section className="ocr-progress" aria-live="polite">
            <div className="ocr-progress-heading">
              <span className="ocr-progress-phase">{ocrPhaseLabel(props.language, phase)}</span>
              {!indeterminate && <strong>{percentage}%</strong>}
            </div>
            <div
              className={`ocr-progress-track ${indeterminate ? "is-indeterminate" : ""}`}
              role="progressbar"
              aria-label={ocrPhaseLabel(props.language, phase)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={indeterminate ? undefined : percentage}
            >
              <span style={indeterminate ? undefined : { width: `${percentage}%` }} />
            </div>
            <p className="ocr-progress-hint">{indeterminate ? t(props.language, "ocr.progressIndeterminate") : t(props.language, "ocr.progressPreparing")}</p>
            <button ref={cancelButtonRef} className="ghost-button" type="button" disabled={cancelling} onClick={() => void cancel(false)}>
              {cancelling ? t(props.language, "ocr.cancelling") : t(props.language, "common.cancel")}
            </button>
          </section>
        )}

        {error && (
          <div className="ocr-error" role="alert">
            <strong>{t(props.language, "ocr.failed")}</strong>
            <p>{error}</p>
            <button ref={retryButtonRef} className="ghost-button" type="button" onClick={() => setAttempt((value) => value + 1)}>{t(props.language, "ocr.retry")}</button>
          </div>
        )}
        {cancelled && !cancelling && !result && !error && (
          <div className="ocr-cancelled" role="status">
            <strong>{t(props.language, "ocr.cancelled")}</strong>
            <button ref={retryButtonRef} className="ghost-button" type="button" onClick={() => setAttempt((value) => value + 1)}>{t(props.language, "ocr.retry")}</button>
          </div>
        )}
        {result && (
          <section className="ocr-result">
            <label htmlFor="ocr-text">{t(props.language, "ocr.result")}</label>
            <textarea id="ocr-text" readOnly value={result.text} rows={14} />
            {!result.text && <p className="ocr-empty-result" role="status">{t(props.language, "ocr.empty")}</p>}
            {result.warnings.length > 0 && (
              <ul>{result.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul>
            )}
          </section>
        )}

        <footer className="ocr-actions">
          <button className="ghost-button" type="button" onClick={() => {
            if (running || cancelling) void cancel(true);
            else props.onClose();
          }}>{t(props.language, "common.close")}</button>
          <button className="primary-button" type="button" disabled={!result?.text || running || cancelling} onClick={() => void copyResult()}>{t(props.language, "ocr.copy")}</button>
        </footer>
      </div>
    </div>
  );
}

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
  return t(language, (keyByPhase[phase] || "ocr.processing") as TranslationKey);
}

function cleanOcrError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.replace(/^[A-Z][A-Z0-9_]+:/, "");
}
