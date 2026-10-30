import { useRef } from "react";
import { useModalAccessibility } from "../../hooks/useModalAccessibility";
import { t, type LanguageCode } from "../../i18n";

export function SessionGuardDialog(props: {
  isOpen: boolean;
  isConfirming: boolean;
  isConverting: boolean;
  language: LanguageCode;
  onCancel(): void;
  onConfirm(): void;
}) {
  const surfaceRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useModalAccessibility({
    isOpen: props.isOpen,
    surfaceRef,
    initialFocusRef: cancelRef,
    onEscape: props.isConfirming ? undefined : props.onCancel,
  });
  if (!props.isOpen) return null;
  return (
    <div className="feedback-overlay">
      <section ref={surfaceRef} className="feedback-panel" role="alertdialog"
        aria-modal="true" aria-labelledby="session-guard-title" aria-describedby="session-guard-description" tabIndex={-1}>
        <h2 id="session-guard-title">{t(props.language, "session.title")}</h2>
        <p id="session-guard-description">{t(props.language, props.isConverting ? "session.running" : "session.unsaved")}</p>
        <div className="screen-actions">
          <button ref={cancelRef} className="primary-button" type="button" disabled={props.isConfirming} onClick={props.onCancel}>
            {t(props.language, "session.stay")}
          </button>
          <button className="secondary-button" type="button" disabled={props.isConfirming} onClick={props.onConfirm}>
            {t(props.language, props.isConfirming ? "progress.canceling" : "session.discard")}
          </button>
        </div>
      </section>
    </div>
  );
}
