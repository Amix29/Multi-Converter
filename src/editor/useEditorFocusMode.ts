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
    if (!focusMode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      exitFocusMode();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("editor-focus-mode-active");
    };
  }, [exitFocusMode, focusMode]);

  return {
    focusMode,
    focusButtonRef,
    toggleFocusMode,
  };
}
