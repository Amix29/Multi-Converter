import { useEffect, useEffectEvent, useRef, useState } from "react";
import { clampEditorZoom, DEFAULT_EDITOR_ZOOM } from "./editorZoom";

export function useEditorZoom() {
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_EDITOR_ZOOM);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ x: number; y: number; left: number; top: number; zoom: number } | null>(null);
  const setZoom = (value: number) => {
    anchorRef.current = null;
    setZoomPercent(clampEditorZoom(value));
  };

  const zoomBy = useEffectEvent((delta: number, clientX?: number, clientY?: number) => {
    if (clampEditorZoom(zoomPercent + delta) === zoomPercent) return;
    const canvas = canvasScrollRef.current;
    const page = canvas?.querySelector<HTMLElement>(".editor-page-scale");
    if (canvas && page) {
      const canvasRect = canvas.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      const x = clientX ?? canvasRect.left + canvasRect.width / 2;
      const y = clientY ?? canvasRect.top + canvasRect.height / 2;
      anchorRef.current = { x, y, left: pageRect.left, top: pageRect.top, zoom: zoomPercent };
    }
    setZoomPercent((value) => clampEditorZoom(value + delta));
  });

  useEffect(() => {
    const canvas = canvasScrollRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
      if (document.body.classList.contains("has-open-modal")) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 10 : -10, event.clientX, event.clientY);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest(".document-editor-shell") || target.closest("input, textarea, select")) return;
      if (document.body.classList.contains("has-open-modal")) return;
      if (["+", "=", "-", "0"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "0") setZoom(DEFAULT_EDITOR_ZOOM);
        else zoomBy(event.key === "-" ? -10 : 10);
      }
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("keydown", keydown, true);
    return () => {
      canvas.removeEventListener("wheel", wheel);
      document.removeEventListener("keydown", keydown, true);
    };
  }, []);

  useEffect(() => {
    const anchor = anchorRef.current;
    const canvas = canvasScrollRef.current;
    const page = canvas?.querySelector<HTMLElement>(".editor-page-scale");
    if (!anchor || !canvas || !page) return;
    anchorRef.current = null;
    const rect = page.getBoundingClientRect();
    const ratio = zoomPercent / anchor.zoom;
    canvas.scrollLeft += rect.left + (anchor.x - anchor.left) * ratio - anchor.x;
    canvas.scrollTop += rect.top + (anchor.y - anchor.top) * ratio - anchor.y;
  }, [zoomPercent]);

  return { zoomPercent, setZoom, canvasScrollRef };
}
