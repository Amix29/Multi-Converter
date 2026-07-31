import { t, type LanguageCode } from "../../i18n";
import { importAnalyzingText, importedFilesText } from "../conversion/model";
import type { ImportFeedback, Notice } from "../types";
import { CloseIcon } from "./Icons";

export function PageNotice(props: { language: LanguageCode; notice: Notice | null; onDismiss(): void }) {
  if (!props.notice) return null;
  return (
    <aside className={`page-notice is-${props.notice.tone}`} role="status" aria-live="polite">
      <span />
      <p>{props.notice.message}</p>
      <button type="button" aria-label={t(props.language, "app.close")} onClick={props.onDismiss}><CloseIcon /></button>
    </aside>
  );
}

export function ImportToast(props: { language: LanguageCode; feedback: ImportFeedback }) {
  if (!props.feedback?.visible) return null;
  const label = props.feedback.state === "analyzing"
    ? props.feedback.count
      ? importAnalyzingText(props.language, props.feedback.count)
      : t(props.language, "import.analyzingUnknown")
    : importedFilesText(props.language, props.feedback.count);

  return (
    <aside className={`import-toast is-${props.feedback.state}`} role="status" aria-live="polite">
      <span className="import-spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        {props.feedback.state === "analyzing" && <div className="import-progress" aria-hidden="true"><span /></div>}
      </div>
    </aside>
  );
}
