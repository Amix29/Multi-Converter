import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { api } from "../lib/api";
import { t, type LanguageCode, type TranslationKey } from "../i18n";
import {
  finiteDocumentCoordinate,
  keyboardResizeDelta,
  MAXIMUM_IMAGE_Z_INDEX,
  MINIMUM_IMAGE_Z_INDEX,
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

  function beginResize(handle: ImageResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const frame = event.currentTarget.closest<HTMLElement>(".document-image-frame");
    if (!frame) return;
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

  function resizeWithKeyboard(handle: ImageResizeHandle, event: React.KeyboardEvent<HTMLButtonElement>) {
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

  function beginMove(event: ReactPointerEvent<HTMLButtonElement>) {
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

  function moveWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
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
      {props.selected && (
        <div className="document-image-controls" contentEditable={false} role="toolbar" aria-label={label(language, "editor.media.tools")}>
          <button type="button" className="document-image-move" onPointerDown={beginMove} onKeyDown={moveWithKeyboard} title={label(language, "editor.media.move")} aria-label={label(language, "editor.media.move")}>
            <MediaIcon kind="move" />
          </button>
          <span className="document-image-control-divider" />
          <LayerButton showLabel label={label(language, "editor.media.returnToFlow")} icon="flow" onClick={() => props.updateAttributes({ layoutMode: "flow", offsetXmm: 0, offsetYmm: 0, zIndex: 0 })} />
          <LayerButton showLabel label={label(language, "editor.media.behindText")} icon="back" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: -1 })} />
          <LayerButton showLabel label={label(language, "editor.media.inFrontOfText")} icon="front" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: 1 })} />
          <span className="document-image-control-divider" />
          <LayerButton label={label(language, "editor.media.sendBack")} icon="allBack" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: MINIMUM_IMAGE_Z_INDEX })} />
          <LayerButton label={label(language, "editor.media.stepBack")} icon="stepBack" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: safeImageZIndex(zIndex - 1) })} />
          <LayerButton label={label(language, "editor.media.stepForward")} icon="stepForward" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: safeImageZIndex(zIndex + 1) })} />
          <LayerButton label={label(language, "editor.media.bringFront")} icon="allFront" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: MAXIMUM_IMAGE_Z_INDEX })} />
        </div>
      )}
      {source ? (
        <div className="document-image-frame" style={{ width, height: height === "auto" ? undefined : height }}>
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

type LayerIcon = "move" | "flow" | "back" | "front" | "allBack" | "stepBack" | "stepForward" | "allFront";

function LayerButton(props: { label: string; icon: LayerIcon; showLabel?: boolean; onClick(): void }) {
  return <button type="button" className={props.showLabel ? "has-label" : ""} title={props.label} aria-label={props.label} onClick={props.onClick}><MediaIcon kind={props.icon} />{props.showLabel && <span>{props.label}</span>}</button>;
}

function MediaIcon({ kind }: { kind: LayerIcon }) {
  if (kind === "move") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" /></svg>;
  if (kind === "flow") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 18h16M4 10h5v4H4M15 10h5v4h-5" /><rect x="9" y="8" width="6" height="8" rx="1" /></svg>;
  const front = kind === "front" || kind === "allFront" || kind === "stepForward";
  const edge = kind === "allFront" || kind === "allBack";
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x={front ? 5 : 9} y={front ? 5 : 9} width="10" height="10" rx="1" /><rect x={front ? 9 : 5} y={front ? 9 : 5} width="10" height="10" rx="1" /><path d={edge ? (front ? "M4 3h16" : "M4 21h16") : (front ? "m17 4 3 3-3 3M20 7h-5" : "m7 20-3-3 3-3M4 17h5")} /></svg>;
}

function trackPointer(event: ReactPointerEvent<HTMLButtonElement>, onMove: (event: PointerEvent) => void) {
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
