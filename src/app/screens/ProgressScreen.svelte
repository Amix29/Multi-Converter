<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";

  import { untrack } from "svelte";
  import { styleString } from "../../lib/styleString";
  import type { ExportResult } from "../../lib/api";
  import { t, type LanguageCode, type TranslationKey } from "../../i18n";
  import {
    filterOutputFiles,
    type OutputFilter,
  } from "../conversion/largeListModel";
  import {
    clamp,
    exportedFilesText,
    progressErrorSummary,
    progressSummaryText,
  } from "../conversion/model";
  import type { FileItem } from "../types";
  import VirtualizedJobList from "./VirtualizedJobList.svelte";

  const filterKeys: Array<{
    id: OutputFilter;
    key: TranslationKey;
  }> = [
    { id: "all", key: "progress.filterAll" },
    { id: "running", key: "progress.filterRunning" },
    { id: "done", key: "progress.filterDone" },
    { id: "errors", key: "progress.filterErrors" },
  ];
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
      if (file.status === "canceled" || file.status === "canceling")
        canceled += 1;
      if (["queued", "working", "canceling"].includes(file.status))
        running += 1;
      progressTotal +=
        file.status === "done" ? 100 : clamp(file.progress || 0, 0, 100);
    }
    const total = convertibles.length;
    return {
      canceled,
      completed,
      convertibles,
      failed,
      running,
      total,
      rawAverage: total ? Math.round(progressTotal / total) : 0,
    };
  }
  function progressCopy(
    props: {
      language: LanguageCode;
      exportResult: ExportResult | null;
      isCancelling: boolean;
      isConverting: boolean;
    },
    counts: {
      canceled: number;
      completed: number;
      failed: number;
      total: number;
    },
  ) {
    let title = t(props.language, "progress.pendingTitle");
    let subtitle = t(props.language, "progress.pendingSubtitle");
    if (counts.total && props.isConverting) {
      title = props.isCancelling
        ? t(props.language, "progress.cancelingTitle")
        : t(props.language, "progress.workingTitle");
      subtitle = "";
    } else if (
      counts.canceled &&
      counts.completed + counts.failed + counts.canceled === counts.total
    ) {
      title = t(props.language, "progress.canceledTitle");
      subtitle = "";
    } else if (counts.failed) {
      title = t(props.language, "progress.errorTitle");
      subtitle = progressErrorSummary(
        props.language,
        counts.completed,
        counts.failed,
      );
    } else if (props.exportResult) {
      title = t(props.language, "progress.savedTitle");
      subtitle = t(props.language, "progress.exportReady");
    } else if (counts.completed === counts.total && counts.total > 0) {
      title = t(props.language, "progress.doneTitle");
      subtitle = "";
    }
    return { subtitle, title };
  }
  let props: {
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
    onExportReport(): void;
    onRevealFolder(): void;
    onRetryFile(fileId: string): void;
    onRetryFailed(): void;
  } = $props();
  let filter = $state.raw<OutputFilter>("all");
  const setFilter: StateSetter<typeof filter> = (value) => {
    filter = resolveStateUpdate(value, filter);
  };
  const summary = $derived.by(() => summarizeFiles(props.files));
  let {
    canceled,
    completed,
    convertibles,
    failed,
    rawAverage,
    running,
    total,
  } = $derived(summary);
  let canExport = $derived(
    completed > 0 &&
      !props.isConverting &&
      !props.isExporting &&
      !props.isTempOutputCleaned,
  );
  let isFinished = $derived(
    total > 0 && !props.isConverting && completed + failed + canceled === total,
  );
  let canContinue = $derived(
    !props.isConverting &&
      convertibles.some(
        (file) => file.status !== "done" && file.status !== "unsupported",
      ),
  );
  let firstJobId = $derived(convertibles[0]?.jobId ?? "empty");
  let lastJobId = $derived(convertibles.at(-1)?.jobId ?? "empty");
  let progressSessionKey = $derived(`${total}:${firstJobId}:${lastJobId}`);
  let progressMark = $state({ key: "", value: 0 });
  let average = $derived(
    isFinished && failed + canceled === 0
      ? 100
      : Math.max(
          progressMark.key === progressSessionKey ? progressMark.value : 0,
          rawAverage,
        ),
  );
  $effect(() => {
    const key = progressSessionKey;
    const value = rawAverage;
    untrack(() => {
      if (progressMark.key !== key || value > progressMark.value)
        progressMark = { key, value };
    });
  });
  const filteredFiles = $derived.by(() =>
    filterOutputFiles(convertibles, filter),
  );
  let filterCounts: Record<OutputFilter, number> = $derived({
    all: total,
    running,
    done: completed,
    errors: failed,
  });
  let { title, subtitle } = $derived(
    progressCopy(props, { canceled, completed, failed, total }),
  );
</script>

<section
  class={`screen progress-screen ${props.isActive ? "is-active" : ""}`}
  aria-labelledby="progress-title"
>
  <section class="progress-panel">
    <section class="progress-hero">
      <div class="progress-percentage" aria-hidden="true">{average}%</div>
      <div class="screen-copy compact">
        <h2 id="progress-title">{title}</h2>
        {#if props.exportResult}<p>
            {exportedFilesText(props.language, props.exportResult.files.length)}
          </p>{:else}{#if subtitle}<p>{subtitle}</p>{/if}{/if}
        {#if total > 0}<p class="conversion-count">
            {progressSummaryText(
              props.language,
              completed,
              failed,
              canceled,
              total,
            )}
          </p>{/if}
      </div>
      <div
        class="global-progress-track"
        role="progressbar"
        aria-label={t(props.language, "progress.fileProgress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={average}
      >
        <div
          class="global-progress-bar"
          style={styleString({ width: `${average}%` })}
        ></div>
      </div>
    </section>
    <div
      class="output-filters"
      role="group"
      aria-label={t(props.language, "app.progress")}
    >
      {#each filterKeys as item (item.id)}<button
          type="button"
          aria-pressed={filter === item.id}
          onclick={() => setFilter(item.id)}
        >
          <span>{t(props.language, item.key)}</span>
          <strong>{filterCounts[item.id]}</strong>
        </button>{/each}
    </div>
    <VirtualizedJobList
      files={filteredFiles}
      language={props.language}
      isActive={props.isActive}
      {isFinished}
      isExporting={props.isExporting}
      resetKey={filter}
      onRetryFile={props.onRetryFile}
    />
    <footer class="screen-actions progress-actions">
      <div class="conversion-actions">
        {#if props.isConverting}<Button
            variant="unstyled"
            size="inherit"
            class="primary-button"
            type="button"
            disabled={props.isCancelling}
            onclick={props.onCancel}
          >
            {props.isCancelling
              ? t(props.language, "progress.canceling")
              : t(props.language, "progress.cancel")}
          </Button>{:else}
          {#if props.files.length > 0}<Button
              variant="unstyled"
              size="inherit"
              class="ghost-button"
              type="button"
              disabled={props.isExporting}
              onclick={props.onNew}
              >{t(props.language, "progress.newConversion")}</Button
            >{/if}
          {#if canContinue && canceled > 0}<Button
              variant="unstyled"
              size="inherit"
              class="primary-button"
              type="button"
              disabled={props.isExporting}
              onclick={props.onContinue}
              >{t(props.language, "progress.continue")}</Button
            >{/if}
          {#if !isFinished && props.files.length > 0}<Button
              variant="unstyled"
              size="inherit"
              class="secondary-button"
              type="button"
              disabled={props.isExporting}
              onclick={props.onBackToSettings}
              >{t(props.language, "progress.modify")}</Button
            >{/if}
          {#if failed > 0}<Button
              variant="unstyled"
              size="inherit"
              class="secondary-button"
              type="button"
              disabled={props.isExporting}
              onclick={props.onRetryFailed}
              >{t(props.language, "progress.retryFailed")}</Button
            >{/if}
        {/if}
      </div>
      {#if !props.isConverting && completed > 0}<div
          class="destination-actions"
        >
          {#if props.exportResult}<Button
              variant="unstyled"
              size="inherit"
              class="primary-button"
              type="button"
              disabled={props.isExporting}
              onclick={props.onRevealFolder}
              >{t(props.language, "progress.openFolder")}</Button
            >{:else}{/if}
          {#if canExport}
            <Button
              variant="unstyled"
              size="inherit"
              class={props.exportResult ? "secondary-button" : "primary-button"}
              type="button"
              onclick={props.onExportDownloads}
              >{t(props.language, "progress.download")}</Button
            >
            <Button
              variant="unstyled"
              size="inherit"
              class="secondary-button"
              type="button"
              onclick={props.onExportFolder}
              >{t(props.language, "progress.folder")}</Button
            >
          {/if}
        </div>{/if}
    </footer>
    {#if !props.isConverting && convertibles.some((file) => file.jobId) && !props.isTempOutputCleaned}<div
        class="batch-report-action"
      >
        <Button
          variant="unstyled"
          size="inherit"
          class="ghost-button"
          type="button"
          disabled={props.isExporting}
          onclick={props.onExportReport}
          aria-describedby="batch-report-privacy"
        >
          {t(props.language, "progress.report")}
        </Button>
        <p id="batch-report-privacy">
          {t(props.language, "progress.reportPrivacy")}
        </p>
      </div>{/if}
  </section>
</section>
