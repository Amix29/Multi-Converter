import { useState } from "react";
import type { PdfPageV1, PdfPermissionV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import {
  canApplyPdfPatch,
  type PdfPatchOperation,
  type PdfPatchValues,
} from "./pdfEditorModel";

interface PdfPageActionsProps {
  language: LanguageCode;
  page: PdfPageV1 | null;
  pageCount: number;
  permissions: PdfPermissionV1;
  ocrProgress: number | null;
  onPatch(operation: PdfPatchOperation, values?: PdfPatchValues): void;
  onInsertImage(): void;
  onRecognize(): void;
  onCancelOcr(): void;
}

type AnnotationType = "text" | "freeText" | "square";

export function PdfPageActions(props: PdfPageActionsProps) {
  const [annotationType, setAnnotationType] = useState<AnnotationType>("text");
  const [annotationText, setAnnotationText] = useState("");
  const page = props.page;
  if (!page) return null;

  const canAssemble = canApplyPdfPatch(props.permissions, "insertPage");
  const canModify = canApplyPdfPatch(props.permissions, "insertImage");
  const canAnnotate = canApplyPdfPatch(props.permissions, "createAnnotation");

  const createAnnotation = () => {
    const width = Math.min(220, Math.max(48, page.widthPoints - 96));
    props.onPatch("createAnnotation", {
      annotationType,
      text: annotationType === "square" ? null : annotationText.trim() || null,
      color: "#C8734F",
      bounds: {
        x: 48,
        y: Math.max(48, page.heightPoints - 140),
        width,
        height: annotationType === "text" ? 28 : 64,
      },
    });
    setAnnotationText("");
  };

  return (
    <section className="pdf-inspector-section pdf-page-actions" aria-labelledby="pdf-page-actions-title">
      <h3 id="pdf-page-actions-title">{t(props.language, "pdfEditor.pageActions")}</h3>

      <div className="pdf-action-grid" role="group" aria-label={t(props.language, "pdfEditor.pageOrganization")}>
        <button type="button" disabled={!canAssemble} onClick={() => props.onPatch("insertPage", {
          widthPoints: page.widthPoints,
          heightPoints: page.heightPoints,
        })}>{t(props.language, "pdfEditor.insertPage")}</button>
        <button type="button" disabled={!canAssemble} onClick={() => props.onPatch("duplicatePage", {
          targetPageNumber: Math.min(props.pageCount + 1, page.pageNumber + 1),
        })}>{t(props.language, "pdfEditor.duplicatePage")}</button>
        <button type="button" disabled={!canAssemble || page.pageNumber <= 1} onClick={() => props.onPatch("movePage", {
          targetPageNumber: page.pageNumber - 1,
        })}>{t(props.language, "pdfEditor.movePageUp")}</button>
        <button type="button" disabled={!canAssemble || page.pageNumber >= props.pageCount} onClick={() => props.onPatch("movePage", {
          targetPageNumber: page.pageNumber + 1,
        })}>{t(props.language, "pdfEditor.movePageDown")}</button>
      </div>

      <button className="pdf-secondary-action" type="button" disabled={!canModify} onClick={props.onInsertImage}>
        {t(props.language, "pdfEditor.insertImage")}
      </button>

      <div className="pdf-annotation-creator">
        <label>
          <span>{t(props.language, "pdfEditor.annotationType")}</span>
          <select value={annotationType} disabled={!canAnnotate} onChange={(event) => setAnnotationType(event.target.value as AnnotationType)}>
            <option value="text">{t(props.language, "pdfEditor.annotationText")}</option>
            <option value="freeText">{t(props.language, "pdfEditor.annotationFreeText")}</option>
            <option value="square">{t(props.language, "pdfEditor.annotationSquare")}</option>
          </select>
        </label>
        {annotationType !== "square" && (
          <label>
            <span>{t(props.language, "pdfEditor.annotationContents")}</span>
            <textarea value={annotationText} disabled={!canAnnotate} onChange={(event) => setAnnotationText(event.target.value)} />
          </label>
        )}
        <button className="pdf-secondary-action" type="button" disabled={!canAnnotate} onClick={createAnnotation}>
          {t(props.language, "pdfEditor.createAnnotation")}
        </button>
      </div>

      <div className="pdf-ocr-layer">
        <div>
          <strong>{t(props.language, "pdfEditor.ocrLayer")}</strong>
          <span>{t(props.language, "pdfEditor.ocrLayerDescription")}</span>
        </div>
        {props.ocrProgress === null ? (
          <button className="pdf-secondary-action" type="button" disabled={!canModify} onClick={props.onRecognize}>
            {t(props.language, "pdfEditor.createOcrLayer")}
          </button>
        ) : (
          <div className="pdf-ocr-progress" role="status">
            <progress max="100" value={props.ocrProgress} />
            <span>{props.ocrProgress}%</span>
            <button type="button" onClick={props.onCancelOcr}>{t(props.language, "common.cancel")}</button>
          </div>
        )}
      </div>

      <button
        className="pdf-danger-button"
        type="button"
        disabled={!canAssemble || props.pageCount <= 1}
        onClick={() => props.onPatch("deletePage")}
      >
        {t(props.language, "pdfEditor.deletePage")}
      </button>
    </section>
  );
}
