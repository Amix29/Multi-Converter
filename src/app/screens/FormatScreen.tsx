import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { t, translateCategory, type LanguageCode } from "../../i18n";
import { stablePartitionBySupport } from "../conversion/largeListModel";
import { useVirtualWindow } from "../conversion/useVirtualWindow";
import {
  compactFileMeta,
  displayFileName,
  fileGroupId,
  groupedFormatOptions,
  hasAvailableTargets,
  readyCountText,
  targetForFormat,
  uniqueIntents,
} from "../conversion/model";
import type { ConversionIntent, FileItem } from "../types";

export const FormatScreen = memo(function FormatScreen(props: {
  isActive: boolean;
  language: LanguageCode;
  files: FileItem[];
  isConverting: boolean;
  onBack(): void;
  onChooseFileFormat(fileId: string, format: string): void;
  onApplyCompatibleFormat(fileId: string, format: string): void;
  onStart(): void;
}) {
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryByFileId, setCategoryByFileId] = useState<Record<string, string>>({});
  const orderedFiles = useMemo(() => stablePartitionBySupport(props.files), [props.files]);
  const configurable = useMemo(() => orderedFiles.filter(hasAvailableTargets), [orderedFiles]);
  const readyCount = useMemo(
    () => configurable.reduce((count, file) => count + Number(Boolean(file.selectedFormat)), 0),
    [configurable],
  );
  const canStart = configurable.length > 0 && readyCount === configurable.length && !props.isConverting;
  const activeFile = useMemo(() => configurable.find((file) => file.id === activeFileId)
      ?? configurable.find((file) => !file.selectedFormat)
      ?? configurable[0]
      ?? null,
  [activeFileId, configurable]);
  const optionGroups = useMemo(
    () => activeFile ? groupedFormatOptions(activeFile) : { recommended: [], other: [] },
    [activeFile],
  );
  const allIntents = useMemo(
    () => uniqueIntents([...optionGroups.recommended, ...optionGroups.other]),
    [optionGroups],
  );
  const availableCategories = useMemo(
    () => Array.from(new Map(allIntents.map((intent) => [
      intent.target.categoryId,
      translateCategory(props.language, intent.target.categoryId || intent.target.category),
    ])).entries()),
    [allIntents, props.language],
  );
  const requestedCategory = activeFile ? categoryByFileId[activeFile.id] ?? "all" : "all";
  const category = requestedCategory === "all" || availableCategories.some(([id]) => id === requestedCategory)
    ? requestedCategory
    : "all";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredIntents = useMemo(() => allIntents.filter((intent) => {
    const matchesCategory = category === "all" || intent.target.categoryId === category;
    const extension = intent.target.extension || intent.target.format;
    return matchesCategory && (
      !normalizedQuery
      || intent.target.format.toLowerCase().includes(normalizedQuery)
      || intent.target.label.toLowerCase().includes(normalizedQuery)
      || extension.toLowerCase().includes(normalizedQuery)
    );
  }), [allIntents, category, normalizedQuery]);
  const selectedIntent = activeFile?.selectedFormat
    ? allIntents.find((intent) => intent.target.format === activeFile.selectedFormat) ?? null
    : null;
  const compatibleForSelection = useMemo(() => activeFile && selectedIntent
      ? props.files.filter((file) => file.id !== activeFile.id
        && targetForFormat(file, selectedIntent.target.format)
        && file.selectedFormat !== selectedIntent.target.format)
      : [],
  [activeFile, props.files, selectedIntent]);
  const { onScroll, viewportRef, windowState } = useVirtualWindow<HTMLDivElement>({
    itemCount: orderedFiles.length,
    rowHeight: 79,
    isActive: props.isActive,
    resetKey: orderedFiles[0]?.id ?? "empty",
  });
  const visibleOrderedFiles = orderedFiles.slice(windowState.startIndex, windowState.endIndex);

  useEffect(() => {
    if (!activeFileId && configurable[0]) setActiveFileId(configurable[0].id);
    if (activeFileId && !configurable.some((file) => file.id === activeFileId)) {
      setActiveFileId(configurable[0]?.id ?? null);
    }
  }, [activeFileId, configurable]);

  const activateFile = useCallback((fileId: string) => setActiveFileId(fileId), []);

  return (
    <section className={`screen format-screen ${props.isActive ? "is-active" : ""}`} aria-labelledby="format-title">
      <section className="format-board format-choice-board">
        <div className="screen-copy compact"><h2 id="format-title">{t(props.language, "format.title")}</h2></div>
        <section className="format-workspace">
          <aside className="file-rail" aria-label={t(props.language, "format.files")}>
            <div className="format-rail-header">
              <span className="label">{readyCountText(props.language, readyCount, configurable.length)}</span>
            </div>
            <div
              ref={viewportRef}
              className="rail-scroll"
              data-testid="virtual-format-rail"
              data-total-count={orderedFiles.length}
              onScroll={onScroll}
            >
              <div className="virtual-format-rail-content" style={{ height: `${windowState.totalHeight}px` }}>
                {visibleOrderedFiles.map((file, visibleIndex) => (
                  <div
                    className="virtual-format-rail-row"
                    key={file.id}
                    style={{ transform: `translateY(${windowState.offsetTop + visibleIndex * 79}px)` }}
                  >
                    <FormatRailButton
                      file={file}
                      language={props.language}
                      isActive={activeFile?.id === file.id}
                      onActivate={activateFile}
                    />
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="format-picker" aria-label={t(props.language, "format.available")}>
            {activeFile ? (
              <>
                <div className="format-tools">
                  <label className="search-box">
                    <span>{t(props.language, "format.filter")}</span>
                    <input value={query} placeholder={t(props.language, "format.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
                  </label>
                  {availableCategories.length > 1 && (
                    <div className="category-filter" aria-label={t(props.language, "format.categories")}>
                      <button className={category === "all" ? "is-active" : ""} type="button" onClick={() => setCategoryByFileId((current) => ({ ...current, [activeFile.id]: "all" }))}>{t(props.language, "format.all")}</button>
                      {availableCategories.map(([id, label]) => (
                        <button className={category === id ? "is-active" : ""} key={id} type="button" onClick={() => setCategoryByFileId((current) => ({ ...current, [activeFile.id]: id }))}>{label}</button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedIntent && compatibleForSelection.length > 0 && (
                  <button className="apply-compatible-button" type="button" onClick={() => props.onApplyCompatibleFormat(activeFile.id, selectedIntent.target.format)}>
                    {fileGroupId(activeFile) === "video" ? t(props.language, "format.applyVideoCompatible") : t(props.language, "format.batchApply")}
                  </button>
                )}

                <div className="format-results">
                  {filteredIntents.length > 0 && (
                    <div className="format-card-grid">
                      {filteredIntents.map((intent) => (
                        <FormatCard
                          key={intent.target.format}
                          intent={intent}
                          file={activeFile}
                          onChoose={props.onChooseFileFormat}
                        />
                      ))}
                    </div>
                  )}
                  {!filteredIntents.length && <div className="empty-state">{allIntents.length ? t(props.language, "format.noResult") : t(props.language, "format.noFormat")}</div>}
                </div>
              </>
            ) : (
              <div className="empty-state">{props.files.length ? t(props.language, "format.noRecommendation") : t(props.language, "format.addFilesFirst")}</div>
            )}
          </section>
        </section>

        <footer className="screen-actions">
          <button className="ghost-button" type="button" onClick={props.onBack}>{t(props.language, "format.back")}</button>
          {canStart && <button className="primary-button" type="button" onClick={props.onStart}>{t(props.language, "format.start")}</button>}
        </footer>
      </section>
    </section>
  );
});

const FormatRailButton = memo(function FormatRailButton(props: {
  file: FileItem;
  language: LanguageCode;
  isActive: boolean;
  onActivate(fileId: string): void;
}) {
  const supported = hasAvailableTargets(props.file);
  const target = props.file.selectedFormat ? targetForFormat(props.file, props.file.selectedFormat) : null;
  const selectedLabel = props.file.selectedFormat
    ? (target?.extension || target?.label || props.file.selectedFormat).toUpperCase()
    : null;

  return (
    <button
      className={`rail-button ${props.isActive ? "is-active" : ""} ${props.file.selectedFormat ? "is-done" : ""}`}
      type="button"
      disabled={!supported}
      onClick={() => props.onActivate(props.file.id)}
    >
      <strong>{displayFileName(props.file)}</strong>
      <span className="rail-meta">{supported ? compactFileMeta(props.file, props.language) : t(props.language, "format.unsupported")}</span>
      {supported && <span className={`rail-format ${selectedLabel ? "is-selected" : ""}`}>{selectedLabel ?? t(props.language, "format.choose")}</span>}
    </button>
  );
});

const FormatCard = memo(function FormatCard(props: {
  intent: ConversionIntent;
  file: FileItem;
  onChoose(fileId: string, format: string): void;
}) {
  const selected = props.file.selectedFormat === props.intent.target.format;
  return (
    <button
      className={`format-card ${selected ? "is-selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={() => props.onChoose(props.file.id, props.intent.target.format)}
    >
      <strong>{props.intent.target.label}</strong>
      <span className="format-extension">{props.intent.target.extension || props.intent.target.format}</span>
    </button>
  );
});
