import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";
import { useModalAccessibility } from "../hooks/useModalAccessibility";
import { t, type LanguageCode } from "../i18n";
import { api, type OcrDocumentResultV1, type OcrProgressV1 } from "../lib/api";

export function ImageOcrDialog(props: {
  isOpen: boolean;
  language: LanguageCode;
  fileName: string;
  path: string;
  onClose(): void;
  onNotice(tone: "info" | "success" | "error", message: string): void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const jobIdRef = useRef("");
  const [result, setResult] = useState<OcrDocumentResultV1 | null>(null);
  const [progress, setProgress] = useState<OcrProgressV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useModalAccessibility({
    isOpen: props.isOpen,
    surfaceRef,
    initialFocusRef: closeButtonRef,
    onEscape: running ? undefined : props.onClose,
  });

  useEffect(() => {
    if (!props.isOpen) return;
    const jobId = crypto.randomUUID();
    jobIdRef.current = jobId;
    setResult(null);
    setProgress({ schemaVersion: 1, jobId, progress: 0, phase: "starting", pageNumber: 1, pageCount: 1 });
    setError(null);
    setRunning(true);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void api.onOcrProgress((payload) => {
      if (!disposed && payload.jobId === jobId) setProgress(payload);
    }).then((listener) => { unlisten = listener; });
    void api.recognizeImage(props.path, jobId)
      .then((value) => { if (!disposed) setResult(value); })
      .catch((reason: unknown) => {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!disposed) setRunning(false); });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [props.isOpen, props.path]);

  useEffect(() => {
    if (props.isOpen && running) cancelButtonRef.current?.focus();
  }, [props.isOpen, running]);

  useEffect(() => {
    if (!props.isOpen || running) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !surfaceRef.current?.contains(active)) {
      closeButtonRef.current?.focus();
    }
  }, [props.isOpen, running]);

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

  async function cancel() {
    if (!running) return;
    await api.cancelOcr(jobIdRef.current);
  }

  return (
    <div className="ocr-backdrop">
      <div ref={surfaceRef} className="ocr-dialog" role="dialog" aria-modal="true" aria-labelledby="ocr-title" tabIndex={-1}>
        <header className="ocr-dialog-header">
          <div>
            <span>{t(props.language, "ocr.eyebrow")}</span>
            <h2 id="ocr-title">{t(props.language, "ocr.title")}</h2>
            <p>{props.fileName}</p>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" disabled={running} onClick={props.onClose} aria-label={t(props.language, "common.close")}>×</button>
        </header>

        {running && (
          <section className="ocr-progress" aria-live="polite">
            <div><strong>{t(props.language, "ocr.processing")}</strong><span>{progress?.progress ?? 0}%</span></div>
            <progress max="100" value={progress?.progress ?? 0} />
            <button ref={cancelButtonRef} className="ghost-button" type="button" onClick={() => void cancel()}>{t(props.language, "common.cancel")}</button>
          </section>
        )}

        {error && <div className="ocr-error" role="alert">{error}</div>}
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
          <button className="ghost-button" type="button" disabled={running} onClick={props.onClose}>{t(props.language, "common.close")}</button>
          <button className="primary-button" type="button" disabled={!result?.text} onClick={() => void copyResult()}>{t(props.language, "ocr.copy")}</button>
        </footer>
      </div>
    </div>
  );
}
