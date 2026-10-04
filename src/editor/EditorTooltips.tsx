import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t, type LanguageCode } from "../i18n";

const describedActions = ["fontFamily", "fontSize", "lineHeight", "formattingMarks", "bold", "italic", "underline", "strike", "clearFormatting", "undo", "redo", "link", "image", "table", "pageBreak", "findReplace", "header", "footer", "keyboardShortcuts", "zoom", "resetZoom"] as const;
interface Tip { target: HTMLElement; label: string; description: string; shortcut: string; top: number; left: number }

export function EditorTooltips({ language }: { language: LanguageCode }) {
  const id = useId();
  const surface = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let timer = 0;
    let pending: HTMLElement | null = null;
    const dismiss = () => { window.clearTimeout(timer); pending = null; setTip(null); };
    const identify = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const control = target.closest<HTMLElement>("button, input:not([type=hidden]):not([type=file]), select, [data-editor-tip]");
      return control?.closest(".document-editor-shell, .editor-font-popover, .editor-color-popover, .editor-metric-menu") ? control : null;
    };
    const schedule = (event: Event) => {
      const target = identify(event.target);
      if (!target || target === pending || document.body.classList.contains("has-open-modal")) return;
      dismiss();
      const labelled = target.getAttribute("aria-labelledby")?.split(" ").map((key) => document.getElementById(key)?.textContent ?? "").join(" ");
      const label = target.dataset.editorTip || target.getAttribute("aria-label") || labelled || target.closest("label")?.textContent?.trim() || target.getAttribute("title") || target.textContent?.trim();
      if (!label) return;
      pending = target;
      timer = window.setTimeout(() => {
        if (!target.isConnected) return;
        const action = describedActions.find((key) => t(language, `editor.${key}`) === label);
        const description = target.closest<HTMLElement>("[data-editor-tip-description]")?.dataset.editorTipDescription || (action ? t(language, `editor.tip.${action}`) : "");
        const rect = target.getBoundingClientRect();
        setTip({ target, label, description, shortcut: target.dataset.editorShortcut ?? "", top: rect.bottom + 8, left: Math.max(8, Math.min(rect.left, innerWidth - 264)) });
      }, event.type === "focusin" ? 300 : 650);
    };
    const leave = (event: Event) => {
      if (identify((event as MouseEvent).relatedTarget) !== pending) dismiss();
    };
    document.addEventListener("pointerover", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusout", leave);
    const dismissEvents = ["pointerdown", "keydown", "wheel", "multi-converter:modal-open"];
    dismissEvents.forEach((event) => document.addEventListener(event, dismiss, true));
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      dismiss();
      document.removeEventListener("pointerover", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusout", leave);
      dismissEvents.forEach((event) => document.removeEventListener(event, dismiss, true));
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [language]);

  useLayoutEffect(() => {
    if (!tip || !surface.current) return;
    const rect = tip.target.getBoundingClientRect();
    const height = surface.current.getBoundingClientRect().height;
    surface.current.style.top = `${rect.bottom + 8 + height <= innerHeight - 8 ? rect.bottom + 8 : Math.max(8, rect.top - height - 8)}px`;
    const previous = tip.target.getAttribute("aria-describedby");
    tip.target.setAttribute("aria-describedby", [previous, id].filter(Boolean).join(" "));
    return () => {
      if (previous) tip.target.setAttribute("aria-describedby", previous);
      else tip.target.removeAttribute("aria-describedby");
    };
  }, [tip, id]);

  return tip && createPortal(
    <div ref={surface} id={id} role="tooltip" className="editor-tooltip" style={{ top: tip.top, left: tip.left }}>
      <strong>{tip.label}{tip.shortcut && <kbd>{tip.shortcut}</kbd>}</strong>
      {tip.description && <p>{tip.description}</p>}
    </div>, document.body,
  );
}
