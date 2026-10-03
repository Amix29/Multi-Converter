import type { PdfEditorSessionV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";

interface PdfDigitizeGateProps {
  language: LanguageCode;
  session: PdfEditorSessionV1;
  locked: boolean;
  dialogOpen: boolean;
  busy: boolean;
  progress: number;
  pageNumber: number;
  error: string | null;
  onOpen(): void;
  onClose(): void;
  onConfirm(): void;
  onCancel(): void;
}

export function PdfDigitizeGate(props: PdfDigitizeGateProps) {
  if (!props.locked) return null;
  const allowed = props.session.permissions.canModify;
  return (
    <>
      <section className="pdf-digitize-gate" aria-labelledby="pdf-digitize-gate-title">
        <span aria-hidden="true">▤</span>
        <div>
          <strong id="pdf-digitize-gate-title">{t(props.language, "pdfEditor.scannedTitle")}</strong>
          <p>{t(props.language, allowed
            ? "pdfEditor.scannedDescription"
            : "pdfEditor.scannedPermissionDenied")}</p>
        </div>
        <button type="button" disabled={!allowed} onClick={props.onOpen}>
          {t(props.language, "pdfEditor.editThisPdf")}
        </button>
      </section>
      {props.dialogOpen && (
        <div className="pdf-dialog-backdrop" role="presentation">
          <section
            className="pdf-digitize-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-digitize-title"
            aria-describedby="pdf-digitize-description"
          >
            <span className="editor-eyebrow">{t(props.language, "pdfEditor.localOcr")}</span>
            <h2 id="pdf-digitize-title">{t(props.language, "pdfEditor.digitizeTitle")}</h2>
            <p id="pdf-digitize-description">{t(props.language, "pdfEditor.digitizeDescription")}</p>
            {props.busy && (
              <div className="pdf-digitize-progress" role="status" aria-live="polite">
                <div>
                  <strong>{t(props.language, "pdfEditor.digitizingPage", {
                    page: props.pageNumber,
                    count: props.session.pageCount,
                  })}</strong>
                  <span>{Math.round(props.progress)}%</span>
                </div>
                <progress max="100" value={props.progress} aria-label={t(props.language, "pdfEditor.digitizeProgress")} />
              </div>
            )}
            {props.error && <p className="pdf-dialog-error" role="alert">{props.error}</p>}
            <div className="pdf-digitize-actions">
              {props.busy ? (
                <button type="button" className="is-danger" onClick={props.onCancel}>
                  {t(props.language, "common.cancel")}
                </button>
              ) : (
                <>
                  <button type="button" onClick={props.onClose}>
                    {t(props.language, "common.cancel")}
                  </button>
                  <button type="button" className="is-primary" onClick={props.onConfirm}>
                    {t(props.language, "pdfEditor.digitizeAndEdit")}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
