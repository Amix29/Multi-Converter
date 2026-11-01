import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";
import { untrack } from "svelte";

import { calculateVirtualGridWindow } from "./largeListModel";

export function createVirtualGridWindow(options: {
  itemCount: number;
  rowHeight: number;
  minimumColumnWidth: number;
  gap: number;
  overscan?: number;
  isActive: boolean;
  resetKey: string;
}) {
  const viewportRef: { current: HTMLElement | null } = $state({
    current: null,
  });
  let viewport = $state.raw({ height: 0, width: 0, scrollTop: 0 });
  const setViewport: StateSetter<typeof viewport> = (value) => {
    viewport = resolveStateUpdate(value, viewport);
  };
  const measure = () => {
    const element = viewportRef.current;
    if (!element) return;
    setViewport({
      height: element.clientHeight,
      width: element.clientWidth,
      scrollTop: element.scrollTop,
    });
  };
  $effect(() => {
    void [measure, options.isActive];
    return untrack(() => {
      const element = viewportRef.current;
      if (!element || !options.isActive) return;
      measure();
      const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(measure);
      observer?.observe(element);
      window.addEventListener("resize", measure);
      return () => {
        observer?.disconnect();
        window.removeEventListener("resize", measure);
      };
    });
  });
  $effect(() => {
    void [measure, options.resetKey];
    return untrack(() => {
      const element = viewportRef.current;
      if (!element) return;
      element.scrollTop = 0;
      measure();
    });
  });
  const onScroll = (event: UIEvent & { currentTarget: HTMLElement }) => {
    const element = event.currentTarget;
    setViewport({
      height: element.clientHeight,
      width: element.clientWidth,
      scrollTop: element.scrollTop,
    });
  };
  const windowState = $derived.by(() =>
    calculateVirtualGridWindow({
      itemCount: options.itemCount,
      rowHeight: options.rowHeight,
      minimumColumnWidth: options.minimumColumnWidth,
      gap: options.gap,
      scrollTop: viewport.scrollTop,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
      overscan: options.overscan,
    }),
  );
  return {
    get onScroll() {
      return onScroll;
    },
    get viewportRef() {
      return viewportRef;
    },
    get windowState() {
      return windowState;
    },
  };
}
