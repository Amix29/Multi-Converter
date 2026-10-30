import { memo, useMemo, type DragEvent, type ReactNode } from "react";
import brandLogoUrl from "../../assets/multi-converter-icon-brand-orange.svg";
import { t, type LanguageCode } from "../../i18n";
import { fileSummary, hasAvailableTargets, uploadedFilesSummary } from "../conversion/model";
import { useVirtualGridWindow } from "../conversion/useVirtualGridWindow";
import type { FileItem } from "../types";
import { FileTicket } from "./FileTicket";

export const FilesScreen = memo(function FilesScreen(props: {
  isActive: boolean;
  language: LanguageCode;
  files: FileItem[];
  isConverting: boolean;
  isDragOver: boolean;
  recovery?: ReactNode;
  onAddFiles(): void;
  onClear(): void;
  onClearUnsupported(): void;
  onDragOver(active: boolean): void;
  onDrop(event: DragEvent<HTMLElement>): void;
  onFormats(): void;
  onExtractText(file: FileItem): void;
  onRemove(fileId: string): void;
}) {
  const hasFiles = props.files.length > 0;
  const hasConvertibleFiles = props.files.some(hasAvailableTargets);
  const unsupportedCount = useMemo(
    () => props.files.reduce((count, file) => count + (hasAvailableTargets(file) ? 0 : 1), 0),
    [props.files],
  );
  const { onScroll, viewportRef, windowState } = useVirtualGridWindow({
    itemCount: props.files.length,
    rowHeight: 144,
    minimumColumnWidth: 270,
    gap: 12,
    overscan: 1,
    isActive: props.isActive,
    resetKey: props.files[0]?.id ?? "empty",
  });
  const visibleFiles = props.files.slice(windowState.startItemIndex, windowState.endItemIndex);

  return (
    <section className={`screen upload-screen ${props.isActive ? "is-active" : ""}`} aria-labelledby="upload-title">
      <h2 id="upload-title" className="visually-hidden">{t(props.language, "step.files")}</h2>
      <div className="upload-grid">
        <section
          className={`drop-zone ${props.isDragOver ? "is-over" : ""}`}
          aria-label={t(props.language, "upload.dropZone")}
          onDragEnter={(event) => { event.preventDefault(); props.onDragOver(true); }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) props.onDragOver(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={props.onDrop}
        >
          <div className="sketch-orbit" aria-hidden="true"><img src={brandLogoUrl} alt="" /></div>
          <div><strong>{props.isDragOver ? t(props.language, "upload.dropFiles") : t(props.language, "upload.dragDrop")}</strong></div>
          <button className="primary-button" type="button" onClick={props.onAddFiles}>{t(props.language, "upload.browse")}</button>
        </section>
      </div>

      {hasFiles && (
        <p className="file-summary" aria-live="polite">
          {uploadedFilesSummary(props.language, props.files.length, fileSummary(props.files, props.language))}
        </p>
      )}

      <section
        ref={viewportRef}
        className="file-lane"
        aria-label={t(props.language, "upload.selectedFiles")}
        data-testid="virtual-file-grid"
        data-total-count={props.files.length}
        onScroll={onScroll}
      >
        {!hasFiles && (props.recovery ?? <div className="empty-state">{t(props.language, "upload.empty")}</div>)}
        {hasFiles && (
          <div className="virtual-file-grid-content" style={{ height: `${windowState.totalHeight}px` }}>
            <div
              className="virtual-file-grid-window"
              style={{
                gridTemplateColumns: `repeat(${windowState.columnCount}, minmax(0, 1fr))`,
                transform: `translateY(${windowState.offsetTop}px)`,
              }}
            >
              {visibleFiles.map((file) => (
                <FileTicket
                  key={file.id}
                  file={file}
                  language={props.language}
                  onExtractText={props.onExtractText}
                  onRemove={props.onRemove}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {hasFiles && (
        <footer className="screen-actions">
          <div className="file-action-group">
            <button className="ghost-button" type="button" disabled={props.isConverting} onClick={props.onClear}>{t(props.language, "upload.clear")}</button>
            {unsupportedCount > 0 && (
              <button className="secondary-button" type="button" disabled={props.isConverting} onClick={props.onClearUnsupported}>
                {t(props.language, "upload.removeUnsupported")}
              </button>
            )}
          </div>
          {hasConvertibleFiles && (
            <button className="primary-button" type="button" disabled={props.isConverting} onClick={props.onFormats}>{t(props.language, "upload.goFormat")}</button>
          )}
        </footer>
      )}
    </section>
  );
});
