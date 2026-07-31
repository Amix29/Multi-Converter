import { useEffect, useRef, type RefObject } from "react";

interface ModalAccessibilityOptions {
  isOpen: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onEscape?: (() => void) | undefined;
  returnFocus?: (() => HTMLElement | null) | undefined;
}

interface ModalStackEntry {
  id: symbol;
  surface: HTMLElement;
}

const modalStack: ModalStackEntry[] = [];
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalAccessibility(options: ModalAccessibilityOptions) {
  const onEscapeRef = useRef(options.onEscape);
  const returnFocusRef = useRef(options.returnFocus);
  onEscapeRef.current = options.onEscape;
  returnFocusRef.current = options.returnFocus;

  useEffect(() => {
    if (!options.isOpen) return;
    const surface = options.surfaceRef.current;
    if (!surface) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const id = Symbol("modal");
    modalStack.push({ id, surface });

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus = options.initialFocusRef?.current;
      if (initialFocus && isFocusable(initialFocus)) initialFocus.focus();
      else (focusableElements(surface)[0] ?? surface).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1]?.id !== id) return;
      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(surface);
      if (!focusable.length) {
        event.preventDefault();
        surface.focus();
        return;
      }

      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (active === first || !surface.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !surface.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      const stackIndex = modalStack.findIndex((entry) => entry.id === id);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      window.requestAnimationFrame(() => {
        const focusTarget = returnFocusRef.current?.() ?? previousFocus;
        if (!focusTarget?.isConnected) return;
        const activeModal = modalStack[modalStack.length - 1]?.surface;
        if (!activeModal || activeModal.contains(focusTarget))
          focusTarget.focus();
      });
    };
  }, [options.initialFocusRef, options.isOpen, options.surfaceRef]);
}

function focusableElements(surface: HTMLElement) {
  return Array.from(
    surface.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter(isFocusable);
}

function isFocusable(element: HTMLElement) {
  const styles = window.getComputedStyle(element);
  return (
    !element.matches(":disabled") &&
    !element.closest("[inert]") &&
    element.getClientRects().length > 0 &&
    styles.display !== "none" &&
    styles.visibility !== "hidden" &&
    element.getAttribute("aria-hidden") !== "true"
  );
}
