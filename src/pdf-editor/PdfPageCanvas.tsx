import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PdfObjectV1, PdfPageV1 } from "../lib/api";
import { t, type LanguageCode } from "../i18n";
import {
  pdfMoveMatrix,
  pdfObjectLabelKey,
  pdfResizeMatrix,
  transformPdfBounds,
  type PdfResizeHandle,
} from "./pdfEditorModel";
import { PdfInlineTextEditor } from "./PdfInlineTextEditor";
import { pdfInlineTextStyle } from "./pdfInlineTextModel";

const HANDLES: PdfResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface PdfPageCanvasProps {
  language: LanguageCode;
  page: PdfPageV1;
  backgroundUrl: string | null;
  zoom: number;
  selectedObjectId: string | null;
  isObjectEditable(object: PdfObjectV1): boolean;
  canTransformObject(object: PdfObjectV1): boolean;
  isTextModified(object: PdfObjectV1): boolean;
  onActivePage(pageNumber: number): void;
  onSelect(object: PdfObjectV1 | null): void;
  onTransform(object: PdfObjectV1, matrix: [number, number, number, number, number, number]): void;
  onTextPatch(object: PdfObjectV1, text: string): void;
}

interface Gesture {
  pointerId: number;
  object: PdfObjectV1;
  mode: "move" | "resize";
  handle?: PdfResizeHandle;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  preserveAspect: boolean;
  resizeFromCenter: boolean;
}

export function PdfPageCanvas(props: PdfPageCanvasProps) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const objectButtons = useRef(new Map<string, HTMLButtonElement>());
  const width = props.page.widthPoints * props.zoom;
  const height = props.page.heightPoints * props.zoom;

  function beginGesture(
    event: ReactPointerEvent<HTMLElement>,
    object: PdfObjectV1,
    mode: Gesture["mode"],
    handle?: PdfResizeHandle,
  ) {
    if (editingObjectId === object.objectId || !props.canTransformObject(object) || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onSelect(object);
    setGesture({
      pointerId: event.pointerId,
      object,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      preserveAspect: !event.shiftKey,
      resizeFromCenter: event.altKey,
    });
  }

  function finishTextEditing(object: PdfObjectV1, text?: string) {
    if (text !== undefined && text !== object.text) props.onTextPatch(object, text);
    setEditingObjectId(null);
    requestAnimationFrame(() => objectButtons.current.get(object.objectId)?.focus());
  }

  function updateGesture(event: ReactPointerEvent<HTMLElement>) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    setGesture((current) => current && {
      ...current,
      currentX: event.clientX,
      currentY: event.clientY,
      preserveAspect: !event.shiftKey,
      resizeFromCenter: event.altKey,
    });
  }

  function finishGesture(event: ReactPointerEvent<HTMLElement>) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = gestureDelta(gesture, props.zoom);
    const matrix = gesture.mode === "move"
      ? pdfMoveMatrix(delta)
      : pdfResizeMatrix(
          gesture.handle ?? "se",
          gesture.object.bounds,
          delta,
          gesture.preserveAspect,
          gesture.resizeFromCenter,
        );
    setGesture(null);
    if (matrix.some((value, index) => Math.abs(value - [1, 0, 0, 1, 0, 0][index]) > 0.0001)) {
      props.onTransform(gesture.object, matrix);
    }
  }

  return (
    <section
      className="pdf-page-frame"
      aria-label={t(props.language, "pdfEditor.pageLabel", { page: props.page.pageNumber })}
      data-page-number={props.page.pageNumber}
      onPointerDown={() => props.onActivePage(props.page.pageNumber)}
    >
      <div
        className="pdf-page-canvas"
        style={{ width, height }}
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onSelect(null);
        }}
      >
        {props.backgroundUrl ? (
          <img
            className="pdf-page-render"
            src={props.backgroundUrl}
            alt=""
            draggable={false}
          />
        ) : (
          <div className="pdf-page-render-placeholder" aria-label={t(props.language, "pdfEditor.localRenderPreparing")} />
        )}
        <div className="pdf-object-layer" aria-label={t(props.language, "pdfEditor.pageObjects")}>
          {props.page.objects.map((object) => {
            const selected = object.objectId === props.selectedObjectId;
            const editable = props.isObjectEditable(object);
            const transformable = props.canTransformObject(object);
            const activeGesture = gesture?.object.objectId === object.objectId ? gesture : null;
            const bounds = previewBounds(object, activeGesture, props.zoom);
            const editing = editingObjectId === object.objectId;
            const textModified = object.kind === "text" && props.isTextModified(object);
            return (
              <div
                className={`pdf-object ${selected ? "is-selected" : ""} ${editable ? "is-editable" : "is-readonly"} ${transformable ? "is-transformable" : ""} ${object.activeContent ? "is-active-content" : ""} ${editing ? "is-inline-editing" : ""} ${textModified ? "is-text-modified" : ""}`}
                key={object.objectId}
                style={{
                  ...objectStyle(bounds, props.page, props.zoom),
                }}
                data-object-kind={object.kind}
                data-object-id={object.objectId}
              >
                {!editing && <button
                  ref={(node) => {
                    if (node) objectButtons.current.set(object.objectId, node);
                    else objectButtons.current.delete(object.objectId);
                  }}
                  className="pdf-object-hitbox"
                  type="button"
                  aria-label={`${t(props.language, pdfObjectLabelKey(object.kind))}${editable ? "" : `, ${t(props.language, "pdfEditor.readOnly")}`}`}
                  aria-pressed={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onSelect(object);
                    if (object.kind === "text" && editable) setEditingObjectId(object.objectId);
                  }}
                  onDoubleClick={(event) => {
                    if (object.kind !== "text" || !editable) return;
                    event.preventDefault();
                    event.stopPropagation();
                    setEditingObjectId(object.objectId);
                  }}
                  onKeyDown={(event) => {
                    if (object.kind === "text" && editable && (event.key === "Enter" || event.key === "F2")) {
                      event.preventDefault();
                      setEditingObjectId(object.objectId);
                      return;
                    }
                    if (!transformable || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                    event.preventDefault();
                    const step = event.shiftKey ? 10 : 1;
                    const xPoints = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
                    const yPoints = event.key === "ArrowDown" ? -step : event.key === "ArrowUp" ? step : 0;
                    props.onTransform(object, pdfMoveMatrix({ xPoints, yPoints }));
                  }}
                  onPointerDown={(event) => {
                    if (object.kind !== "text") {
                      beginGesture(event, object, "move");
                    }
                  }}
                  onPointerMove={updateGesture}
                  onPointerUp={finishGesture}
                  onPointerCancel={() => setGesture(null)}
                >
                  {object.kind === "text" && object.text && !textModified ? (
                    <span style={{ fontFamily: object.fontFamily ?? undefined }} aria-hidden="true">
                      {object.text.slice(0, 120)}
                    </span>
                  ) : null}
                  {textModified && object.text ? (
                    <span className="pdf-object-text-preview" style={pdfInlineTextStyle(object, props.zoom)} aria-hidden="true">
                      {object.text}
                    </span>
                  ) : null}
                </button>}
                {editing && <PdfInlineTextEditor
                  language={props.language}
                  object={object}
                  zoom={props.zoom}
                  onCommit={(text) => finishTextEditing(object, text)}
                  onCancel={() => finishTextEditing(object)}
                />}
                {selected && transformable && !editing && HANDLES.map((handle) => (
                  <button
                    className={`pdf-object-handle is-${handle}`}
                    key={handle}
                    type="button"
                    aria-label={t(props.language, "pdfEditor.resizeHandle", { handle })}
                    onPointerDown={(event) => beginGesture(event, object, "resize", handle)}
                    onPointerMove={updateGesture}
                    onPointerUp={finishGesture}
                    onPointerCancel={() => setGesture(null)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <footer className="pdf-page-folio">{props.page.pageNumber}</footer>
    </section>
  );
}

function gestureDelta(gesture: Gesture, zoom: number) {
  return {
    xPoints: (gesture.currentX - gesture.startX) / zoom,
    yPoints: (gesture.startY - gesture.currentY) / zoom,
  };
}

function previewBounds(object: PdfObjectV1, gesture: Gesture | null, zoom: number) {
  if (!gesture) return object.bounds;
  const delta = gestureDelta(gesture, zoom);
  if (gesture.mode === "move") return transformPdfBounds(object.bounds, pdfMoveMatrix(delta));
  return transformPdfBounds(object.bounds, pdfResizeMatrix(
    gesture.handle ?? "se",
    gesture.object.bounds,
    delta,
    gesture.preserveAspect,
    gesture.resizeFromCenter,
  ));
}

function objectStyle(bounds: PdfObjectV1["bounds"], page: PdfPageV1, zoom: number) {
  return {
    left: bounds.x * zoom,
    top: (page.heightPoints - bounds.y - bounds.height) * zoom,
    width: Math.max(4, bounds.width * zoom),
    height: Math.max(4, bounds.height * zoom),
  };
}
