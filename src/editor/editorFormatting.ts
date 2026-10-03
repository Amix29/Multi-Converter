export const minimumFontSizePt = 1;
export const maximumFontSizePt = 400;
export const minimumLineHeight = 0.8;
export const maximumLineHeight = 5;

export const fontSizeSuggestions = [8, 9, 10, 11, 12, 14, 16, 18, 24, 32, 48, 72] as const;
export const lineHeightSuggestions = ["auto", "1", "1.15", "1.5", "2", "2.5", "3"] as const;

export const editorThemeColorColumns = [
  ["#ffffff", "#f2f1ed", "#deddd6", "#aaa99f", "#6f706a", "#1d241f"],
  ["#fff3ec", "#fbd9c8", "#efb28f", "#d9895f", "#c46f3a", "#7d3d22"],
  ["#fff1f2", "#fecdd3", "#fda4af", "#fb7185", "#e11d48", "#881337"],
  ["#eff6ff", "#bfdbfe", "#93c5fd", "#60a5fa", "#2563eb", "#1e3a8a"],
  ["#ecfdf5", "#bbf7d0", "#86efac", "#4ade80", "#16a34a", "#14532d"],
  ["#f5f3ff", "#ddd6fe", "#c4b5fd", "#a78bfa", "#7c3aed", "#4c1d95"],
  ["#fffbeb", "#fef3c7", "#fde68a", "#facc15", "#ca8a04", "#713f12"],
] as const;

export const editorStandardColors = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#ff7a00",
  "#ffd400",
  "#38a169",
  "#00a6a6",
  "#1683e2",
  "#243c88",
  "#7b2cbf",
] as const;

export interface OrderedFontCatalog {
  defaultFont: string;
  recentFonts: string[];
  allFonts: string[];
}

export function normalizeFontSizeInput(source: string): string | null {
  return normalizeBoundedDecimal(source, minimumFontSizePt, maximumFontSizePt, "pt");
}

export function normalizeLineHeightInput(source: string): string | null {
  if (source.trim().toLowerCase() === "auto") return "auto";
  return normalizeBoundedDecimal(source, minimumLineHeight, maximumLineHeight, "");
}

export function pointSizeValue(source: unknown, fallback = 11): string {
  if (typeof source !== "string") return String(fallback);
  const match = source.trim().match(/^(\d+(?:\.\d{1,2})?)pt$/i);
  if (!match) return String(fallback);
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? String(parsed) : String(fallback);
}

export function lineHeightValue(source: unknown, fallback = "auto"): string {
  if (source === null || source === undefined || source === "normal") return fallback;
  const value = String(source).trim();
  return normalizeLineHeightInput(value) ?? fallback;
}

export function colorInputValue(source: unknown, fallback: string): string {
  return normalizedHexColor(source) ?? normalizedHexColor(fallback) ?? "#000000";
}

export function normalizedHexColor(source: unknown): string | null {
  if (typeof source !== "string") return null;
  const value = source.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
    : null;
}

export function orderedFontCatalog(
  defaultFont: string,
  recentFonts: readonly string[],
  installedFonts: readonly string[],
): OrderedFontCatalog {
  const normalizedDefault = sanitizeFontFamily(defaultFont) || "Arial";
  const installed = uniqueFontFamilies(installedFonts);
  const recent = uniqueFontFamilies(recentFonts)
    .filter((family) => family.toLocaleLowerCase() !== normalizedDefault.toLocaleLowerCase())
    .filter((family) => installed.some((candidate) => candidate.toLocaleLowerCase() === family.toLocaleLowerCase()))
    .slice(0, 3);
  return {
    defaultFont: normalizedDefault,
    recentFonts: recent,
    allFonts: installed.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })),
  };
}

export function rememberRecentFont(
  family: string,
  current: readonly string[],
  defaultFont: string,
): string[] {
  const normalized = sanitizeFontFamily(family);
  if (!normalized || normalized.toLocaleLowerCase() === defaultFont.toLocaleLowerCase()) {
    return uniqueFontFamilies(current).slice(0, 3);
  }
  return uniqueFontFamilies([normalized, ...current]).slice(0, 3);
}

export function uniqueFontFamilies(families: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const source of families) {
    const family = sanitizeFontFamily(source);
    if (!family) continue;
    const key = family.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(family);
  }
  return result;
}

function sanitizeFontFamily(source: unknown): string {
  if (typeof source !== "string") return "";
  const family = source.trim().replace(/\s+/g, " ");
  if (!family || family.length > 128 || /[\u0000-\u001f\u007f]/.test(family)) return "";
  return family;
}

function normalizeBoundedDecimal(
  source: string,
  minimum: number,
  maximum: number,
  suffix: string,
): string | null {
  const normalized = source.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  const bounded = Math.min(maximum, Math.max(minimum, parsed));
  const rounded = Math.round(bounded * 100) / 100;
  return `${rounded}${suffix}`;
}
