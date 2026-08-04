import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { api } from "../lib/api";
import { t, type LanguageCode, type TranslationKey } from "../i18n";
import "./editor-media.css";

interface DocumentImageOptions {
  documentId: string;
}

const PIXELS_PER_MM = 96 / 25.4;

export function DocumentImageView(props: NodeViewProps) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const assetId = String(props.node.attrs.assetId || "");
  const documentId = String((props.extension.options as DocumentImageOptions).documentId || "");
  const language = editorLanguage();

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

  const width = safeMeasure(props.node.attrs.width, "15cm");
  const align = imageAlign(props.node.attrs.align);
  const layoutMode = props.node.attrs.layoutMode === "floating" ? "floating" : "flow";
  const offsetXmm = boundedNumber(props.node.attrs.offsetXmm, -500, 500);
  const offsetYmm = boundedNumber(props.node.attrs.offsetYmm, -500, 500);
  const zIndex = Math.round(boundedNumber(props.node.attrs.zIndex, -100, 100));

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const image = event.currentTarget.closest(".document-image-node")?.querySelector("img");
    if (!image) return;
    const startX = event.clientX;
    const startWidthCm = image.getBoundingClientRect().width / editorZoom(image) / (PIXELS_PER_MM * 10);
    trackPointer(event, (nextEvent) => {
      const deltaCm = (nextEvent.clientX - startX) / editorZoom(image) / (PIXELS_PER_MM * 10);
      props.updateAttributes({ width: `${clamp(startWidthCm + deltaCm, 2, 30).toFixed(2)}cm` });
    });
  }

  function beginMove(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const zoom = editorZoom(event.currentTarget);
    trackPointer(event, (nextEvent) => {
      props.updateAttributes({
        layoutMode: "floating",
        offsetXmm: clamp(offsetXmm + (nextEvent.clientX - startX) / zoom / PIXELS_PER_MM, -500, 500),
        offsetYmm: clamp(offsetYmm + (nextEvent.clientY - startY) / zoom / PIXELS_PER_MM, -500, 500),
      });
    });
  }

  function moveWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>) {
    const direction = event.key;
    if (!direction.startsWith("Arrow")) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 2;
    props.updateAttributes({
      layoutMode: "floating",
      offsetXmm: clamp(offsetXmm + (direction === "ArrowLeft" ? -step : direction === "ArrowRight" ? step : 0), -500, 500),
      offsetYmm: clamp(offsetYmm + (direction === "ArrowUp" ? -step : direction === "ArrowDown" ? step : 0), -500, 500),
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
        transform: layoutMode === "floating" ? `translate(${offsetXmm}mm, ${offsetYmm}mm)` : undefined,
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
          <LayerButton label={label(language, "editor.media.sendBack")} icon="back" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: -100 })} />
          <LayerButton label={label(language, "editor.media.stepBack")} icon="stepBack" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: Math.max(-100, zIndex - 1) })} />
          <LayerButton label={label(language, "editor.media.stepForward")} icon="stepForward" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: Math.min(100, zIndex + 1) })} />
          <LayerButton label={label(language, "editor.media.bringFront")} icon="front" onClick={() => props.updateAttributes({ layoutMode: "floating", zIndex: 100 })} />
          {layoutMode === "floating" && (
            <button type="button" onClick={() => props.updateAttributes({ layoutMode: "flow", offsetXmm: 0, offsetYmm: 0, zIndex: 0 })}>
              {label(language, "editor.media.returnToFlow")}
            </button>
          )}
        </div>
      )}
      {source ? (
        <div className="document-image-frame" style={{ width }}>
          <img src={source} alt={String(props.node.attrs.alt || "")} title={String(props.node.attrs.title || "")} draggable={false} />
          {props.selected && (
            <button className="document-image-resize" type="button" contentEditable={false} onPointerDown={beginResize} aria-label={label(language, "editor.media.resize")} title={label(language, "editor.media.resize")} />
          )}
        </div>
      ) : failed ? (
        <span className="document-image-error" role="status">{label(language, "editor.media.unavailable")}</span>
      ) : (
        <span className="document-image-loading" role="status">{label(language, "editor.media.loading")}</span>
      )}
    </NodeViewWrapper>
  );
}

function LayerButton(props: { label: string; icon: "back" | "stepBack" | "stepForward" | "front"; onClick(): void }) {
  return <button type="button" title={props.label} aria-label={props.label} onClick={props.onClick}><MediaIcon kind={props.icon} /></button>;
}

function MediaIcon(props: { kind: "move" | "back" | "stepBack" | "stepForward" | "front" }) {
  if (props.kind === "move") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" /></svg>;
  const front = props.kind === "front" || props.kind === "stepForward";
  const edge = props.kind === "front" || props.kind === "back";
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x={front ? 5 : 9} y={front ? 5 : 9} width="10" height="10" rx="1" /><rect x={front ? 9 : 5} y={front ? 9 : 5} width="10" height="10" rx="1" /><path d={edge ? (front ? "M4 3h16" : "M4 21h16") : (front ? "m17 4 3 3-3 3M20 7h-5" : "m7 20-3-3 3-3M4 17h5")} /></svg>;
}

function trackPointer(event: ReactPointerEvent<HTMLButtonElement>, onMove: (event: PointerEvent) => void) {
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const move = (nextEvent: PointerEvent) => onMove(nextEvent);
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

function label(language: LanguageCode, key: string) {
  return t(language, key as TranslationKey);
}

function imageAlign(value: unknown) {
  return ["left", "center", "right"].includes(String(value)) ? String(value) : "center";
}

function safeMeasure(value: unknown, fallback: string) {
  const measure = String(value || fallback).trim();
  return /^\d+(?:\.\d+)?(?:cm|mm|in|px|%)$/.test(measure) ? measure : fallback;
}

function boundedNumber(value: unknown, minimum: number, maximum: number) {
  const number = Number(value);
  return clamp(Number.isFinite(number) ? number : 0, minimum, maximum);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
