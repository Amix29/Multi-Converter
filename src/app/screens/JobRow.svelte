<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";

  import { styleString } from "../../lib/styleString";
  import { t, translateBackendMessage, type LanguageCode } from "../../i18n";
  import { clamp, displayFileName, formatBytes } from "../conversion/model";

  import { resultWarningText } from "../conversion/resultWarnings";
  import { statusLabelKeys, type FileItem } from "../types";

  let props: {
    file: FileItem;
    language: LanguageCode;
    isFinished: boolean;
    isExporting: boolean;
    position: number;
    total: number;
    offset: number;
    rowHeight: number;
    onRetryFile(fileId: string): void;
  } = $props();
  let fileProgress = $derived(
    props.file.status === "done" ? 100 : clamp(props.file.progress, 0, 100),
  );
  let percentage = $derived(
    props.file.status === "done" ? 100 : Math.floor(fileProgress),
  );
</script>

<article
  class="job-row"
  aria-posinset={props.position + 1}
  aria-setsize={props.total}
  style={styleString({
    transform: `translateY(${props.offset}px)`,
    height: props.rowHeight - 8,
  })}
>
  <div class="job-main">
    <strong title={props.file.name}>{displayFileName(props.file)}</strong>
    <span
      >→ {(
        props.file.convertedFormat ||
        props.file.selectedFormat ||
        ""
      ).toUpperCase()}</span
    >
  </div>
  {#if props.file.result}<p class="job-summary">
      {props.file.result.engine}
      {props.file.result.inputBytes !== undefined &&
      props.file.result.outputBytes !== undefined
        ? ` · ${formatBytes(props.file.result.inputBytes, props.language)} → ${formatBytes(props.file.result.outputBytes, props.language)}`
        : ""}
      {props.file.result.durationMs !== undefined
        ? ` · ${(props.file.result.durationMs / 1000).toLocaleString(props.language, { maximumFractionDigits: 1 })} s`
        : ""}
    </p>{/if}
  <div class="job-state-actions">
    <em
      class={`job-state ${props.file.status === "done" ? "is-done" : ""} ${props.file.status === "error" ? "is-error" : ""}`}
    >
      {t(props.language, statusLabelKeys[props.file.status])}
    </em>
    {#if props.file.status === "error" && props.isFinished}<Button
        variant="unstyled"
        size="inherit"
        class="secondary-button retry-button"
        type="button"
        disabled={props.isExporting}
        onclick={() => props.onRetryFile(props.file.id)}
      >
        {t(props.language, "progress.retry")}
      </Button>{/if}
  </div>
  {#if props.file.error}<div
      role="textbox"
      aria-readonly="true"
      aria-multiline="true"
      aria-label={props.file.name}
      class="job-error"
      tabindex={0}
      title={translateBackendMessage(props.language, props.file.error)}
    >
      {translateBackendMessage(props.language, props.file.error)}
    </div>{/if}
  {#if Boolean(props.file.result?.warnings?.length)}<div
      role="textbox"
      aria-readonly="true"
      aria-multiline="true"
      aria-label={props.file.name}
      class="job-warning"
      tabindex={0}
    >
      {props.file.result?.warnings
        ?.map((warning) => resultWarningText(props.language, warning))
        .join(" · ")}
    </div>{/if}
  <div class="file-progress-line">
    <div
      class="progress-track"
      role="progressbar"
      aria-label={`${displayFileName(props.file)} ${t(props.language, "progress.fileProgress")}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
    >
      <div
        class={`progress-bar ${props.file.status === "error" ? "is-error" : ""}`}
        style={styleString({ width: `${fileProgress}%` })}
      ></div>
    </div>
    <span>{percentage}%</span>
  </div>
</article>
