import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateVirtualWindow } from "./largeListModel";

export function useVirtualWindow<T extends HTMLElement = HTMLElement>(options: {
  itemCount: number;
  rowHeight: number;
  isActive: boolean;
  resetKey: string;
}) {
  const viewportRef = useRef<T>(null);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });

  const measure = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    setViewport({ height: element.clientHeight, scrollTop: element.scrollTop });
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
    setViewport({ height: element.clientHeight, scrollTop: element.scrollTop });
  }, []);

  const windowState = useMemo(() => calculateVirtualWindow({
    itemCount: options.itemCount,
    rowHeight: options.rowHeight,
    scrollTop: viewport.scrollTop,
    viewportHeight: viewport.height,
  }), [options.itemCount, options.rowHeight, viewport.height, viewport.scrollTop]);

  return { onScroll, viewportRef, windowState };
}
