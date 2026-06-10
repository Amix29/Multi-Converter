import type { LanguageCode } from "../i18n";

const releaseNotesTranslationTimeoutMs = 12000;
const releaseNotesTranslationChunkSize = 1800;
const googleTranslateEndpoint = "https://translate.googleapis.com/translate_a/single";

const releaseNoteLanguageAliases: Record<LanguageCode, string[]> = {
  en: ["en", "english"],
  fr: ["fr", "french", "français", "francais"],
  es: ["es", "spanish", "español", "espanol"],
  de: ["de", "german", "deutsch"],
  pt: ["pt", "portuguese", "português", "portugues"],
  it: ["it", "italian", "italiano"],
};

const onlineTranslationTargets: Partial<Record<LanguageCode, string>> = {
  fr: "fr",
  es: "es",
  de: "de",
  it: "it",
  pt: "pt",
};

export function releaseNotesForLanguage(body: string, language: LanguageCode) {
  const normalized = normalizeReleaseNotes(body);
  if (!normalized) return normalized;

  const localized = findReleaseNotesBlock(normalized, language);
  if (localized) return localized;

  const english = findReleaseNotesBlock(normalized, "en");
  return english ?? normalized;
}

export async function translateReleaseNotesForLanguage(body: string, language: LanguageCode) {
  const normalized = normalizeReleaseNotes(body);
  if (!normalized) return normalized;

  const localized = findReleaseNotesBlock(normalized, language);
  if (localized) return localized;

  const source = findReleaseNotesBlock(normalized, "en") ?? normalized;
  if (language === "en") return source;

  const translated = await translateReleaseNotesOnline(source, language);
  return translated?.trim() || source;
}

function normalizeReleaseNotes(body: string) {
  return body.replace(/\r\n/g, "\n").trim();
}

function findReleaseNotesBlock(body: string, language: LanguageCode) {
  for (const alias of releaseNoteLanguageAliases[language]) {
    const match = body.match(releaseNoteBlockPattern(escapeRegExp(alias)));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function releaseNoteBlockPattern(language: string) {
  return new RegExp(
    `<!--\\s*(?:mc|multi-converter)-release-notes:${language}\\s*-->([\\s\\S]*?)<!--\\s*/(?:mc|multi-converter)-release-notes\\s*-->`,
    "i",
  );
}

async function translateReleaseNotesOnline(body: string, language: LanguageCode) {
  const targetLanguage = onlineTranslationTargets[language];
  if (!targetLanguage) return null;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), releaseNotesTranslationTimeoutMs);
  try {
    const chunks = chunkReleaseNotes(body, releaseNotesTranslationChunkSize);
    const translatedChunks: string[] = [];
    for (const chunk of chunks) {
      translatedChunks.push(await translateReleaseNotesChunk(chunk, targetLanguage, controller.signal));
    }
    return translatedChunks.join("\n").trim();
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function translateReleaseNotesChunk(chunk: string, targetLanguage: string, signal: AbortSignal) {
  const body = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: targetLanguage,
    dt: "t",
    q: chunk,
  });
  const response = await fetch(googleTranslateEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("release-note-translation-failed");

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("release-note-translation-invalid");

  return data[0]
    .map((item) => (Array.isArray(item) && typeof item[0] === "string" ? item[0] : ""))
    .join("");
}

function chunkReleaseNotes(body: string, maxLength: number) {
  const chunks: string[] = [];
  let current = "";
  for (const line of body.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
