import { useCallback, useEffect, useRef, useState } from "react";

export function useEditorFocusMode() {
  const [focusMode, setFocusMode] = useState(false);
  const focusButtonRef = useRef<HTMLButtonElement>(null);

  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    window.requestAnimationFrame(() => focusButtonRef.current?.focus());
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((active) => !active);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("editor-focus-mode-active", focusMode);
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.body.classList.contains("has-open-modal") || document.querySelector(".editor-color-popover, .editor-font-popover, .editor-metric-menu")) return;
      if (event.key === "F11" && !event.defaultPrevented) {
        event.preventDefault();
        if (!event.repeat) toggleFocusMode();
        return;
      }
      if (!focusMode) return;
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.target instanceof HTMLElement && event.target.closest(".editor-searchbar, .editor-zoom-value")) return;
      event.preventDefault();
      exitFocusMode();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.classList.remove("editor-focus-mode-active");
    };
  }, [exitFocusMode, focusMode, toggleFocusMode]);

  return {
    focusMode,
    focusButtonRef,
    toggleFocusMode,
  };
}
