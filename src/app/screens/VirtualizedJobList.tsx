import { memo } from "react";
import { t, translateBackendMessage, type LanguageCode } from "../../i18n";
import { clamp, displayFileName, formatBytes } from "../conversion/model";
import { useVirtualWindow } from "../conversion/useVirtualWindow";
import { resultWarningText } from "../conversion/resultWarnings";
import { statusLabelKeys, type FileItem } from "../types";

export const VirtualizedJobList = memo(function VirtualizedJobList(props: {
  files: FileItem[];
  language: LanguageCode;
  isActive: boolean;
  isFinished: boolean;
  isExporting: boolean;
  resetKey: string;
  onRetryFile(fileId: string): void;
}) {
  const jobRowHeight = props.files.some((file) => file.error || file.result?.warnings?.length) ? 176 : 120;
  const { onScroll, viewportRef, windowState } = useVirtualWindow({
    itemCount: props.files.length,
    rowHeight: jobRowHeight,
    isActive: props.isActive,
    resetKey: `${props.resetKey}:${jobRowHeight}`,
  });
  const visibleFiles = props.files.slice(windowState.startIndex, windowState.endIndex);

  return (
    <section
      ref={viewportRef}
      className="job-list"
      aria-label={t(props.language, "app.progress")}
      data-testid="virtual-job-list"
      data-total-count={props.files.length}
      onScroll={onScroll}
    >
      {!props.files.length && <div className="empty-state">{t(props.language, "progress.empty")}</div>}
      {props.files.length > 0 && (
        <div className="virtual-job-list-content" style={{ height: `${windowState.totalHeight}px` }}>
          {visibleFiles.map((file, visibleIndex) => (
            <JobRow
              key={file.id}
              file={file}
              language={props.language}
              isFinished={props.isFinished}
              isExporting={props.isExporting}
              position={windowState.startIndex + visibleIndex}
              total={props.files.length}
              offset={windowState.offsetTop + visibleIndex * jobRowHeight}
              rowHeight={jobRowHeight}
              onRetryFile={props.onRetryFile}
            />
          ))}
        </div>
      )}
    </section>
  );
});

const JobRow = memo(function JobRow(props: {
  file: FileItem;
  language: LanguageCode;
  isFinished: boolean;
  isExporting: boolean;
  position: number;
  total: number;
  offset: number;
  rowHeight: number;
  onRetryFile(fileId: string): void;
}) {
  const fileProgress = props.file.status === "done"
    ? 100
    : clamp(props.file.progress, 0, 100);
  const percentage = props.file.status === "done" ? 100 : Math.floor(fileProgress);

  return (
    <article
      className="job-row"
      aria-posinset={props.position + 1}
      aria-setsize={props.total}
      style={{ transform: `translateY(${props.offset}px)`, height: props.rowHeight - 8 }}
    >
      <div className="job-main">
        <strong title={props.file.name}>{displayFileName(props.file)}</strong>
        <span>→ {(props.file.convertedFormat || props.file.selectedFormat || "").toUpperCase()}</span>
      </div>
      {props.file.result && (
        <p className="job-summary">
          {props.file.result.engine}
          {props.file.result.inputBytes !== undefined && props.file.result.outputBytes !== undefined
            ? ` · ${formatBytes(props.file.result.inputBytes, props.language)} → ${formatBytes(props.file.result.outputBytes, props.language)}` : ""}
          {props.file.result.durationMs !== undefined
            ? ` · ${(props.file.result.durationMs / 1000).toLocaleString(props.language, { maximumFractionDigits: 1 })} s` : ""}
        </p>
      )}
      <div className="job-state-actions">
        <em className={`job-state ${props.file.status === "done" ? "is-done" : ""} ${props.file.status === "error" ? "is-error" : ""}`}>
          {t(props.language, statusLabelKeys[props.file.status])}
        </em>
        {props.file.status === "error" && props.isFinished && (
          <button
            className="secondary-button retry-button"
            type="button"
            disabled={props.isExporting}
            onClick={() => props.onRetryFile(props.file.id)}
          >
            {t(props.language, "progress.retry")}
          </button>
        )}
      </div>
      {props.file.error && (
        <p className="job-error" tabIndex={0} title={translateBackendMessage(props.language, props.file.error)}>
          {translateBackendMessage(props.language, props.file.error)}
        </p>
      )}
      {Boolean(props.file.result?.warnings?.length) && (
        <p className="job-warning" tabIndex={0}>
          {props.file.result?.warnings?.map((warning) => resultWarningText(props.language, warning)).join(" · ")}
        </p>
      )}
      <div className="file-progress-line">
        <div
          className="progress-track"
          role="progressbar"
          aria-label={`${displayFileName(props.file)} ${t(props.language, "progress.fileProgress")}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <div className={`progress-bar ${props.file.status === "error" ? "is-error" : ""}`} style={{ width: `${fileProgress}%` }} />
        </div>
        <span>{percentage}%</span>
      </div>
    </article>
  );
});
