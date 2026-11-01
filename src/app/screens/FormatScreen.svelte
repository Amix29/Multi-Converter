<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";

  import { untrack } from "svelte";
  import { styleString, type StyleMap } from "../../lib/styleString";
  import { t, translateCategory, type LanguageCode } from "../../i18n";
  import { stablePartitionBySupport } from "../conversion/largeListModel";
  import { createVirtualWindow } from "../conversion/virtualWindow.svelte.js";
  import {
    fileGroupId,
    groupedFormatOptions,
    hasAvailableTargets,
    readyCountText,
    targetForFormat,
    uniqueIntents,
  } from "../conversion/model";
  import type { FileItem } from "../types";
  import type { MediaMode, QualityProfile } from "../../lib/api";
  import QualityProfileSelector from "./QualityProfileSelector.svelte";
  import { supportsQualityProfile } from "./qualitySupport";
  import MediaModeSelector from "./MediaModeSelector.svelte";
  import { supportsStreamCopy } from "../conversion/mediaOptions";
  import FormatRailButton from "./FormatRailButton.svelte";
  import FormatCard from "./FormatCard.svelte";

  let props: {
    isActive: boolean;
    language: LanguageCode;
    files: FileItem[];
    isConverting: boolean;
    qualityProfile: QualityProfile;
    onQualityProfile(value: QualityProfile): void;
    onMediaMode(fileId: string, value: MediaMode): void;
    onBack(): void;
    onChooseFileFormat(fileId: string, format: string): void;
    onApplyCompatibleFormat(fileId: string, format: string): void;
    onStart(): void;
  } = $props();
  let activeFileId = $state.raw<string | null>(null);
  const setActiveFileId: StateSetter<typeof activeFileId> = (value) => {
    activeFileId = resolveStateUpdate(value, activeFileId);
  };
  let query = $state.raw("");
  const setQuery: StateSetter<typeof query> = (value) => {
    query = resolveStateUpdate(value, query);
  };
  let categoryByFileId = $state.raw<Record<string, string>>({});
  const setCategoryByFileId: StateSetter<typeof categoryByFileId> = (value) => {
    categoryByFileId = resolveStateUpdate(value, categoryByFileId);
  };
  const orderedFiles = $derived.by(() => stablePartitionBySupport(props.files));
  const configurable = $derived.by(() =>
    orderedFiles.filter(hasAvailableTargets),
  );
  const readyCount = $derived.by(() =>
    configurable.reduce(
      (count, file) => count + Number(Boolean(file.selectedFormat)),
      0,
    ),
  );
  let canStart = $derived(
    configurable.length > 0 &&
      readyCount === configurable.length &&
      !props.isConverting,
  );
  const activeFile = $derived.by(
    () =>
      configurable.find((file) => file.id === activeFileId) ??
      configurable.find((file) => !file.selectedFormat) ??
      configurable[0] ??
      null,
  );
  const optionGroups = $derived.by(() =>
    activeFile
      ? groupedFormatOptions(activeFile)
      : { recommended: [], other: [] },
  );
  const allIntents = $derived.by(() =>
    uniqueIntents([...optionGroups.recommended, ...optionGroups.other]),
  );
  const availableCategories = $derived.by(() =>
    Array.from(
      new Map(
        allIntents.map((intent) => [
          intent.target.categoryId,
          translateCategory(
            props.language,
            intent.target.categoryId || intent.target.category,
          ),
        ]),
      ).entries(),
    ),
  );
  let requestedCategory = $derived(
    activeFile ? (categoryByFileId[activeFile.id] ?? "all") : "all",
  );
  let category = $derived(
    requestedCategory === "all" ||
      availableCategories.some(([id]) => id === requestedCategory)
      ? requestedCategory
      : "all",
  );
  let normalizedQuery = $derived(query.trim().toLowerCase());
  const filteredIntents = $derived.by(() =>
    allIntents.filter((intent) => {
      const matchesCategory =
        category === "all" || intent.target.categoryId === category;
      const extension = intent.target.extension || intent.target.format;
      return (
        matchesCategory &&
        (!normalizedQuery ||
          intent.target.format.toLowerCase().includes(normalizedQuery) ||
          intent.target.label.toLowerCase().includes(normalizedQuery) ||
          extension.toLowerCase().includes(normalizedQuery))
      );
    }),
  );
  let selectedIntent = $derived(
    activeFile?.selectedFormat
      ? (allIntents.find(
          (intent) => intent.target.format === activeFile.selectedFormat,
        ) ?? null)
      : null,
  );
  const compatibleForSelection = $derived.by(() =>
    activeFile && selectedIntent
      ? props.files.filter(
          (file) =>
            file.id !== activeFile.id &&
            targetForFormat(file, selectedIntent.target.format) &&
            file.selectedFormat !== selectedIntent.target.format,
        )
      : [],
  );
  const controller1 = createVirtualWindow<HTMLDivElement>({
    get itemCount() {
      return orderedFiles.length;
    },
    get rowHeight() {
      return 79;
    },
    get isActive() {
      return props.isActive;
    },
    get resetKey() {
      return orderedFiles[0]?.id ?? "empty";
    },
  });
  let onScroll = $derived(controller1.onScroll);
  let viewportRef = $derived(controller1.viewportRef);
  let windowState = $derived(controller1.windowState);
  let visibleOrderedFiles = $derived(
    orderedFiles.slice(windowState.startIndex, windowState.endIndex),
  );
  $effect(() => {
    void [activeFileId, configurable];
    return untrack(() => {
      if (!activeFileId && configurable[0]) setActiveFileId(configurable[0].id);
      if (
        activeFileId &&
        !configurable.some((file) => file.id === activeFileId)
      ) {
        setActiveFileId(configurable[0]?.id ?? null);
      }
    });
  });
  const activateFile = (fileId: string) => setActiveFileId(fileId);
</script>

<section
  class={`screen format-screen ${props.isActive ? "is-active" : ""}`}
  aria-labelledby="format-title"
>
  <section class="format-board format-choice-board">
    <div class="screen-copy compact">
      <h2 id="format-title">{t(props.language, "format.title")}</h2>
    </div>
    <section class="format-workspace">
      <aside class="file-rail" aria-label={t(props.language, "format.files")}>
        <div class="format-rail-header">
          <span class="label"
            >{readyCountText(
              props.language,
              readyCount,
              configurable.length,
            )}</span
          >
        </div>
        <div
          bind:this={viewportRef.current}
          class="rail-scroll"
          data-testid="virtual-format-rail"
          data-total-count={orderedFiles.length}
          style={styleString({
            "--format-rail-height": `${windowState.totalHeight}px`,
          } as StyleMap)}
          onscroll={onScroll}
        >
          <div
            class="virtual-format-rail-content"
            style={styleString({ height: `${windowState.totalHeight}px` })}
          >
            {#each visibleOrderedFiles as file, visibleIndex (file.id)}<div
                class="virtual-format-rail-row"
                style={styleString({
                  transform: `translateY(${windowState.offsetTop + visibleIndex * 79}px)`,
                })}
              >
                <FormatRailButton
                  {file}
                  language={props.language}
                  isActive={activeFile?.id === file.id}
                  onActivate={activateFile}
                />
              </div>{/each}
          </div>
        </div>
      </aside>
      <section
        class="format-picker"
        aria-label={t(props.language, "format.available")}
      >
        {#if activeFile}
          <div class="format-tools">
            {#if supportsStreamCopy(activeFile)}<MediaModeSelector
                language={props.language}
                value={activeFile.mediaMode ?? "convert"}
                onChange={(value) => props.onMediaMode(activeFile.id, value)}
              />{/if}
            {#if activeFile.mediaMode !== "copy" && supportsQualityProfile(activeFile.selectedFormat, activeFile.sourceFormat)}<QualityProfileSelector
                language={props.language}
                value={props.qualityProfile}
                onChange={props.onQualityProfile}
              />{/if}
            {#if selectedIntent}<p class="selected-format-detail">
                {selectedIntent.target.engineLabel} · {selectedIntent.target
                  .detail}
              </p>{/if}
            <label class="search-box">
              <span>{t(props.language, "format.filter")}</span>
              <input
                value={query}
                placeholder={t(props.language, "format.searchPlaceholder")}
                oninput={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
            {#if availableCategories.length > 1}<div
                class="category-filter"
                aria-label={t(props.language, "format.categories")}
              >
                <button
                  class={category === "all" ? "is-active" : ""}
                  type="button"
                  onclick={() =>
                    setCategoryByFileId((current) => ({
                      ...current,
                      [activeFile.id]: "all",
                    }))}>{t(props.language, "format.all")}</button
                >
                {#each availableCategories as [id, label] (id)}<button
                    class={category === id ? "is-active" : ""}
                    type="button"
                    onclick={() =>
                      setCategoryByFileId((current) => ({
                        ...current,
                        [activeFile.id]: id,
                      }))}>{label}</button
                  >{/each}
              </div>{/if}
          </div>
          {#if selectedIntent && compatibleForSelection.length > 0}<button
              class="apply-compatible-button"
              type="button"
              onclick={() =>
                props.onApplyCompatibleFormat(
                  activeFile.id,
                  selectedIntent.target.format,
                )}
            >
              {fileGroupId(activeFile) === "video"
                ? t(props.language, "format.applyVideoCompatible")
                : t(props.language, "format.batchApply")}
            </button>{/if}
          <div class="format-results">
            {#if filteredIntents.length > 0}<div class="format-card-grid">
                {#each filteredIntents as intent (intent.target.format)}<FormatCard
                    {intent}
                    file={activeFile}
                    onChoose={props.onChooseFileFormat}
                  />{/each}
              </div>{/if}
            {#if !filteredIntents.length}<div class="empty-state">
                {allIntents.length
                  ? t(props.language, "format.noResult")
                  : t(props.language, "format.noFormat")}
              </div>{/if}
          </div>
        {:else}<div class="empty-state">
            {props.files.length
              ? t(props.language, "format.noRecommendation")
              : t(props.language, "format.addFilesFirst")}
          </div>{/if}
      </section>
    </section>
    <footer class="screen-actions">
      <Button
        variant="unstyled"
        size="inherit"
        class="ghost-button"
        type="button"
        onclick={props.onBack}>{t(props.language, "format.back")}</Button
      >
      {#if canStart}<Button
          variant="unstyled"
          size="inherit"
          class="primary-button"
          type="button"
          onclick={props.onStart}>{t(props.language, "format.start")}</Button
        >{/if}
    </footer>
  </section>
</section>
