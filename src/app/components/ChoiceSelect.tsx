import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

interface ChoiceOption { value: string; label: string }

export function ChoiceSelect(props: {
  label: string;
  value: string;
  options: readonly ChoiceOption[];
  onChange(value: string): void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const [active, setActive] = useState(0);
  const [keyboard, setKeyboard] = useState(false);
  const search = useRef({ text: "", time: 0 });
  const selected = Math.max(0, props.options.findIndex(option => option.value === props.value));

  function open(fromKeyboard = false) {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setKeyboard(fromKeyboard);
    const below = window.innerHeight - rect.bottom - 12;
    const height = Math.min(260, props.options.length * 48 + 16);
    const upwards = below < height && rect.top > below;
    const maxHeight = Math.min(height, Math.max(80, upwards ? rect.top - 12 : below));
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24);
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: upwards ? rect.top - maxHeight - 6 : rect.bottom + 6, width, maxHeight });
    setActive(selected);
  }
  function choose(index: number) {
    props.onChange(props.options[index].value);
    setPosition(null);
  }
  useEffect(() => {
    if (!position) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popup.current?.contains(event.target)) setPosition(null);
    };
    const close = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      setPosition(null);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);
  useEffect(() => { popup.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, position]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") { setPosition(null); return; }
    if (event.key === "Escape" && position) {
      event.preventDefault(); event.stopPropagation(); setPosition(null); return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (!position) { open(true); return; }
      if (event.key === "Enter" || event.key === " ") { choose(active); return; }
      setActive(index => event.key === "Home" ? 0 : event.key === "End" ? props.options.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + props.options.length) % props.options.length);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current.text = now - search.current.time > 600 ? event.key : search.current.text + event.key;
      search.current.time = now;
      const index = props.options.findIndex(option => option.label.toLocaleLowerCase().startsWith(search.current.text.toLocaleLowerCase()));
      if (!position) open(true);
      if (index >= 0) setActive(index);
    }
  }
  return <div className="choice-select">
    <span id={`${id}-label`} className="choice-label">{props.label}</span>
    <button ref={trigger} className="choice-trigger" type="button" role="combobox"
      aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={Boolean(position)}
      aria-controls={position ? `${id}-list` : undefined} aria-activedescendant={position ? `${id}-${active}` : undefined}
      onClick={() => position ? setPosition(null) : open()} onKeyDown={onKeyDown} onBlur={() => setPosition(null)}>
      <span id={`${id}-value`}>{props.options[selected]?.label}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    {position && createPortal(<div ref={popup} id={`${id}-list`} className="choice-menu" role="listbox"
      aria-labelledby={`${id}-label`} data-keyboard={keyboard} style={position}>
      {props.options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
        aria-selected={props.value === option.value} data-index={index} data-active={index === active}
        onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
        <span>{option.label}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      </div>)}
    </div>, document.body)}
  </div>;
}
