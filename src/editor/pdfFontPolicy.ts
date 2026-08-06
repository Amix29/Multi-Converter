import type {
  EditorCompatibilityWarning,
  EditorDocumentV1,
  MultiConverterApi,
} from "../lib/api";

interface FontUsage {
  family: string;
  text: string;
  bold: boolean;
  italic: boolean;
}

interface FontResolution {
  replacement?: string;
  glyphFallbacks?: ReadonlyMap<string, string>;
}

const MAX_FONT_FACE_USAGES = 128;
const MAX_UNIQUE_GLYPHS_PER_FACE = 65_536;
const MAX_FALLBACK_INSPECTIONS = 128;

export interface PreparedPdfDocument {
  document: EditorDocumentV1;
  warnings: string[];
}

export async function prepareDocumentForPdf(
  api: MultiConverterApi,
  source: EditorDocumentV1,
): Promise<PreparedPdfDocument> {
  const catalog = await api.editorListSystemFonts();
  const usages = collectFontUsages(source, catalog.defaultFamily);
  const resolutions = new Map<string, FontResolution>();
  const messages: string[] = [];
  const fallbackBudget = { remaining: MAX_FALLBACK_INSPECTIONS };

  for (const usage of usages.values()) {
    const key = fontKey(usage.family, usage.bold, usage.italic);
    try {
      const policy = await inspectUsage(api, usage, usage.text);
      if (
        policy.substituted
        && policy.requestedCanEmbedPdf === true
        && policy.requestedCoversText === false
      ) {
        const fallback = await resolveGlyphFallbacks(api, usage, fallbackBudget);
        if (fallback.families.size) resolutions.set(key, { glyphFallbacks: fallback.families });
        messages.push(...fallback.warnings);
        appendUnresolvedWarning(messages, fallback.unresolved, usage.family);
      } else {
        if (policy.substituted) resolutions.set(key, { replacement: policy.resolvedFamily });
        if (policy.warning) messages.push(policy.warning);
      }
    } catch (error) {
      if (!isMissingFallbackError(error)) throw error;
      const fallback = await resolveGlyphFallbacks(api, usage, fallbackBudget);
      if (fallback.families.size) resolutions.set(key, { glyphFallbacks: fallback.families });
      messages.push(...fallback.warnings);
      appendUnresolvedWarning(messages, fallback.unresolved, usage.family);
    }
  }

  if (!resolutions.size && !messages.length) {
    return { document: source, warnings: [] };
  }

  const content = mapFonts(source.content, catalog.defaultFamily, resolutions);
  const header = source.header
    ? mapFonts(source.header, catalog.defaultFamily, resolutions)
    : null;
  const footer = source.footer
    ? mapFonts(source.footer, catalog.defaultFamily, resolutions)
    : null;
  const warnings = mergeWarnings(source.warnings, messages);

  return {
    document: { ...source, content, header, footer, warnings },
    warnings: messages,
  };
}

function collectFontUsages(document: EditorDocumentV1, defaultFamily: string) {
  const usages = new Map<string, FontUsage>();
  for (const root of [document.content, document.header, document.footer]) {
    if (root) visitTextNodes(root, defaultFamily, usages);
  }
  return usages;
}

function visitTextNodes(
  value: unknown,
  defaultFamily: string,
  usages: Map<string, FontUsage>,
) {
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (node.type === "text" && typeof node.text === "string" && node.text.length) {
    const family = textNodeFont(node) ?? defaultFamily;
    const { bold, italic } = textNodeFace(node);
    const key = fontKey(family, bold, italic);
    const current = usages.get(key);
    if (!current && usages.size >= MAX_FONT_FACE_USAGES) {
      throw new Error("EDITOR_FONT_FACE_LIMIT:Le document utilise plus de 128 variantes de police.");
    }
    usages.set(key, {
      family: current?.family ?? family,
      text: appendUniqueGlyphs(current?.text ?? "", node.text),
      bold,
      italic,
    });
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) visitTextNodes(child, defaultFamily, usages);
  }
}

function mapFonts(
  value: Record<string, unknown>,
  defaultFamily: string,
  resolutions: ReadonlyMap<string, FontResolution>,
): Record<string, unknown> {
  const node = structuredClone(value);
  return transformFontNode(node, defaultFamily, resolutions)[0] ?? node;
}

function transformFontNode(
  value: Record<string, unknown>,
  defaultFamily: string,
  resolutions: ReadonlyMap<string, FontResolution>,
): Record<string, unknown>[] {
  const node = value;
  if (node.type === "text" && typeof node.text === "string") {
    const explicit = textNodeFont(node);
    const { bold, italic } = textNodeFace(node);
    const family = explicit ?? defaultFamily;
    const resolution = resolutions.get(fontKey(family, bold, italic));
    if (resolution?.replacement) {
      setTextNodeFont(node, resolution.replacement);
    } else if (resolution?.glyphFallbacks?.size) {
      return splitTextNodeByFallback(node, family, resolution.glyphFallbacks);
    }
  }
  if (Array.isArray(node.content)) {
    node.content = node.content.flatMap((child) =>
      isRecord(child) ? transformFontNode(child, defaultFamily, resolutions) : [],
    );
  }
  return [node];
}

function splitTextNodeByFallback(
  node: Record<string, unknown>,
  originalFamily: string,
  fallbacks: ReadonlyMap<string, string>,
) {
  const output: Record<string, unknown>[] = [];
  let text = "";
  let family = originalFamily;
  const flush = () => {
    if (!text) return;
    const part = structuredClone(node);
    part.text = text;
    if (!family.localeCompare(originalFamily, undefined, { sensitivity: "accent" })) {
      // Preserve the original marks when the selected face already covers the run.
    } else {
      setTextNodeFont(part, family);
    }
    output.push(part);
    text = "";
  };
  for (const character of String(node.text ?? "")) {
    const nextFamily = fallbacks.get(character) ?? originalFamily;
    if (text && nextFamily !== family) flush();
    family = nextFamily;
    text += character;
  }
  flush();
  return output;
}

async function resolveGlyphFallbacks(
  api: MultiConverterApi,
  usage: FontUsage,
  budget: { remaining: number },
) {
  const families = new Map<string, string>();
  const warnings: string[] = [];
  const unresolved: string[] = [];
  const groups = groupGlyphs(usage.text);

  async function resolve(characters: string[]): Promise<void> {
    if (!characters.length) return;
    if (budget.remaining <= 0) {
      unresolved.push(...characters);
      return;
    }
    budget.remaining -= 1;
    try {
      const policy = await inspectUsage(api, usage, characters.join(""));
      if (policy.substituted) {
        if (
          characters.length > 1
          && policy.requestedCanEmbedPdf === true
          && policy.requestedCoversText === false
        ) {
          const middle = Math.ceil(characters.length / 2);
          await resolve(characters.slice(0, middle));
          await resolve(characters.slice(middle));
        } else {
          for (const character of characters) families.set(character, policy.resolvedFamily);
        }
      }
      if (policy.warning && !warnings.includes(policy.warning)) warnings.push(policy.warning);
    } catch (error) {
      if (!isMissingFallbackError(error)) throw error;
      if (characters.length === 1) {
        unresolved.push(characters[0]);
        return;
      }
      const middle = Math.ceil(characters.length / 2);
      await resolve(characters.slice(0, middle));
      await resolve(characters.slice(middle));
    }
  }

  for (const group of groups) await resolve(group);
  return { families, warnings, unresolved };
}

function appendUnresolvedWarning(messages: string[], unresolved: readonly string[], family: string) {
  if (!unresolved.length) return;
  messages.push(
    `La vérification bornée des polices n’a pas résolu ${unresolved.length} caractère(s) de « ${family} ». Le moteur PDF utilisera son repli système et l’export devra être vérifié.`,
  );
}

function inspectUsage(api: MultiConverterApi, usage: FontUsage, sample: string) {
  return api.editorInspectFontEmbedding(usage.family, sample, {
    bold: usage.bold,
    italic: usage.italic,
  });
}

function groupGlyphs(value: string): string[][] {
  const groups = new Map<string, string[]>();
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const bucket = code <= 0x024f
      ? "latin"
      : code >= 0x1f000
        ? "emoji"
        : code >= 0x3000 && code <= 0x9fff
          ? "cjk"
          : `unicode-${Math.floor(code / 256)}`;
    const group = groups.get(bucket) ?? [];
    group.push(character);
    groups.set(bucket, group);
  }
  return [...groups.values()];
}

function isMissingFallbackError(error: unknown) {
  return String(error).includes("EDITOR_FONT_NO_EMBEDDABLE_FALLBACK");
}

function textNodeFont(node: Record<string, unknown>): string | null {
  if (!Array.isArray(node.marks)) return null;
  for (const value of node.marks) {
    if (!value || typeof value !== "object") continue;
    const mark = value as Record<string, unknown>;
    if (mark.type !== "textStyle" || !mark.attrs || typeof mark.attrs !== "object") continue;
    const family = (mark.attrs as Record<string, unknown>).fontFamily;
    if (typeof family === "string" && family.trim()) return family.trim();
  }
  return null;
}

function setTextNodeFont(node: Record<string, unknown>, family: string) {
  const marks = Array.isArray(node.marks) ? node.marks as Array<Record<string, unknown>> : [];
  const existing = marks.find((mark) => mark?.type === "textStyle");
  if (existing) {
    existing.attrs = { ...(isRecord(existing.attrs) ? existing.attrs : {}), fontFamily: family };
  } else {
    marks.push({ type: "textStyle", attrs: { fontFamily: family } });
    node.marks = marks;
  }
}

function mergeWarnings(
  existing: EditorCompatibilityWarning[],
  messages: readonly string[],
): EditorCompatibilityWarning[] {
  const warnings = [...existing];
  for (const message of messages) {
    if (warnings.some((warning) => warning.message === message)) continue;
    warnings.push({
      code: "pdfFontSubstitution",
      message,
      blocksOverwrite: false,
    });
  }
  return warnings;
}

function appendUniqueGlyphs(existing: string, value: string) {
  const glyphs = new Set(existing);
  for (const character of value) {
    if (character.trim() === "" || /[\u0000-\u001f\u007f]/u.test(character)) continue;
    glyphs.add(character);
    if (glyphs.size > MAX_UNIQUE_GLYPHS_PER_FACE) {
      throw new Error(
        "EDITOR_FONT_GLYPH_LIMIT:Une variante de police contient plus de 65536 glyphes distincts.",
      );
    }
  }
  return [...glyphs].join("");
}

function textNodeFace(node: Record<string, unknown>) {
  const marks = Array.isArray(node.marks) ? node.marks : [];
  return {
    bold: marks.some((mark) => isRecord(mark) && mark.type === "bold"),
    italic: marks.some((mark) => isRecord(mark) && mark.type === "italic"),
  };
}

function fontKey(value: string, bold = false, italic = false) {
  return `${value.trim().toLocaleLowerCase()}\u0000${bold ? "b" : "n"}${italic ? "i" : "r"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
