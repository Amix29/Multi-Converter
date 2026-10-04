import type { CSSProperties } from "react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowLeft, Bold, Italic, Underline,
  Strikethrough, Plus, Minus, Keyboard, RotateCcw, BringToFront, SendToBack,
  ArrowDown, ArrowUp, Undo2, Redo2, Maximize, Minimize, List, ListOrdered,
  Link, Image, Table, Search, RectangleHorizontal, PanelTop, PanelBottom,
  RemoveFormatting, BetweenVerticalStart, BetweenVerticalEnd, BetweenHorizontalStart,
  BetweenHorizontalEnd, TableColumnsSplit, TableRowsSplit, TableCellsMerge,
  TableCellsSplit, Trash2, Pilcrow, ListChevronsUpDown,
} from "lucide-react";

// Lucide (ISC), including Feather-derived icons (MIT). License is shipped locally.
const icons = {
  bold: Bold, italic: Italic, underline: Underline, strike: Strikethrough,
  zoomIn: Plus, zoomOut: Minus, keyboard: Keyboard, reset: RotateCcw,
  layerBack: SendToBack, layerFront: BringToFront, layerDown: ArrowDown, layerUp: ArrowUp,
  undo: Undo2, redo: Redo2, arrowLeft: ArrowLeft, fullscreen: Maximize, fullscreenExit: Minimize,
  alignLeft: AlignLeft, alignCenter: AlignCenter, alignRight: AlignRight, alignJustify: AlignJustify,
  bulletList: List, numberedList: ListOrdered, link: Link, image: Image, table: Table,
  pageBreak: PageBreakIcon, search: Search, orientation: RectangleHorizontal, header: PanelTop,
  footer: PanelBottom, clear: RemoveFormatting, columnBefore: BetweenVerticalStart,
  columnAfter: BetweenVerticalEnd, columnDelete: TableColumnsSplit, rowBefore: BetweenHorizontalStart,
  rowAfter: BetweenHorizontalEnd, rowDelete: TableRowsSplit, mergeCells: TableCellsMerge,
  splitCell: TableCellsSplit, trash: Trash2, pilcrow: Pilcrow, lineHeight: ListChevronsUpDown,
} as const;

function PageBreakIcon(props: { size?: number; strokeWidth?: number; className?: string; style?: CSSProperties }) {
  return <svg aria-hidden="true" focusable="false" width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={props.className} style={props.style}>
    <path d="M5 8V3h14v5M5 16v5h14v-5M12 7v8m-3-3 3 3 3-3" />
    <path d="M2 12h4m12 0h4" strokeDasharray="2 2" />
  </svg>;
}

export type EditorToolbarIconName = keyof typeof icons;

export function EditorToolbarIcon(props: { name: EditorToolbarIconName; className?: string; style?: CSSProperties }) {
  const Icon = icons[props.name];
  return <Icon aria-hidden="true" focusable="false" size={20} strokeWidth={2} className={props.className} style={props.style} />;
}
