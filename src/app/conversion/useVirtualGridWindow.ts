import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateVirtualGridWindow } from "./largeListModel";

export function useVirtualGridWindow(options: {
  itemCount: number;
  rowHeight: number;
  minimumColumnWidth: number;
  gap: number;
  overscan?: number;
  isActive: boolean;
  resetKey: string;
}) {
  const viewportRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ height: 0, width: 0, scrollTop: 0 });

  const measure = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    setViewport({
      height: element.clientHeight,
      width: element.clientWidth,
      scrollTop: element.scrollTop,
    });
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || !options.isActive) return;
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, options.isActive]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    element.scrollTop = 0;
    measure();
  }, [measure, options.resetKey]);

  const onScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    setViewport({
      height: element.clientHeight,
      width: element.clientWidth,
      scrollTop: element.scrollTop,
    });
  }, []);

  const windowState = useMemo(() => calculateVirtualGridWindow({
    itemCount: options.itemCount,
    rowHeight: options.rowHeight,
    minimumColumnWidth: options.minimumColumnWidth,
    gap: options.gap,
    scrollTop: viewport.scrollTop,
    viewportHeight: viewport.height,
    viewportWidth: viewport.width,
    overscan: options.overscan,
  }), [
    options.gap,
    options.itemCount,
    options.minimumColumnWidth,
    options.overscan,
    options.rowHeight,
    viewport.height,
    viewport.scrollTop,
    viewport.width,
  ]);

  return { onScroll, viewportRef, windowState };
}
