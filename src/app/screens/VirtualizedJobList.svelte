<script lang="ts">
  import { styleString } from "../../lib/styleString";
  import { t, type LanguageCode } from "../../i18n";

  import { createVirtualWindow } from "../conversion/virtualWindow.svelte.js";

  import { type FileItem } from "../types";
  import JobRow from "./JobRow.svelte";

  let props: {
    files: FileItem[];
    language: LanguageCode;
    isActive: boolean;
    isFinished: boolean;
    isExporting: boolean;
    resetKey: string;
    onRetryFile(fileId: string): void;
  } = $props();
  let jobRowHeight = $derived(
    props.files.some((file) => file.error || file.result?.warnings?.length)
      ? 176
      : 120,
  );
  const controller1 = createVirtualWindow({
    get itemCount() {
      return props.files.length;
    },
    get rowHeight() {
      return jobRowHeight;
    },
    get isActive() {
      return props.isActive;
    },
    get resetKey() {
      return `${props.resetKey}:${jobRowHeight}`;
    },
  });
  let onScroll = $derived(controller1.onScroll);
  let viewportRef = $derived(controller1.viewportRef);
  let windowState = $derived(controller1.windowState);
  let visibleFiles = $derived(
    props.files.slice(windowState.startIndex, windowState.endIndex),
  );
</script>

<section
  bind:this={viewportRef.current}
  class="job-list"
  aria-label={t(props.language, "app.progress")}
  data-testid="virtual-job-list"
  data-total-count={props.files.length}
  onscroll={onScroll}
>
  {#if !props.files.length}<div class="empty-state">
      {t(props.language, "progress.empty")}
    </div>{/if}
  {#if props.files.length > 0}<div
      class="virtual-job-list-content"
      style={styleString({ height: `${windowState.totalHeight}px` })}
    >
      {#each visibleFiles as file, visibleIndex (file.id)}<JobRow
          {file}
          language={props.language}
          isFinished={props.isFinished}
          isExporting={props.isExporting}
          position={windowState.startIndex + visibleIndex}
          total={props.files.length}
          offset={windowState.offsetTop + visibleIndex * jobRowHeight}
          rowHeight={jobRowHeight}
          onRetryFile={props.onRetryFile}
        />{/each}
    </div>{/if}
</section>
