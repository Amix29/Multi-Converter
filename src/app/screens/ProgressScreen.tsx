import { memo, useMemo, useRef, useState } from "react";
import type { ExportResult } from "../../lib/api";
import { t, type LanguageCode, type TranslationKey } from "../../i18n";
import { filterOutputFiles, type OutputFilter } from "../conversion/largeListModel";
import {
  clamp,
  exportedFilesText,
  progressErrorSummary,
  progressSummaryText,
} from "../conversion/model";
import type { FileItem } from "../types";
import { VirtualizedJobList } from "./VirtualizedJobList";

const filterKeys: Array<{ id: OutputFilter; key: TranslationKey }> = [
  { id: "all", key: "progress.filterAll" },
  { id: "running", key: "progress.filterRunning" },
  { id: "done", key: "progress.filterDone" },
  { id: "errors", key: "progress.filterErrors" },
];

export const ProgressScreen = memo(function ProgressScreen(props: {
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
  const [filter, setFilter] = useState<OutputFilter>("all");
  const summary = useMemo(() => summarizeFiles(props.files), [props.files]);
  const { canceled, completed, convertibles, failed, rawAverage, running, total } = summary;
  const canExport = completed > 0 && !props.isConverting && !props.isExporting && !props.isTempOutputCleaned;
  const isFinished = total > 0 && !props.isConverting && completed + failed + canceled === total;
  const canContinue = !props.isConverting && convertibles.some((file) => file.status !== "done" && file.status !== "unsupported");
  const firstJobId = convertibles[0]?.jobId ?? "empty";
  const lastJobId = convertibles.at(-1)?.jobId ?? "empty";
  const progressSessionKey = `${total}:${firstJobId}:${lastJobId}`;
  const lastGlobalProgressRef = useRef({ key: progressSessionKey, value: 0 });
  if (lastGlobalProgressRef.current.key !== progressSessionKey) {
    lastGlobalProgressRef.current = { key: progressSessionKey, value: 0 };
  }
  const average = isFinished && failed + canceled === 0
    ? 100
    : Math.max(lastGlobalProgressRef.current.value, rawAverage);
  lastGlobalProgressRef.current.value = average;
  const filteredFiles = useMemo(() => filterOutputFiles(convertibles, filter), [convertibles, filter]);
  const filterCounts: Record<OutputFilter, number> = {
    all: total,
    running,
    done: completed,
    errors: failed,
  };
  const { title, subtitle } = progressCopy(props, { canceled, completed, failed, total });

  return (
    <section className={`screen progress-screen ${props.isActive ? "is-active" : ""}`} aria-labelledby="progress-title">
      <section className="progress-panel">
        <section className="progress-hero">
          <div className="progress-percentage" aria-hidden="true">{average}%</div>
          <div className="screen-copy compact">
            <h2 id="progress-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
            {props.exportResult && <p>{exportedFilesText(props.language, props.exportResult.files.length)}</p>}
            {total > 0 && <p className="conversion-count">{progressSummaryText(props.language, completed, failed, canceled, total)}</p>}
          </div>
          <div
            className="global-progress-track"
            role="progressbar"
            aria-label={t(props.language, "progress.fileProgress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={average}
          >
            <div className="global-progress-bar" style={{ width: `${average}%` }} />
          </div>
        </section>

        <div className="output-filters" role="group" aria-label={t(props.language, "app.progress")}>
          {filterKeys.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              <span>{t(props.language, item.key)}</span>
              <strong>{filterCounts[item.id]}</strong>
            </button>
          ))}
        </div>

        <VirtualizedJobList
          files={filteredFiles}
          language={props.language}
          isActive={props.isActive}
          isFinished={isFinished}
          isExporting={props.isExporting}
          resetKey={filter}
          onRetryFile={props.onRetryFile}
        />

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
});

function summarizeFiles(files: FileItem[]) {
  const convertibles: FileItem[] = [];
  let completed = 0;
  let failed = 0;
  let canceled = 0;
  let running = 0;
  let progressTotal = 0;

  for (const file of files) {
    if (!file.selectedFormat) continue;
    convertibles.push(file);
    if (file.status === "done") completed += 1;
    if (file.status === "error") failed += 1;
    if (file.status === "canceled" || file.status === "canceling") canceled += 1;
    if (["queued", "working", "canceling"].includes(file.status)) running += 1;
    progressTotal += file.status === "done" ? 100 : clamp(file.progress || 0, 0, 100);
  }

  const total = convertibles.length;
  return { canceled, completed, convertibles, failed, running, total, rawAverage: total ? Math.round(progressTotal / total) : 0 };
}

function progressCopy(
  props: { language: LanguageCode; exportResult: ExportResult | null; isCancelling: boolean; isConverting: boolean },
  counts: { canceled: number; completed: number; failed: number; total: number },
) {
  let title = t(props.language, "progress.pendingTitle");
  let subtitle = t(props.language, "progress.pendingSubtitle");
  if (counts.total && props.isConverting) {
    title = props.isCancelling ? t(props.language, "progress.cancelingTitle") : t(props.language, "progress.workingTitle");
    subtitle = "";
  } else if (counts.canceled && counts.completed + counts.failed + counts.canceled === counts.total) {
    title = t(props.language, "progress.canceledTitle");
    subtitle = "";
  } else if (counts.failed) {
    title = t(props.language, "progress.errorTitle");
    subtitle = progressErrorSummary(props.language, counts.completed, counts.failed);
  } else if (props.exportResult) {
    title = t(props.language, "progress.savedTitle");
    subtitle = t(props.language, "progress.exportReady");
  } else if (counts.completed === counts.total && counts.total > 0) {
    title = t(props.language, "progress.doneTitle");
    subtitle = "";
  }
  return { subtitle, title };
}
