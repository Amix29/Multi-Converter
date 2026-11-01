import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";
import { untrack } from "svelte";

import { calculateVirtualWindow } from "./largeListModel";

export function createVirtualWindow<
  T extends HTMLElement = HTMLElement,
>(options: {
  itemCount: number;
  rowHeight: number;
  isActive: boolean;
  resetKey: string;
}) {
  const viewportRef: { current: T | null } = $state({ current: null });
  let viewport = $state.raw({ height: 0, scrollTop: 0 });
  const setViewport: StateSetter<typeof viewport> = (value) => {
    viewport = resolveStateUpdate(value, viewport);
  };
  const measure = () => {
    const element = viewportRef.current;
    if (!element) return;
    setViewport({ height: element.clientHeight, scrollTop: element.scrollTop });
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
    setViewport({ height: element.clientHeight, scrollTop: element.scrollTop });
  };
  const windowState = $derived.by(() =>
    calculateVirtualWindow({
      itemCount: options.itemCount,
      rowHeight: options.rowHeight,
      scrollTop: viewport.scrollTop,
      viewportHeight: viewport.height,
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
