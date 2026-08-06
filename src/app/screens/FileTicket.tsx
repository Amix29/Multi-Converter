import { memo } from "react";
import { t, type LanguageCode } from "../../i18n";
import { compactFileMeta, hasAvailableTargets } from "../conversion/model";
import type { FileItem } from "../types";

export const FileTicket = memo(function FileTicket(props: {
  file: FileItem;
  language: LanguageCode;
  onExtractText(file: FileItem): void;
  onRemove(fileId: string): void;
}) {
  const { file } = props;

  return (
    <article className="file-ticket">
      <header className="file-ticket-header">
        <div className="file-ticket-identity">
          <span className="file-ticket-type" aria-hidden="true">
            {file.extension.replace(/^\./, "").slice(0, 5).toUpperCase() || "FILE"}
          </span>
          <strong title={file.name}>{file.name}</strong>
        </div>
        <button
          className="remove-file-button"
          type="button"
          aria-label={`${t(props.language, "upload.removeFile")} ${file.name}`}
          onClick={() => props.onRemove(file.id)}
        >
          ×
        </button>
      </header>
      <div className="file-ticket-meta">
        <span>{compactFileMeta(file, props.language)}</span>
        {!hasAvailableTargets(file) && (
          <span className="ticket-status is-error">{t(props.language, "upload.unsupported")}</span>
        )}
      </div>
      {isOcrImage(file) && (
        <footer className="file-ticket-actions">
          <button
            className="ghost-button file-ticket-ocr"
            type="button"
            onClick={() => props.onExtractText(file)}
          >
            {t(props.language, "ocr.extract")}
          </button>
        </footer>
      )}
    </article>
  );
});

function isOcrImage(file: FileItem) {
  const extension = file.extension.toLowerCase().replace(/^\./, "");
  return ["png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"].includes(extension);
}
