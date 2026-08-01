import type { DragEvent } from "react";
import brandLogoUrl from "../../assets/multi-converter-icon-brand-orange.svg";
import { t, type LanguageCode } from "../../i18n";
import { compactFileMeta, displayFileName, fileSummary, hasAvailableTargets, uploadedFilesSummary } from "../conversion/model";
import type { FileItem } from "../types";

export function FilesScreen(props: {
  isActive: boolean;
  language: LanguageCode;
  files: FileItem[];
  isConverting: boolean;
  isDragOver: boolean;
  onAddFiles(): void;
  onClear(): void;
  onDragOver(active: boolean): void;
  onDrop(event: DragEvent<HTMLElement>): void;
  onFormats(): void;
  onExtractText(file: FileItem): void;
  onRemove(fileId: string): void;
}) {
  const hasFiles = props.files.length > 0;
  const hasConvertibleFiles = props.files.some(hasAvailableTargets);

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

      <section className="file-lane" aria-label={t(props.language, "upload.selectedFiles")}>
        {!hasFiles && <div className="empty-state">{t(props.language, "upload.empty")}</div>}
        {props.files.map((file) => (
          <article className="file-ticket" key={file.id}>
            <div><strong>{displayFileName(file)}</strong><span>{compactFileMeta(file, props.language)}</span></div>
            {!file.targets.length && <span className="ticket-status is-error">{t(props.language, "upload.unsupported")}</span>}
            {isOcrImage(file) && <button className="ghost-button file-ticket-ocr" type="button" onClick={() => props.onExtractText(file)}>{t(props.language, "ocr.extract")}</button>}
            <button className="remove-file-button" type="button" aria-label={`${t(props.language, "upload.removeFile")} ${file.name}`} onClick={() => props.onRemove(file.id)}>×</button>
          </article>
        ))}
      </section>

      {hasFiles && (
        <footer className="screen-actions">
          <button className="ghost-button" type="button" disabled={props.isConverting} onClick={props.onClear}>{t(props.language, "upload.clear")}</button>
          {hasConvertibleFiles && (
            <button className="primary-button" type="button" disabled={props.isConverting} onClick={props.onFormats}>{t(props.language, "upload.goFormat")}</button>
          )}
        </footer>
      )}
    </section>
  );
}

function isOcrImage(file: FileItem) {
  const extension = file.extension.toLowerCase().replace(/^\./, "");
  return ["png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"].includes(extension);
}
