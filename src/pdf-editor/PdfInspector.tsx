import { useEffect, useState } from "react";
import type {
  PdfEditorSessionV1,
  PdfObjectV1,
  PdfPageV1,
} from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import { PdfColorControl } from "./PdfColorControl";
import { PdfPageActions } from "./PdfPageActions";
import {
  canApplyPdfPatch,
  canEditPdfObject,
  normalizePdfHex,
  pdfObjectLabelKey,
  pdfRotationMatrix,
  type PdfPatchOperation,
  type PdfPatchValues,
} from "./pdfEditorModel";

export interface PdfActiveContentFinding {
  pageNumber: number;
  object: PdfObjectV1;
}

interface PdfInspectorProps {
  language: LanguageCode;
  session: PdfEditorSessionV1;
  activePage: PdfPageV1 | null;
  selectedObject: PdfObjectV1 | null;
  activeContentFindings: PdfActiveContentFinding[];
  pendingPatchCount: number;
  editableCopyBusy: boolean;
  ocrProgress: number | null;
  onObjectPatch(operation: PdfPatchOperation, object: PdfObjectV1, values?: PdfPatchValues): void;
  onPagePatch(operation: PdfPatchOperation, values?: PdfPatchValues): void;
  onInsertImage(): void;
  onReplaceImage(object: PdfObjectV1): void;
  onRecognizePage(): void;
  onCancelOcr(): void;
  onCreateEditableCopy(): void;
}

const LAYER_ACTIONS = [
  { operation: "sendObjectBack", label: "pdfEditor.sendBack", symbol: "⇊" },
  { operation: "moveObjectBackward", label: "pdfEditor.moveBackward", symbol: "↓" },
  { operation: "moveObjectForward", label: "pdfEditor.moveForward", symbol: "↑" },
  { operation: "bringObjectFront", label: "pdfEditor.bringFront", symbol: "⇈" },
] as const;

export function PdfInspector(props: PdfInspectorProps) {
  const object = props.selectedObject;
  const [text, setText] = useState(object?.text ?? "");
  useEffect(() => setText(object?.text ?? ""), [object?.objectId, object?.text]);

  return (
    <aside className="pdf-inspector" aria-label={t(props.language, "pdfEditor.inspector")}>
      <header>
        <span className="editor-eyebrow">{t(props.language, "pdfEditor.localSafe")}</span>
        <h2>{t(props.language, "pdfEditor.inspector")}</h2>
        <span className="pdf-pending-count">
          {t(props.language, "pdfEditor.pending", { count: props.pendingPatchCount })}
        </span>
      </header>

      {object ? (
        <section className="pdf-inspector-section" aria-labelledby="pdf-object-title">
          <div className="pdf-inspector-heading">
            <h3 id="pdf-object-title">{t(props.language, pdfObjectLabelKey(object.kind))}</h3>
            <span className={canEditPdfObject(props.session.permissions, object) ? "is-editable" : "is-readonly"}>
              {canEditPdfObject(props.session.permissions, object)
                ? t(props.language, "pdfEditor.editable")
                : t(props.language, "pdfEditor.readOnly")}
            </span>
          </div>
          <dl className="pdf-object-metadata">
            <div><dt>ID</dt><dd>{object.objectId}</dd></div>
            <div><dt>{t(props.language, "pdfEditor.position")}</dt><dd>{Math.round(object.bounds.x)} × {Math.round(object.bounds.y)}</dd></div>
            <div><dt>{t(props.language, "pdfEditor.size")}</dt><dd>{Math.round(object.bounds.width)} × {Math.round(object.bounds.height)} pt</dd></div>
          </dl>

          {object.activeContent && (
            <div className="pdf-active-content-note" role="note">
              <strong>{t(props.language, "pdfEditor.activeContent")}</strong>
              <span>{t(props.language, "pdfEditor.activeContentDescription")}</span>
            </div>
          )}

          {object.kind === "text" && (
            <label className="pdf-text-editor">
              <span>{t(props.language, "pdfEditor.textObject")}</span>
              <textarea
                value={text}
                disabled={!canEditPdfObject(props.session.permissions, object)}
                onChange={(event) => setText(event.target.value)}
              />
              <button
                type="button"
                disabled={!canEditPdfObject(props.session.permissions, object) || text === object.text}
                onClick={() => props.onObjectPatch("setText", object, { text })}
              >
                {t(props.language, "editor.apply")}
              </button>
            </label>
          )}

          {object.kind.startsWith("annotation:") && !object.activeContent && (
            <label className="pdf-text-editor">
              <span>{t(props.language, "pdfEditor.annotation")}</span>
              <textarea
                value={text}
                disabled={!props.session.permissions.canAnnotate}
                onChange={(event) => setText(event.target.value)}
              />
              <button
                type="button"
                disabled={!props.session.permissions.canAnnotate || text === object.text}
                onClick={() => props.onObjectPatch("setAnnotationContents", object, { text })}
              >
                {t(props.language, "editor.apply")}
              </button>
            </label>
          )}

          {object.kind === "form:Text" && (
            <label className="pdf-text-editor">
              <span>{t(props.language, "pdfEditor.formText")}</span>
              <textarea
                value={text}
                disabled={!props.session.permissions.canFillForms}
                onChange={(event) => setText(event.target.value)}
              />
              <button
                type="button"
                disabled={!props.session.permissions.canFillForms || text === object.text}
                onClick={() => props.onObjectPatch("setFormValue", object, { text })}
              >
                {t(props.language, "editor.apply")}
              </button>
            </label>
          )}

          {object.kind === "form:Checkbox" && (
            <label className="pdf-form-checkbox">
              <input
                type="checkbox"
                checked={object.text === "true"}
                disabled={!props.session.permissions.canFillForms}
                onChange={(event) => props.onObjectPatch("setFormValue", object, {
                  text: String(event.target.checked),
                })}
              />
              <span>{t(props.language, "pdfEditor.formCheckbox")}</span>
            </label>
          )}

          {object.kind === "form:RadioButton" && (
            <button
              className="pdf-secondary-action"
              type="button"
              disabled={!props.session.permissions.canFillForms || object.text === "true"}
              onClick={() => props.onObjectPatch("setFormValue", object, { text: "true" })}
            >
              {t(props.language, "pdfEditor.selectRadio")}
            </button>
          )}

          {(object.kind === "text" || object.kind === "path") && (
            <div className="pdf-object-colors">
              <PdfColorControl
                language={props.language}
                label={t(props.language, "pdfEditor.fillColor")}
                value={normalizePdfHex(object.fillColor)}
                disabled={!canEditPdfObject(props.session.permissions, object)}
                onChange={(color) => props.onObjectPatch("setFillColor", object, { color })}
              />
              <PdfColorControl
                language={props.language}
                label={t(props.language, "pdfEditor.strokeColor")}
                value={normalizePdfHex(object.strokeColor)}
                disabled={!canEditPdfObject(props.session.permissions, object)}
                onChange={(color) => props.onObjectPatch("setStrokeColor", object, { color })}
              />
            </div>
          )}

          {object.kind === "image" && (
            <>
              <button
                className="pdf-secondary-action"
                type="button"
                disabled={!canApplyPdfPatch(props.session.permissions, "replaceImage")}
                onClick={() => props.onReplaceImage(object)}
              >
                {t(props.language, "pdfEditor.replaceImage")}
              </button>
              <div className="pdf-object-transform-controls" role="group" aria-label={t(props.language, "pdfEditor.objectRotation")}>
                <button
                  type="button"
                  disabled={!canApplyPdfPatch(props.session.permissions, "transformObject")}
                  onClick={() => props.onObjectPatch("transformObject", object, { matrix: pdfRotationMatrix(object.bounds, -90) })}
                >
                  ↶ {t(props.language, "pdfEditor.rotateObjectLeft")}
                </button>
                <button
                  type="button"
                  disabled={!canApplyPdfPatch(props.session.permissions, "transformObject")}
                  onClick={() => props.onObjectPatch("transformObject", object, { matrix: pdfRotationMatrix(object.bounds, 90) })}
                >
                  ↷ {t(props.language, "pdfEditor.rotateObjectRight")}
                </button>
              </div>
              <div className="pdf-layer-controls" role="group" aria-label={t(props.language, "pdfEditor.layers")}>
                <strong>{t(props.language, "pdfEditor.layers")}</strong>
                <div>
                  {LAYER_ACTIONS.map((action) => (
                    <button
                      key={action.operation}
                      type="button"
                      disabled={!canApplyPdfPatch(props.session.permissions, action.operation)}
                      onClick={() => props.onObjectPatch(action.operation, object)}
                    >
                      <span aria-hidden="true">{action.symbol}</span>
                      {t(props.language, action.label)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {object.objectId.includes("-o") && (
            <button
              className="pdf-danger-button"
              type="button"
              disabled={!canApplyPdfPatch(props.session.permissions, "deleteObject")}
              onClick={() => props.onObjectPatch("deleteObject", object)}
            >
              {t(props.language, "pdfEditor.deleteObject")}
            </button>
          )}

          {object.kind.startsWith("annotation:") && !object.activeContent && (
            <button
              className="pdf-danger-button"
              type="button"
              disabled={!canApplyPdfPatch(props.session.permissions, "deleteAnnotation")}
              onClick={() => props.onObjectPatch("deleteAnnotation", object)}
            >
              {t(props.language, "pdfEditor.deleteAnnotation")}
            </button>
          )}
        </section>
      ) : (
        <div className="pdf-inspector-empty">
          <span aria-hidden="true">⌁</span>
          <p>{t(props.language, "pdfEditor.selectObject")}</p>
        </div>
      )}

      <Permissions
        session={props.session}
        language={props.language}
        activeContentFindings={props.activeContentFindings}
        pendingPatchCount={props.pendingPatchCount}
        editableCopyBusy={props.editableCopyBusy}
        onCreateEditableCopy={props.onCreateEditableCopy}
      />

      <PdfPageActions
        language={props.language}
        page={props.activePage}
        pageCount={props.session.pageCount}
        permissions={props.session.permissions}
        ocrProgress={props.ocrProgress}
        onPatch={props.onPagePatch}
        onInsertImage={props.onInsertImage}
        onRecognize={props.onRecognizePage}
        onCancelOcr={props.onCancelOcr}
      />
    </aside>
  );
}

function Permissions(props: {
  session: PdfEditorSessionV1;
  language: LanguageCode;
  activeContentFindings: PdfActiveContentFinding[];
  pendingPatchCount: number;
  editableCopyBusy: boolean;
  onCreateEditableCopy(): void;
}) {
  const permissions = props.session.permissions;
  const canCreateEditableCopy = props.session.signatures.length > 0 || permissions.docMdpLevel !== null;
  const editableCopyBlocked = props.pendingPatchCount > 0 || props.editableCopyBusy;
  return (
    <section className="pdf-inspector-section pdf-security" aria-labelledby="pdf-security-title">
      <h3 id="pdf-security-title">{t(props.language, "pdfEditor.security")}</h3>
      {permissions.docMdpLevel ? (
        <div className="pdf-docmdp-note" role="note">
          <strong>DocMDP {permissions.docMdpLevel}</strong>
          <span>{docMdpDescription(props.language, permissions.docMdpLevel)}</span>
        </div>
      ) : (
        <p>{t(props.language, "pdfEditor.noDocMdp")}</p>
      )}
      <ul className="pdf-permission-list">
        <Permission label={t(props.language, "pdfEditor.modifyContent")} allowed={permissions.canModify} />
        <Permission label={t(props.language, "pdfEditor.annotate")} allowed={permissions.canAnnotate} />
        <Permission label={t(props.language, "pdfEditor.fillForms")} allowed={permissions.canFillForms} />
        <Permission label={t(props.language, "pdfEditor.assemble")} allowed={permissions.canAssemble} />
      </ul>
      <div className="pdf-signatures">
        <strong>{t(props.language, "pdfEditor.signatures", { count: props.session.signatures.length })}</strong>
        {props.session.signatures.map((signature) => (
          <span key={signature.index}>
            #{signature.index + 1} · {signature.reason || t(props.language, "pdfEditor.noSignatureReason")}
          </span>
        ))}
      </div>
      {canCreateEditableCopy && (
        <div className="pdf-docmdp-note" role="note">
          <strong>{t(props.language, "pdfEditor.createEditableCopy")}</strong>
          <span id="pdf-editable-copy-description">
            {t(props.language, editableCopyBlocked && props.pendingPatchCount > 0
              ? "pdfEditor.editableCopyPendingBlocked"
              : "pdfEditor.createEditableCopyDescription")}
          </span>
          <button
            className="pdf-secondary-action"
            type="button"
            aria-describedby="pdf-editable-copy-description"
            disabled={editableCopyBlocked}
            onClick={props.onCreateEditableCopy}
          >
            {t(props.language, "pdfEditor.createEditableCopy")}
          </button>
        </div>
      )}
      {props.activeContentFindings.length > 0 && (
        <div className="pdf-active-content-note" role="note">
          <strong>{t(props.language, "pdfEditor.activeContentFindings", {
            count: props.activeContentFindings.length,
          })}</strong>
          <ul>
            {props.activeContentFindings.map((finding) => (
              <li key={`${finding.pageNumber}:${finding.object.objectId}`}>
                {t(props.language, "pdfEditor.activeContentFinding", {
                  page: finding.pageNumber,
                  kind: t(props.language, pdfObjectLabelKey(finding.object.kind)),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="pdf-active-policy">{t(props.language, "pdfEditor.preserveActiveContent")}</p>
    </section>
  );
}

function Permission(props: { label: string; allowed: boolean }) {
  return <li className={props.allowed ? "is-allowed" : "is-denied"}><span aria-hidden="true">{props.allowed ? "✓" : "—"}</span>{props.label}</li>;
}

function docMdpDescription(language: LanguageCode, level: number) {
  if (level === 1) return t(language, "pdfEditor.docMdp1");
  if (level === 2) return t(language, "pdfEditor.docMdp2");
  return t(language, "pdfEditor.docMdp3");
}
