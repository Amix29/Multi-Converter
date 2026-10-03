import type { EditorDocumentV1 } from "../../lib/api";

const PAGE_MM = {
  a3: [297, 420],
  a4: [210, 297],
  a5: [148, 210],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
} as const;

export function pageSizeMm(page: EditorDocumentV1["page"]): [number, number] {
  const base = PAGE_MM[page.format] ?? PAGE_MM.a4;
  return page.orientation === "landscape" ? [base[1], base[0]] : [base[0], base[1]];
}

export function contentSizeMm(page: EditorDocumentV1["page"]): [number, number] {
  const [width, height] = pageSizeMm(page);
  return [
    Math.max(10, width - page.marginsMm.left - page.marginsMm.right),
    Math.max(10, height - page.marginsMm.top - page.marginsMm.bottom),
  ];
}

export function cssMeasureMm(value: unknown, reference: number, fallback: number): number {
  return parseCssMeasureMm(value, reference, fallback, 0.5, 10_000);
}

export function cssOffsetMm(value: unknown, reference: number, fallback: number): number {
  return parseCssMeasureMm(value, reference, fallback, -10_000, 10_000);
}

function parseCssMeasureMm(
  value: unknown,
  reference: number,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value === "number") return clamp(value, minimum, maximum);
  const source = String(value ?? "").trim().toLowerCase();
  if (!source || source === "auto") return fallback;
  const units: ReadonlyArray<[string, number]> = [
    ["cm", 10], ["mm", 1], ["in", 25.4], ["px", 25.4 / 96], ["pt", 25.4 / 72],
  ];
  for (const [unit, factor] of units) {
    if (!source.endsWith(unit)) continue;
    const parsed = Number(source.slice(0, -unit.length));
    return Number.isFinite(parsed) ? clamp(parsed * factor, minimum, maximum) : fallback;
  }
  if (source.endsWith("%")) {
    const parsed = Number(source.slice(0, -1));
    return Number.isFinite(parsed) ? clamp(reference * parsed / 100, minimum, maximum) : fallback;
  }
  const parsed = Number(source);
  return Number.isFinite(parsed) ? clamp(parsed, minimum, maximum) : fallback;
}

export function mmToPixels(value: number): number {
  return Math.max(1, Math.round(value * 96 / 25.4));
}

export function normalizeHex(value: unknown): string | undefined {
  const source = String(value ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(source)) return source.split("").map((part) => part + part).join("").toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(source)) return source.toUpperCase();
  return undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
