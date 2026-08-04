import type { ReactNode } from "react";

interface EditorToolbarButtonProps {
  children: ReactNode;
  label: string;
  onClick(): void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

export function EditorToolbarButton(props: EditorToolbarButtonProps) {
  const classes = [
    "toolbar-button",
    props.active ? "is-active" : "",
    props.danger ? "is-danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active || undefined}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
