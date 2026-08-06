import type { FileItem, Status } from "../types";
import type { ImportOriginV1 } from "../../lib/api";
import { hasAvailableTargets } from "./model";

export type OutputFilter = "all" | "running" | "done" | "errors";

export interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
}

export interface VirtualGridWindow extends VirtualWindow {
  columnCount: number;
  startItemIndex: number;
  endItemIndex: number;
}

export const MAX_CONVERTER_FILES = 2_000;

const runningStatuses = new Set<Status>(["queued", "working", "canceling"]);

export function stablePartitionBySupport(files: FileItem[]) {
  const supported: FileItem[] = [];
  const unsupported: FileItem[] = [];

  for (const file of files) {
    (hasAvailableTargets(file) ? supported : unsupported).push(file);
  }

  return [...supported, ...unsupported];
}

export function withoutUnsupportedFiles(files: FileItem[]) {
  return files.filter(hasAvailableTargets);
}

export function filterOutputFiles(files: FileItem[], filter: OutputFilter) {
  if (filter === "all") return files;
  if (filter === "running") return files.filter((file) => runningStatuses.has(file.status));
  if (filter === "done") return files.filter((file) => file.status === "done");
  return files.filter((file) => file.status === "error");
}

export function calculateVirtualWindow(options: {
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan?: number;
}): VirtualWindow {
  const itemCount = Math.max(0, Math.floor(options.itemCount));
  const rowHeight = Math.max(1, options.rowHeight);
  const overscan = Math.max(0, Math.floor(options.overscan ?? 4));
  const viewportHeight = Math.max(rowHeight, options.viewportHeight || rowHeight * 6);
  const maxScrollTop = Math.max(0, itemCount * rowHeight - viewportHeight);
  const scrollTop = Math.min(Math.max(0, options.scrollTop || 0), maxScrollTop);
  const firstVisible = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(itemCount, firstVisible + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * rowHeight,
    totalHeight: itemCount * rowHeight,
  };
}

export function calculateVirtualGridWindow(options: {
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
  viewportWidth: number;
  rowHeight: number;
  minimumColumnWidth: number;
  gap: number;
  overscan?: number;
}): VirtualGridWindow {
  const usableWidth = Math.max(options.minimumColumnWidth, options.viewportWidth || options.minimumColumnWidth);
  const columnCount = Math.max(
    1,
    Math.floor((usableWidth + options.gap) / (options.minimumColumnWidth + options.gap)),
  );
  const rowCount = Math.ceil(Math.max(0, options.itemCount) / columnCount);
  const window = calculateVirtualWindow({
    itemCount: rowCount,
    scrollTop: options.scrollTop,
    viewportHeight: options.viewportHeight,
    rowHeight: options.rowHeight,
    overscan: options.overscan,
  });
  return {
    ...window,
    columnCount,
    startItemIndex: window.startIndex * columnCount,
    endItemIndex: Math.min(options.itemCount, window.endIndex * columnCount),
  };
}

export function selectUniqueImports<T extends { path: string }>(
  existing: T[],
  incoming: T[],
  limit = MAX_CONVERTER_FILES,
) {
  const knownPaths = new Set(existing.map((file) => file.path));
  const accepted: T[] = [];
  let rejected = 0;
  for (const file of incoming) {
    if (!file || knownPaths.has(file.path)) continue;
    knownPaths.add(file.path);
    if (existing.length + accepted.length >= limit) {
      rejected += 1;
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export function preferredImportOrigin(
  current: ImportOriginV1 | null | undefined,
  candidate: ImportOriginV1 | null | undefined,
) {
  if (!current) return candidate ?? null;
  if (!candidate) return current;
  if (current.kind !== candidate.kind) return candidate.kind === "folder" ? candidate : current;
  if (current.kind === "file") return current;
  const currentDepth = current.relativePath.split("/").filter(Boolean).length;
  const candidateDepth = candidate.relativePath.split("/").filter(Boolean).length;
  if (candidateDepth !== currentDepth) return candidateDepth > currentDepth ? candidate : current;
  const candidateKey = `${candidate.rootName.toLocaleLowerCase()}\0${candidate.relativePath.toLocaleLowerCase()}`;
  const currentKey = `${current.rootName.toLocaleLowerCase()}\0${current.relativePath.toLocaleLowerCase()}`;
  return candidateKey < currentKey ? candidate : current;
}

export function applyProgressBatch(
  files: FileItem[],
  updates: Iterable<{ jobId: string; progress: number; phase: string }>,
) {
  const indexByJobId = new Map(files.map((file, index) => [file.jobId, index]));
  let next = files;
  for (const update of updates) {
    const index = indexByJobId.get(update.jobId);
    if (index === undefined) continue;
    const current = next[index];
    const progress = Math.max(current.progress, Math.min(100, Math.max(0, update.progress)));
    const phase = update.phase || "phase.conversion";
    if (current.progress === progress && current.phase === phase) continue;
    if (next === files) next = [...files];
    next[index] = { ...current, progress, phase };
  }
  return next;
}
