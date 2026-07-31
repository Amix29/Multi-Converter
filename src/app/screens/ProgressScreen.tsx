import { useRef, type CSSProperties } from "react";
import type { ExportResult } from "../../lib/api";
import { t, type LanguageCode } from "../../i18n";
import {
  clamp,
  displayFileName,
  exportedFilesText,
  progressErrorSummary,
  progressSummaryText,
} from "../conversion/model";
import { statusLabelKeys, type FileItem } from "../types";

export function ProgressScreen(props: {
  isActive: boolean;
  language: LanguageCode;
  files: FileItem[];
  exportResult: ExportResult | null;
  isConverting: boolean;
  isCancelling: boolean;
  isExporting: boolean;
  isTempOutputCleaned: boolean;
  onNew(): void;
  onCancel(): void;
  onContinue(): void;
  onBackToSettings(): void;
  onExportDownloads(): void;
  onExportFolder(): void;
  onRevealFolder(): void;
  onRetryFile(fileId: string): void;
  onRetryFailed(): void;
}) {
  const convertibles = props.files.filter((file) => file.selectedFormat);
  const completed = convertibles.filter((file) => file.status === "done").length;
  const failed = convertibles.filter((file) => file.status === "error").length;
  const canceled = convertibles.filter((file) => file.status === "canceled" || file.status === "canceling").length;
  const total = convertibles.length;
  const rawAverage = total
    ? Math.round(convertibles.reduce((sum, file) => sum + (file.status === "done" ? 100 : clamp(file.progress || 0, 0, 100)), 0) / total)
    : 0;
  const canExport = completed > 0 && !props.isConverting && !props.isExporting && !props.isTempOutputCleaned;
  const isFinished = total > 0 && !props.isConverting && completed + failed + canceled === total;
  const canContinue = !props.isConverting && convertibles.some((file) => file.status !== "done" && file.status !== "unsupported");
  const progressSessionKey = convertibles.map((file) => file.jobId).join("|");
  const lastGlobalProgressRef = useRef({ key: progressSessionKey, value: 0 });
  if (lastGlobalProgressRef.current.key !== progressSessionKey) lastGlobalProgressRef.current = { key: progressSessionKey, value: 0 };
  const average = isFinished && completed + failed + canceled === total && failed + canceled === 0 ? 100 : Math.max(lastGlobalProgressRef.current.value, rawAverage);
  lastGlobalProgressRef.current.value = average;

  let title = t(props.language, "progress.pendingTitle");
  let subtitle = t(props.language, "progress.pendingSubtitle");
  if (total && props.isConverting) {
    title = props.isCancelling ? t(props.language, "progress.cancelingTitle") : t(props.language, "progress.workingTitle");
    subtitle = "";
  } else if (canceled && completed + failed + canceled === total) {
    title = t(props.language, "progress.canceledTitle");
    subtitle = "";
  } else if (failed) {
    title = t(props.language, "progress.errorTitle");
    subtitle = progressErrorSummary(props.language, completed, failed);
  } else if (props.exportResult) {
    title = t(props.language, "progress.savedTitle");
    subtitle = t(props.language, "progress.exportReady");
  } else if (completed === total && total > 0) {
    title = t(props.language, "progress.doneTitle");
    subtitle = "";
  }

  return (
    <section className={`screen progress-screen ${props.isActive ? "is-active" : ""}`} aria-labelledby="progress-title">
      <section className="progress-panel">
        <section className="progress-hero">
          <div className="progress-dial-cluster">
            <div className="conversion-dial" aria-hidden="true">
              <span style={{ "--value": `${average}%` } as CSSProperties} />
              <strong>{average}%</strong>
            </div>
          </div>
          <div className="screen-copy compact">
            <h2 id="progress-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
            {props.exportResult && <p>{exportedFilesText(props.language, props.exportResult.files.length)}</p>}
            {total > 0 && <p className="conversion-count">{progressSummaryText(props.language, completed, failed, canceled, total)}</p>}
          </div>
        </section>

        <section className="job-list" aria-label={t(props.language, "app.progress")}>
          {!convertibles.length && <div className="empty-state">{t(props.language, "progress.empty")}</div>}
          {convertibles.map((file) => {
            const fileProgress = file.status === "done" ? 100 : file.status === "error" || file.status === "canceled" ? file.progress : clamp(file.progress, 0, 100);
            return (
              <article className="job-row" key={file.id}>
                <div className="job-main">
                  <div><strong>{displayFileName(file)}</strong><span>→ {(file.convertedFormat || file.selectedFormat || "").toUpperCase()}</span></div>
                  <em className={`job-state ${file.status === "done" ? "is-done" : ""} ${file.status === "error" ? "is-error" : ""}`}>
                    {t(props.language, statusLabelKeys[file.status])}
                  </em>
                </div>
                <div className="file-progress-line">
                  <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fileProgress}>
                    <div className={`progress-bar ${file.status === "error" ? "is-error" : ""}`} style={{ width: `${fileProgress}%` }} />
                  </div>
                  <span>{file.status === "done" ? "100%" : `${Math.floor(fileProgress)}%`}</span>
                </div>
                {file.status === "error" && isFinished && (
                  <button className="secondary-button retry-button" type="button" disabled={props.isExporting} onClick={() => props.onRetryFile(file.id)}>{t(props.language, "progress.retry")}</button>
                )}
              </article>
            );
          })}
        </section>

        <footer className="screen-actions progress-actions">
          <div className="conversion-actions">
            {props.isConverting ? (
              <button className="primary-button" type="button" disabled={props.isCancelling} onClick={props.onCancel}>
                {props.isCancelling ? t(props.language, "progress.canceling") : t(props.language, "progress.cancel")}
              </button>
            ) : (
              <>
                {props.files.length > 0 && <button className="ghost-button" type="button" disabled={props.isExporting} onClick={props.onNew}>{t(props.language, "progress.newConversion")}</button>}
                {canContinue && canceled > 0 && <button className="primary-button" type="button" disabled={props.isExporting} onClick={props.onContinue}>{t(props.language, "progress.continue")}</button>}
                {!isFinished && props.files.length > 0 && <button className="secondary-button" type="button" disabled={props.isExporting} onClick={props.onBackToSettings}>{t(props.language, "progress.modify")}</button>}
                {failed > 0 && <button className="secondary-button" type="button" disabled={props.isExporting} onClick={props.onRetryFailed}>{t(props.language, "progress.retryFailed")}</button>}
              </>
            )}
          </div>
          {!props.isConverting && completed > 0 && (
            <div className="destination-actions">
              {props.exportResult ? (
                <button className="primary-button" type="button" disabled={props.isExporting} onClick={props.onRevealFolder}>{t(props.language, "progress.openFolder")}</button>
              ) : (
                <>
                  {canExport && <button className="primary-button" type="button" onClick={props.onExportDownloads}>{props.isExporting ? t(props.language, "progress.copying") : t(props.language, "progress.download")}</button>}
                  {canExport && <button className="secondary-button" type="button" onClick={props.onExportFolder}>{props.isExporting ? t(props.language, "progress.copying") : t(props.language, "progress.folder")}</button>}
                </>
              )}
            </div>
          )}
        </footer>
      </section>
    </section>
  );
}
