import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

interface MetricOption {
  value: string;
  label?: string;
}

interface EditorMetricComboboxProps {
  className: string;
  label: string;
  value: string;
  unit?: string;
  icon?: ReactNode;
  tooltip?: string;
  description: string;
  options: readonly MetricOption[];
  normalize(value: string): string | null;
  displayValue(value: string): string;
  onCommit(value: string): void;
}

export function EditorMetricCombobox(props: EditorMetricComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const committingRef = useRef(false);
  const keyboardChoiceRef = useRef(false);
  const [draft, setDraft] = useState(props.displayValue(props.value));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(props.displayValue(props.value));
    }
  }, [props]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = Math.min(280, props.options.length * 28 + 8);
      const top = rect.bottom + 6 + height <= window.innerHeight - 12
        ? rect.bottom + 6
        : Math.max(12, rect.top - height - 6);
      setPosition({ top, left: Math.max(12, rect.left), width: Math.max(84, rect.width) });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) close(false);
    };
    const onModalOpen = () => {
      setDraft(props.displayValue(props.value));
      close(false);
    };
    update();
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("multi-converter:modal-open", onModalOpen);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("multi-converter:modal-open", onModalOpen);
    };
  }, [open, props.options.length]);

  function commit(value = draft) {
    const normalized = props.normalize(value);
    if (!normalized) {
      setDraft(props.displayValue(props.value));
      return false;
    }
    setDraft(props.displayValue(normalized));
    committingRef.current = true;
    try { props.onCommit(normalized); }
    finally { committingRef.current = false; }
    return true;
  }

  function choose(option: MetricOption) {
    commit(option.value);
    close(false);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus) inputRef.current?.focus();
  }

  function moveActive(delta: number) {
    keyboardChoiceRef.current = true;
    setOpen(true);
    setActiveIndex((current) => {
      const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
      return (start + delta + props.options.length) % props.options.length;
    });
  }

  return (
    <div ref={rootRef} className={`editor-metric-combobox ${props.className}`} data-editor-tip-description={props.tooltip}>
      <div className="editor-metric-field">
        {props.icon && <span className="editor-metric-icon" aria-hidden="true">{props.icon}</span>}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          role="combobox"
          aria-label={props.label}
          aria-controls={listId}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-description={props.description}
          value={draft}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            keyboardChoiceRef.current = false;
            setActiveIndex(-1);
            setDraft(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (keyboardChoiceRef.current && activeIndex >= 0) choose(props.options[activeIndex]);
              else if (commit()) close(false);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDraft(props.displayValue(props.value));
              close(false);
            }
          }}
          onBlur={(event) => {
            const target = event.relatedTarget as Node | null;
            if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
              if (!committingRef.current && draft !== props.displayValue(props.value)) commit();
              close(false);
            }
          }}
        />
        {props.unit && <span aria-hidden="true">{props.unit}</span>}
        <button
          type="button"
          tabIndex={-1}
          aria-label={props.label}
          aria-expanded={open}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
        </button>
      </div>
      {open && createPortal(
        <div ref={menuRef} id={listId} className="editor-metric-menu" role="listbox" aria-label={props.label} style={position}>
          {props.options.map((option, index) => (
            <button
              id={`${listId}-${index}`}
              key={option.value}
              type="button"
              role="option"
              aria-selected={props.value === option.value}
              className={activeIndex === index ? "is-active" : ""}
              onPointerDown={(event) => event.preventDefault()}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              {option.label ?? option.value}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
