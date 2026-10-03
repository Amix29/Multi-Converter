import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { t, type LanguageCode } from "../i18n";

interface PdfPasswordDialogProps {
  language: LanguageCode;
  sourceName: string;
  busy: boolean;
  error?: string | null;
  onCancel(): void;
  onSubmit(password: string): void;
}

export function PdfPasswordDialog(props: PdfPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || props.busy) return;
      event.preventDefault();
      props.onCancel();
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      window.requestAnimationFrame(() => previousFocus.current?.focus());
    };
  }, [props.busy, props.onCancel]);

  function trapFocus(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(formRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled),button:not(:disabled)") ?? []);
    const first = controls[0];
    const last = controls[controls.length - 1];
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
      <form
        ref={formRef}
        className="pdf-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit(password);
          setPassword("");
        }}
      >
        <span className="editor-eyebrow">{t(props.language, "pdfEditor.encrypted")}</span>
        <h2 id={titleId}>{t(props.language, "pdfEditor.passwordTitle")}</h2>
        <p>{t(props.language, "pdfEditor.passwordDescription", { name: props.sourceName })}</p>
        <label>
          <span>{t(props.language, "pdfEditor.password")}</span>
          <input
            ref={inputRef}
            type="password"
            value={password}
            autoComplete="off"
            disabled={props.busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {props.error && <p className="pdf-dialog-error" role="alert">{props.error}</p>}
        <div>
          <button type="button" disabled={props.busy} onClick={props.onCancel}>
            {t(props.language, "common.cancel")}
          </button>
          <button className="is-primary" type="submit" disabled={props.busy || !password}>
            {props.busy ? t(props.language, "pdfEditor.opening") : t(props.language, "pdfEditor.unlock")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
