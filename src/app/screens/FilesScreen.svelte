<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  import { type Snippet } from "svelte";
  import { styleString } from "../../lib/styleString";
  import brandLogoUrl from "../../assets/multi-converter-icon-brand-orange.svg";
  import { t, type LanguageCode } from "../../i18n";
  import {
    fileSummary,
    hasAvailableTargets,
    uploadedFilesSummary,
  } from "../conversion/model";
  import { createVirtualGridWindow } from "../conversion/virtualGridWindow.svelte.js";
  import type { FileItem } from "../types";
  import FileTicket from "./FileTicket.svelte";

  let props: {
    isActive: boolean;
    language: LanguageCode;
    files: FileItem[];
    isConverting: boolean;
    isDragOver: boolean;
    recoveryContent?: Snippet;
    onAddFiles(): void;
    onClear(): void;
    onDragOver(active: boolean): void;
    onDrop(event: DragEvent & { currentTarget: HTMLElement }): void;
    onFormats(): void;
    onExtractText(file: FileItem): void;
    onRemove(fileId: string): void;
  } = $props();
  let hasFiles = $derived(props.files.length > 0);
  let hasConvertibleFiles = $derived(props.files.some(hasAvailableTargets));
  const controller1 = createVirtualGridWindow({
    get itemCount() {
      return props.files.length;
    },
    get rowHeight() {
      return 144;
    },
    get minimumColumnWidth() {
      return 270;
    },
    get gap() {
      return 12;
    },
    get overscan() {
      return 1;
    },
    get isActive() {
      return props.isActive;
    },
    get resetKey() {
      return props.files[0]?.id ?? "empty";
    },
  });
  let onScroll = $derived(controller1.onScroll);
  let viewportRef = $derived(controller1.viewportRef);
  let windowState = $derived(controller1.windowState);
  let visibleFiles = $derived(
    props.files.slice(windowState.startItemIndex, windowState.endItemIndex),
  );
</script>

<section
  class={`screen upload-screen ${props.isActive ? "is-active" : ""}`}
  aria-labelledby="upload-title"
>
  <h2 id="upload-title" class="visually-hidden">
    {t(props.language, "step.files")}
  </h2>
  <div class="upload-grid">
    <section
      class={`drop-zone ${props.isDragOver ? "is-over" : ""}`}
      aria-label={t(props.language, "upload.dropZone")}
      ondragenter={(event) => {
        event.preventDefault();
        props.onDragOver(true);
      }}
      ondragleave={(event) => {
        event.preventDefault();
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          props.onDragOver(false);
      }}
      ondragover={(event) => event.preventDefault()}
      ondrop={props.onDrop}
    >
      <div class="sketch-orbit" aria-hidden="true">
        <img src={brandLogoUrl} alt="" />
      </div>
      <div>
        <strong
          >{props.isDragOver
            ? t(props.language, "upload.dropFiles")
            : t(props.language, "upload.dragDrop")}</strong
        >
      </div>
      <Button
        variant="unstyled"
        size="inherit"
        class="primary-button"
        type="button"
        onclick={props.onAddFiles}>{t(props.language, "upload.browse")}</Button
      >
    </section>
  </div>
  {#if hasFiles}<p class="file-summary" aria-live="polite">
      {uploadedFilesSummary(
        props.language,
        props.files.length,
        fileSummary(props.files, props.language),
      )}
    </p>{/if}
  <section
    bind:this={viewportRef.current}
    class="file-lane"
    aria-label={t(props.language, "upload.selectedFiles")}
    data-testid="virtual-file-grid"
    data-total-count={props.files.length}
    onscroll={onScroll}
  >
    {#if !hasFiles}{#if props.recoveryContent}{@render props.recoveryContent()}{:else}<div
          class="empty-state"
        >
          {t(props.language, "upload.empty")}
        </div>{/if}{/if}
    {#if hasFiles}<div
        class="virtual-file-grid-content"
        style={styleString({ height: `${windowState.totalHeight}px` })}
      >
        <div
          class="virtual-file-grid-window"
          style={styleString({
            gridTemplateColumns: `repeat(${windowState.columnCount}, minmax(0, 1fr))`,
            transform: `translateY(${windowState.offsetTop}px)`,
          })}
        >
          {#each visibleFiles as file (file.id)}<FileTicket
              {file}
              language={props.language}
              onExtractText={props.onExtractText}
              onRemove={props.onRemove}
            />{/each}
        </div>
      </div>{/if}
  </section>
  {#if hasFiles}<footer class="screen-actions">
      <div class="file-action-group">
        <Button
          variant="unstyled"
          size="inherit"
          class="ghost-button"
          type="button"
          disabled={props.isConverting}
          onclick={props.onClear}>{t(props.language, "upload.clear")}</Button
        >
      </div>
      {#if hasConvertibleFiles}<Button
          variant="unstyled"
          size="inherit"
          class="primary-button"
          type="button"
          disabled={props.isConverting}
          onclick={props.onFormats}
          >{t(props.language, "upload.goFormat")}</Button
        >{/if}
    </footer>{/if}
</section>
