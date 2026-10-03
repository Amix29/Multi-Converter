export type PaletteNavigationKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End";

export interface PaletteShape {
  columns: number;
  rows: number;
  order: "column-major" | "row-major";
}

export function nextPaletteIndex(
  current: number,
  key: string,
  count: number,
  shape: PaletteShape,
): number | null {
  if (count <= 0) return null;
  const bounded = Math.min(count - 1, Math.max(0, current));
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return null;

  const columns = Math.max(1, shape.columns);
  const rows = Math.max(1, shape.rows);
  const column = shape.order === "column-major" ? Math.floor(bounded / rows) : bounded % columns;
  const row = shape.order === "column-major" ? bounded % rows : Math.floor(bounded / columns);
  const nextColumn = column + (key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0);
  const nextRow = row + (key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0);
  if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) return bounded;
  const next = shape.order === "column-major"
    ? nextColumn * rows + nextRow
    : nextRow * columns + nextColumn;
  return next < count ? next : bounded;
}
