import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { t, type LanguageCode } from "../i18n";

interface PdfDiscardDialogProps {
  language: LanguageCode;
  onCancel(): void;
  onConfirm(): void;
}

export function PdfDiscardDialog(props: PdfDiscardDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      props.onCancel();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
      window.requestAnimationFrame(() => previousFocus.current?.focus());
    };
  }, [props.onCancel]);

  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (buttons.length < 2) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return createPortal(
    <div className="pdf-dialog-backdrop">
      <div
        ref={dialogRef}
        className="pdf-discard-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
      >
        <h2 id={titleId}>{t(props.language, "pdfEditor.discardTitle")}</h2>
        <p>{t(props.language, "pdfEditor.discardDescription")}</p>
        <div>
          <button ref={cancelRef} type="button" onClick={props.onCancel}>
            {t(props.language, "common.cancel")}
          </button>
          <button className="is-danger" type="button" onClick={props.onConfirm}>
            {t(props.language, "pdfEditor.discard")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
