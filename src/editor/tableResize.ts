import { Extension, mergeAttributes } from "@tiptap/core";
import { TableRow } from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import { t, type LanguageCode } from "../i18n";

const tableResizeKey = new PluginKey("multiConverterTableResize");
const MINIMUM_ROW_HEIGHT = 24;
const MINIMUM_COLUMN_WIDTH = 36;
export const MAXIMUM_TABLE_SIZE = 4_096;

export const ResizableTableRow = TableRow.extend({
  addAttributes() {
    return {
      height: {
        default: null,
        parseHTML: (element) => safeSize(element.getAttribute("data-row-height") || element.style.height, null),
        renderHTML: (attributes) => attributes.height
          ? { "data-row-height": attributes.height, style: `height: ${safeSize(attributes.height, MINIMUM_ROW_HEIGHT)}px` }
          : {},
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["tr", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
});

export const TableResizeHandles = Extension.create({
  name: "tableResizeHandles",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: tableResizeKey,
      view: (view) => new TableResizeHandleView(view),
    })];
  },
});

class TableResizeHandleView {
  private view: EditorView;
  private rowHandle = makeHandle("row");
  private columnHandle = makeHandle("column");
  private reposition = () => this.update(this.view);

  constructor(view: EditorView) {
    this.view = view;
    document.body.append(this.rowHandle, this.columnHandle);
    this.rowHandle.addEventListener("pointerdown", (event) => this.beginResize("row", event));
    this.columnHandle.addEventListener("pointerdown", (event) => this.beginResize("column", event));
    this.rowHandle.addEventListener("keydown", (event) => this.resizeWithKeyboard("row", event));
    this.columnHandle.addEventListener("keydown", (event) => this.resizeWithKeyboard("column", event));
    window.addEventListener("resize", this.reposition);
    window.addEventListener("scroll", this.reposition, true);
    this.update(view);
  }

  update(view: EditorView) {
    this.view = view;
    updateHandleLabel(this.rowHandle, "row");
    updateHandleLabel(this.columnHandle, "column");
    const context = currentTableContext(view.state);
    const dom = context ? cellDom(view, context.cellPos) : null;
    if (!context || !dom) {
      this.hide();
      return;
    }
    const cellRect = dom.getBoundingClientRect();
    const rowRect = dom.parentElement?.getBoundingClientRect() ?? cellRect;
    positionHandle(this.rowHandle, rowRect.left + rowRect.width / 2 - 28, rowRect.bottom - 8, 56, 16);
    positionHandle(this.columnHandle, cellRect.right - 8, cellRect.top + cellRect.height / 2 - 28, 16, 56);
  }

  destroy() {
    window.removeEventListener("resize", this.reposition);
    window.removeEventListener("scroll", this.reposition, true);
    this.rowHandle.remove();
    this.columnHandle.remove();
  }

  private hide() {
    this.rowHandle.hidden = true;
    this.columnHandle.hidden = true;
  }

  private beginResize(axis: "row" | "column", event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const context = currentTableContext(this.view.state);
    const cell = context ? cellDom(this.view, context.cellPos) : null;
    if (!context || !cell) return;
    const zoom = editorZoom(cell);
    const start = axis === "row"
      ? (cell.parentElement?.getBoundingClientRect().height ?? MINIMUM_ROW_HEIGHT) / zoom
      : cell.getBoundingClientRect().width / zoom;
    const origin = axis === "row" ? event.clientY : event.clientX;
    const move = (next: PointerEvent) => {
      this.apply(axis, pointerResizeValue(axis, start, origin, next.clientX, next.clientY, zoom));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      this.view.focus();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  }

  private resizeWithKeyboard(axis: "row" | "column", event: KeyboardEvent) {
    const delta = tableResizeKeyboardDelta(axis, event.key, event.shiftKey);
    if (delta === null) return;
    event.preventDefault();
    const context = currentTableContext(this.view.state);
    const cell = context ? cellDom(this.view, context.cellPos) : null;
    if (!context || !cell) return;
    const zoom = editorZoom(cell);
    const current = axis === "row"
      ? (cell.parentElement?.getBoundingClientRect().height ?? MINIMUM_ROW_HEIGHT) / zoom
      : cell.getBoundingClientRect().width / zoom;
    this.apply(axis, current + delta);
  }

  private apply(axis: "row" | "column", value: number) {
    const context = currentTableContext(this.view.state);
    if (!context) return;
    const minimum = axis === "row" ? MINIMUM_ROW_HEIGHT : MINIMUM_COLUMN_WIDTH;
    const size = safeSize(value, minimum) as number;
    const tr = this.view.state.tr;
    if (axis === "row") setRowHeight(tr, context.rowPos, size);
    else setColumnWidth(tr, context, size);
    this.view.dispatch(tr);
  }
}

interface TableContext {
  table: ProseMirrorNode;
  tableStart: number;
  rowPos: number;
  cellPos: number;
  column: number;
}

function currentTableContext(state: EditorState): TableContext | null {
  const { $from } = state.selection;
  let tableDepth = -1;
  let rowDepth = -1;
  let cellDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const role = $from.node(depth).type.spec.tableRole;
    if (cellDepth < 0 && (role === "cell" || role === "header_cell")) cellDepth = depth;
    else if (rowDepth < 0 && role === "row") rowDepth = depth;
    else if (tableDepth < 0 && role === "table") tableDepth = depth;
  }
  if (tableDepth < 0 || rowDepth < 0 || cellDepth < 0) return null;
  const table = $from.node(tableDepth);
  const tableStart = $from.start(tableDepth);
  const cellPos = $from.before(cellDepth);
  const cellOffset = cellPos - tableStart;
  const rect = TableMap.get(table).findCell(cellOffset);
  return { table, tableStart, rowPos: $from.before(rowDepth), cellPos, column: rect.left };
}

function setRowHeight(tr: Transaction, position: number, height: number) {
  const row = tr.doc.nodeAt(position);
  if (row?.type.spec.tableRole === "row") tr.setNodeMarkup(position, undefined, { ...row.attrs, height });
}

function setColumnWidth(tr: Transaction, context: TableContext, width: number) {
  const map = TableMap.get(context.table);
  const seen = new Set<number>();
  for (let row = 0; row < map.height; row += 1) {
    const offset = map.positionAt(row, context.column, context.table);
    if (seen.has(offset)) continue;
    seen.add(offset);
    const cell = context.table.nodeAt(offset);
    if (!cell) continue;
    const rect = map.findCell(offset);
    const index = Math.max(0, context.column - rect.left);
    const colwidth = Array.isArray(cell.attrs.colwidth)
      ? [...cell.attrs.colwidth]
      : Array.from({ length: Number(cell.attrs.colspan) || 1 }, () => 0);
    colwidth[index] = width;
    tr.setNodeMarkup(context.tableStart + offset, undefined, { ...cell.attrs, colwidth });
  }
}

function cellDom(view: EditorView, cellPos: number): HTMLElement | null {
  const dom = view.nodeDOM(cellPos);
  return dom instanceof HTMLElement ? dom : null;
}

function makeHandle(axis: "row" | "column") {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = `table-dimension-handle is-${axis}`;
  handle.contentEditable = "false";
  handle.dataset.axis = axis;
  updateHandleLabel(handle, axis);
  return handle;
}

export function tableResizeLabel(axis: "row" | "column", language: LanguageCode) {
  return t(language, axis === "row" ? "editor.resizeTableRow" : "editor.resizeTableColumn");
}

export function tableResizeKeyboardDelta(
  axis: "row" | "column",
  key: string,
  accelerated: boolean,
) {
  const decrease = axis === "row" ? key === "ArrowUp" : key === "ArrowLeft";
  const increase = axis === "row" ? key === "ArrowDown" : key === "ArrowRight";
  if (!decrease && !increase) return null;
  return (increase ? 1 : -1) * (accelerated ? 10 : 2);
}

export function pointerResizeValue(
  axis: "row" | "column",
  start: number,
  origin: number,
  clientX: number,
  clientY: number,
  zoom = 1,
) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return start + ((axis === "row" ? clientY : clientX) - origin) / safeZoom;
}

function updateHandleLabel(handle: HTMLButtonElement, axis: "row" | "column") {
  const label = tableResizeLabel(axis, editorLanguage());
  handle.setAttribute("aria-label", label);
  handle.title = label;
}

function editorLanguage(): LanguageCode {
  const language = document.documentElement.lang;
  return (["fr", "en", "es", "de", "pt", "it"] as const).includes(language as LanguageCode)
    ? language as LanguageCode
    : "fr";
}

function editorZoom(element: Element) {
  const target = element.closest(".editor-page-scale") || element;
  const zoom = Number.parseFloat(getComputedStyle(target).getPropertyValue("--editor-zoom"));
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function positionHandle(handle: HTMLButtonElement, left: number, top: number, width: number, height: number) {
  handle.hidden = false;
  handle.style.left = `${left}px`;
  handle.style.top = `${top}px`;
  handle.style.width = `${width}px`;
  handle.style.height = `${height}px`;
}

function safeSize(value: unknown, fallback: number | null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const minimum = fallback ?? 1;
  return Math.min(MAXIMUM_TABLE_SIZE, Math.max(minimum, parsed));
}
