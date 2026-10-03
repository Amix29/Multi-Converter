import { memo } from "react";
import { t, type LanguageCode } from "../../i18n";
import { clamp, displayFileName } from "../conversion/model";
import { useVirtualWindow } from "../conversion/useVirtualWindow";
import { statusLabelKeys, type FileItem } from "../types";

const jobRowHeight = 92;

export const VirtualizedJobList = memo(function VirtualizedJobList(props: {
  files: FileItem[];
  language: LanguageCode;
  isActive: boolean;
  isFinished: boolean;
  isExporting: boolean;
  resetKey: string;
  onRetryFile(fileId: string): void;
}) {
  const { onScroll, viewportRef, windowState } = useVirtualWindow({
    itemCount: props.files.length,
    rowHeight: jobRowHeight,
    isActive: props.isActive,
    resetKey: props.resetKey,
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
      style={{ transform: `translateY(${props.offset}px)` }}
    >
      <div className="job-main">
        <strong title={props.file.name}>{displayFileName(props.file)}</strong>
        <span>→ {(props.file.convertedFormat || props.file.selectedFormat || "").toUpperCase()}</span>
      </div>
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
