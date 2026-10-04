import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { api } from "../lib/api";
import { t, type LanguageCode, type TranslationKey } from "../i18n";
import {
  finiteDocumentCoordinate,
  keyboardResizeDelta,
  resizeImage,
  resizeOffsetForLayout,
  safeImageZIndex,
  type ImageResizeHandle,
} from "./imageGeometry";
import "./editor-media.css";

interface DocumentImageOptions { documentId: string }

const PIXELS_PER_MM = 96 / 25.4;
const HANDLES: ImageResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function DocumentImageView(props: NodeViewProps) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const assetId = String(props.node.attrs.assetId || "");
  const documentId = String((props.extension.options as DocumentImageOptions).documentId || "");
  const language = editorLanguage();
  const width = safeMeasure(props.node.attrs.width, "15cm");
  const height = safeMeasure(props.node.attrs.height, "auto");
  const align = imageAlign(props.node.attrs.align);
  const layoutMode = props.node.attrs.layoutMode === "floating" ? "floating" : "flow";
  const offsetXmm = finiteDocumentCoordinate(props.node.attrs.offsetXmm);
  const offsetYmm = finiteDocumentCoordinate(props.node.attrs.offsetYmm);
  const zIndex = safeImageZIndex(props.node.attrs.zIndex);

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    setSource(null);
    setFailed(false);
    if (!documentId || !assetId) {
      setFailed(true);
      return;
    }
    void api.editorReadAsset(documentId, assetId).then((asset) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }));
      setSource(objectUrl);
    }).catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, documentId]);

  function updateGeometry(
    start: { width: number; height: number },
    geometry: ReturnType<typeof resizeImage>,
  ) {
    const translation = resizeOffsetForLayout(start, geometry, layoutMode, align as "left" | "center" | "right");
    props.updateAttributes({
      width: `${(geometry.width / (PIXELS_PER_MM * 10)).toFixed(2)}cm`,
      height: `${(geometry.height / (PIXELS_PER_MM * 10)).toFixed(2)}cm`,
      offsetXmm: finiteDocumentCoordinate(offsetXmm + translation.x / PIXELS_PER_MM),
      offsetYmm: finiteDocumentCoordinate(offsetYmm + translation.y / PIXELS_PER_MM),
    });
  }

  function beginResize(handle: ImageResizeHandle, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const frame = event.currentTarget.closest<HTMLElement>(".document-image-frame");
    if (!frame) return;
    props.editor.view.dispatch(closeHistory(props.editor.state.tr));
    const zoom = editorZoom(frame);
    const rect = frame.getBoundingClientRect();
    const start = { width: rect.width / zoom, height: rect.height / zoom };
    const origin = { x: event.clientX, y: event.clientY };
    trackPointer(event, (next) => {
      const geometry = resizeImage(start, handle, {
        x: (next.clientX - origin.x) / zoom,
        y: (next.clientY - origin.y) / zoom,
      }, next);
      updateGeometry(start, geometry);
    });
  }

  function resizeWithKeyboard(handle: ImageResizeHandle, event: React.KeyboardEvent<HTMLElement>) {
    const frame = event.currentTarget.closest<HTMLElement>(".document-image-frame");
    if (!frame) return;
    const delta = keyboardResizeDelta(handle, event.key, event.ctrlKey ? 10 : 2);
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const zoom = editorZoom(frame);
    const rect = frame.getBoundingClientRect();
    const start = { width: rect.width / zoom, height: rect.height / zoom };
    updateGeometry(start, resizeImage(
      start,
      handle,
      delta,
      event,
    ));
  }

  function beginMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    props.editor.view.dispatch(closeHistory(props.editor.state.tr));
    event.preventDefault();
    event.stopPropagation();
    const origin = { x: event.clientX, y: event.clientY };
    const zoom = editorZoom(event.currentTarget);
    trackPointer(event, (next) => props.updateAttributes({
      layoutMode: "floating",
      offsetXmm: finiteDocumentCoordinate(offsetXmm + (next.clientX - origin.x) / zoom / PIXELS_PER_MM),
      offsetYmm: finiteDocumentCoordinate(offsetYmm + (next.clientY - origin.y) / zoom / PIXELS_PER_MM),
    }));
  }

  function moveWithKeyboard(event: React.KeyboardEvent<HTMLElement>) {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 2;
    props.updateAttributes({
      layoutMode: "floating",
      offsetXmm: finiteDocumentCoordinate(offsetXmm + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0)),
      offsetYmm: finiteDocumentCoordinate(offsetYmm + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)),
    });
  }

  return (
    <NodeViewWrapper
      className={`document-image-node ${props.selected ? "is-selected" : ""}`}
      data-align={align}
      data-layout-mode={layoutMode}
      data-wrap-mode={props.node.attrs.wrapMode === "parallel" ? "parallel" : "none"}
      data-drag-handle
      style={{
        transform: offsetXmm !== 0 || offsetYmm !== 0
          ? `translate(${offsetXmm}mm, ${offsetYmm}mm)`
          : undefined,
        zIndex,
      }}
      role="figure"
      aria-label={String(props.node.attrs.alt || props.node.attrs.title || label(language, "editor.media.image"))}
    >
      {source ? (
        <div className="document-image-frame" style={{ width, height: height === "auto" ? undefined : height }}
          role="group"
          tabIndex={props.selected ? 0 : -1}
          aria-label={label(language, layoutMode === "floating" ? "editor.media.move" : "editor.media.image")}
          onClick={() => { const position = props.getPos(); if (typeof position === "number") props.editor.commands.setNodeSelection(position); }}
          onPointerDown={(event) => { if (layoutMode === "floating") { const position = props.getPos(); if (typeof position === "number") props.editor.commands.setNodeSelection(position); beginMove(event); } }}
          onKeyDown={(event) => { if (layoutMode === "floating") moveWithKeyboard(event); }}
        >
          <img src={source} alt={String(props.node.attrs.alt || "")} title={String(props.node.attrs.title || "")} draggable={false} />
          {props.selected && HANDLES.map((handle) => (
            <button
              key={handle}
              className="document-image-resize-handle"
              data-handle={handle}
              type="button"
              contentEditable={false}
              onPointerDown={(event) => beginResize(handle, event)}
              onKeyDown={(event) => resizeWithKeyboard(handle, event)}
              aria-label={`${label(language, "editor.media.resize")} — ${handle.toUpperCase()}`}
              title={`${label(language, "editor.media.resize")} — ${handle.toUpperCase()}`}
            />
          ))}
        </div>
      ) : failed ? (
        <span className="document-image-error" role="status">{label(language, "editor.media.unavailable")}</span>
      ) : (
        <span className="document-image-loading" role="status">{label(language, "editor.media.loading")}</span>
      )}
    </NodeViewWrapper>
  );
}

function trackPointer(event: ReactPointerEvent<HTMLElement>, onMove: (event: PointerEvent) => void) {
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const pointerId = event.pointerId;
  const move = (next: PointerEvent) => {
    if (next.pointerId === pointerId) onMove(next);
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function editorZoom(element: Element) {
  const value = Number.parseFloat(getComputedStyle(element.closest(".editor-page-scale") || element).getPropertyValue("--editor-zoom"));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function editorLanguage(): LanguageCode {
  const value = document.documentElement.lang;
  return (["fr", "en", "es", "de", "pt", "it"] as const).includes(value as LanguageCode) ? value as LanguageCode : "fr";
}

function label(language: LanguageCode, key: string) { return t(language, key as TranslationKey); }
function imageAlign(value: unknown) { return ["left", "center", "right"].includes(String(value)) ? String(value) : "center"; }
function safeMeasure(value: unknown, fallback: string) {
  const measure = String(value || fallback).trim();
  return measure === "auto" || /^\d+(?:\.\d+)?(?:cm|mm|in|px|pt|%)$/.test(measure) ? measure : fallback;
}
