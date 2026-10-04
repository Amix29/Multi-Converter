import type { CSSProperties } from "react";

export type EditorToolbarIconName =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "zoomIn"
  | "zoomOut"
  | "keyboard"
  | "reset"
  | "layerBack"
  | "layerFront"
  | "layerDown"
  | "layerUp"
  | "alignCenter"
  | "alignJustify"
  | "alignLeft"
  | "alignRight"
  | "arrowLeft"
  | "bulletList"
  | "clear"
  | "columnAfter"
  | "columnBefore"
  | "columnDelete"
  | "footer"
  | "fullscreen"
  | "fullscreenExit"
  | "header"
  | "image"
  | "link"
  | "mergeCells"
  | "numberedList"
  | "orientation"
  | "pageBreak"
  | "redo"
  | "rowAfter"
  | "rowBefore"
  | "rowDelete"
  | "search"
  | "splitCell"
  | "table"
  | "trash"
  | "undo";

interface EditorToolbarIconProps {
  name: EditorToolbarIconName;
  className?: string;
  style?: CSSProperties;
}

export function EditorToolbarIcon(props: EditorToolbarIconProps) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      className={props.className}
      style={props.style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconContent(props.name)}
    </svg>
  );
}

function iconContent(name: EditorToolbarIconName) {
  switch (name) {
    case "bold":
      return <path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z" strokeWidth="2.5" />;
    case "italic":
      return <path d="M10 4h8M6 20h8M15 4 9 20" />;
    case "underline":
      return <path d="M6 4v7a6 6 0 0 0 12 0V4M4 21h16" />;
    case "strike":
      return <path d="M17 6c-1-3-9-3-10 1-.4 1.5.5 3 3 4M7 18c2 3 10 3 10-1 0-2-2-3-4-4M3 12h18" />;
    case "zoomIn":
      return <path d="M5 12h14M12 5v14" />;
    case "zoomOut":
      return <path d="M5 12h14" />;
    case "keyboard":
      return <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8" /></>;
    case "reset":
      return <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />;
    case "layerBack":
      return <><rect x="3" y="3" width="10" height="10" /><path d="M15 7h6v14H7v-6M17 3v12m-3-3 3 3 3-3M14 18h6" /></>;
    case "layerFront":
      return <><rect x="3" y="3" width="10" height="10" /><path d="M15 7h6v14H7v-6M17 15V3m-3 3 3-3 3 3M14 1h6" /></>;
    case "layerDown":
      return <><rect x="3" y="3" width="10" height="10" /><path d="M15 7h6v14H7v-6M17 4v12m-3-3 3 3 3-3" /></>;
    case "layerUp":
      return <><rect x="3" y="3" width="10" height="10" /><path d="M15 7h6v14H7v-6M17 16V4m-3 3 3-3 3 3" /></>;
    case "undo":
      return <><path d="M9 7 5 11l4 4" /><path d="M5 11h8a5 5 0 0 1 5 5" /></>;
    case "redo":
      return <><path d="m15 7 4 4-4 4" /><path d="M19 11h-8a5 5 0 0 0-5 5" /></>;
    case "arrowLeft":
      return <><path d="m10 6-6 6 6 6" /><path d="M4 12h16" /></>;
    case "fullscreen":
      return <><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" /></>;
    case "fullscreenExit":
      return <><path d="M4 9h5V4M20 9h-5V4M15 20v-5h5M9 20v-5H4" /></>;
    case "alignLeft":
      return <><path d="M4 6h16M4 10h11M4 14h16M4 18h9" /></>;
    case "alignCenter":
      return <><path d="M4 6h16M7 10h10M4 14h16M8 18h8" /></>;
    case "alignRight":
      return <><path d="M4 6h16M9 10h11M4 14h16M11 18h9" /></>;
    case "alignJustify":
      return <><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></>;
    case "bulletList":
      return <><circle cx="5" cy="7" r="1" fill="currentColor" /><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="5" cy="17" r="1" fill="currentColor" /><path d="M9 7h11M9 12h11M9 17h11" /></>;
    case "numberedList":
      return <><path d="M4 6h2v3M4 9h3M4 13c3-2 3 2 0 3h3M10 7h10M10 12h10M10 17h10" /></>;
    case "link":
      return <><path d="m9 15 6-6" /><path d="M7 17H6a4 4 0 0 1 0-8h3M17 7h1a4 4 0 0 1 0 8h-3" /></>;
    case "image":
      return <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 2-2 5 4" /></>;
    case "table":
      return <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M9 4v16M15 4v16" /></>;
    case "pageBreak":
      return <><path d="M4 7h16M4 17h16" strokeDasharray="2 2" /><path d="M12 3v8m0 0-3-3m3 3 3-3" /></>;
    case "search":
      return <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5" /></>;
    case "orientation":
      return <><rect x="4" y="6" width="16" height="12" rx="1.5" /><path d="m8 3-2 2 2 2M16 21l2-2-2-2" /></>;
    case "header":
      return <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M5 8h14M9 5.5h6" /></>;
    case "footer":
      return <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M5 16h14M9 18.5h6" /></>;
    case "clear":
      return <><path d="m7 4 13 13-3 3H9L3 14z" /><path d="m5 12 7 7M14 6l4-4" /></>;
    case "columnBefore":
      return <><rect x="8" y="4" width="12" height="16" rx="1" /><path d="M14 4v16M4 8v8M1 12h6" /></>;
    case "columnAfter":
      return <><rect x="4" y="4" width="12" height="16" rx="1" /><path d="M10 4v16M20 8v8M17 12h6" /></>;
    case "columnDelete":
      return <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M10 4v16M14 4v16M8 12h8" /></>;
    case "rowBefore":
      return <><rect x="4" y="8" width="16" height="12" rx="1" /><path d="M4 14h16M8 4h8M12 1v6" /></>;
    case "rowAfter":
      return <><rect x="4" y="4" width="16" height="12" rx="1" /><path d="M4 10h16M8 20h8M12 17v6" /></>;
    case "rowDelete":
      return <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 10h16M4 14h16M8 12h8" /></>;
    case "mergeCells":
      return <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M8 12h8M10 9l-3 3 3 3M14 9l3 3-3 3" /></>;
    case "splitCell":
      return <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M12 5v14M9 9l-3 3 3 3M15 9l3 3-3 3" /></>;
    case "trash":
      return <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>;
  }
}
