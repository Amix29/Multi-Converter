export const minimumFontSizePt = 6;
export const maximumFontSizePt = 288;

export const fontSizeSuggestions = [
  8,
  9,
  10,
  11,
  12,
  14,
  16,
  18,
  24,
  32,
  48,
  72,
];

export const editorFontFamilies = [
  // The first three families are bundled locally; remaining entries use local system fonts.
  "Source Sans 3",
  "Atkinson Hyperlegible Next",
  "JetBrains Mono",
  "Arial",
  "Segoe UI",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Garamond",
  "Courier New",
  "Consolas",
  "DejaVu Sans",
  "DejaVu Serif",
  "IBM Plex Sans",
  "Liberation Sans",
  "Liberation Serif",
  "Noto Sans",
  "Noto Serif",
  "system-ui",
  "sans-serif",
  "serif",
  "monospace",
] as const;

export function normalizeFontSizeInput(source: string): string | null {
  const normalized = source.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  const bounded = Math.min(maximumFontSizePt, Math.max(minimumFontSizePt, parsed));
  const rounded = Math.round(bounded * 100) / 100;
  return `${rounded}pt`;
}

export function pointSizeValue(source: unknown, fallback = 11): string {
  if (typeof source !== "string") return String(fallback);
  const match = source.trim().match(/^(\d+(?:\.\d{1,2})?)pt$/i);
  if (!match) return String(fallback);
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? String(parsed) : String(fallback);
}

export function colorInputValue(source: unknown, fallback: string): string {
  return typeof source === "string" && /^#[0-9a-f]{6}$/i.test(source)
    ? source
    : fallback;
}
