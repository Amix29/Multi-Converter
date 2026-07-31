import { useEffect, useState } from "react";
import { t, translateCategory, type LanguageCode } from "../../i18n";
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

export function FormatScreen(props: {
  isActive: boolean;
  language: LanguageCode;
  files: FileItem[];
  isConverting: boolean;
  onBack(): void;
  onChooseFileFormat(fileId: string, format: string): void;
  onStart(): void;
}) {
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryByFileId, setCategoryByFileId] = useState<Record<string, string>>({});
  const configurable = props.files.filter(hasAvailableTargets);
  const readyCount = configurable.filter((file) => file.selectedFormat).length;
  const canStart = configurable.length > 0 && readyCount === configurable.length && !props.isConverting;
  const activeFile = configurable.find((file) => file.id === activeFileId) ?? configurable.find((file) => !file.selectedFormat) ?? configurable[0] ?? null;
  const optionGroups = activeFile ? groupedFormatOptions(activeFile) : { recommended: [], other: [] };
  const allIntents = uniqueIntents([...optionGroups.recommended, ...optionGroups.other]);
  const availableCategories = Array.from(new Map(allIntents.map((intent) => [intent.target.categoryId, translateCategory(props.language, intent.target.categoryId || intent.target.category)])).entries());
  const requestedCategory = activeFile ? categoryByFileId[activeFile.id] ?? "all" : "all";
  const category = requestedCategory === "all" || availableCategories.some(([id]) => id === requestedCategory) ? requestedCategory : "all";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredIntents = allIntents.filter((intent) => {
    const matchesCategory = category === "all" || intent.target.categoryId === category;
    const extension = intent.target.extension || intent.target.format;
    return matchesCategory && (
      !normalizedQuery ||
      intent.target.format.toLowerCase().includes(normalizedQuery) ||
      intent.target.label.toLowerCase().includes(normalizedQuery) ||
      extension.toLowerCase().includes(normalizedQuery)
    );
  });
  const selectedIntent = activeFile?.selectedFormat ? allIntents.find((intent) => intent.target.format === activeFile.selectedFormat) ?? null : null;
  const compatibleForSelection = activeFile && selectedIntent
    ? props.files.filter((file) => file.id !== activeFile.id && targetForFormat(file, selectedIntent.target.format) && file.selectedFormat !== selectedIntent.target.format)
    : [];

  useEffect(() => {
    if (!activeFileId && configurable[0]) setActiveFileId(configurable[0].id);
    if (activeFileId && !configurable.some((file) => file.id === activeFileId)) setActiveFileId(configurable[0]?.id ?? null);
  }, [activeFileId, configurable]);

  function applyCompatible(format: string) {
    props.files.forEach((file) => {
      if (file.id !== activeFile?.id && targetForFormat(file, format) && file.selectedFormat !== format) props.onChooseFileFormat(file.id, format);
    });
  }

  function renderFormatCard(intent: ConversionIntent, file: FileItem) {
    const isSelected = file.selectedFormat === intent.target.format;
    return (
      <button
        className={`format-card ${isSelected ? "is-selected" : ""}`}
        key={intent.target.format}
        type="button"
        aria-pressed={isSelected}
        onClick={() => props.onChooseFileFormat(file.id, intent.target.format)}
      >
        <strong>{intent.target.label}</strong>
        <span className="format-extension">{intent.target.extension || intent.target.format}</span>
      </button>
    );
  }

  return (
    <section className={`screen format-screen ${props.isActive ? "is-active" : ""}`} aria-labelledby="format-title">
      <section className="format-board format-choice-board">
        <div className="screen-copy compact"><h2 id="format-title">{t(props.language, "format.title")}</h2></div>
        <section className="format-workspace">
          <aside className="file-rail" aria-label={t(props.language, "format.files")}>
            <div className="format-rail-header"><span className="label">{readyCountText(props.language, readyCount, configurable.length)}</span></div>
            <div className="rail-scroll">
              {props.files.map((file) => {
                const isActive = activeFile?.id === file.id;
                const selectedTarget = file.selectedFormat ? targetForFormat(file, file.selectedFormat) : null;
                const selectedFormatLabel = file.selectedFormat ? (selectedTarget?.extension || selectedTarget?.label || file.selectedFormat).toUpperCase() : null;
                return (
                  <button
                    className={`rail-button ${isActive ? "is-active" : ""} ${file.selectedFormat ? "is-done" : ""}`}
                    key={file.id}
                    type="button"
                    disabled={!hasAvailableTargets(file)}
                    onClick={() => setActiveFileId(file.id)}
                  >
                    <strong>{displayFileName(file)}</strong>
                    <span className="rail-meta">{hasAvailableTargets(file) ? compactFileMeta(file, props.language) : t(props.language, "format.unsupported")}</span>
                    {hasAvailableTargets(file) && <span className={`rail-format ${selectedFormatLabel ? "is-selected" : ""}`}>{selectedFormatLabel ?? t(props.language, "format.choose")}</span>}
                  </button>
                );
              })}
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
                  <button className="apply-compatible-button" type="button" onClick={() => applyCompatible(selectedIntent.target.format)}>
                    {fileGroupId(activeFile) === "video" ? t(props.language, "format.applyVideoCompatible") : t(props.language, "format.batchApply")}
                  </button>
                )}

                <div className="format-results">
                  {filteredIntents.length > 0 && <div className="format-card-grid">{filteredIntents.map((intent) => renderFormatCard(intent, activeFile))}</div>}
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
}
