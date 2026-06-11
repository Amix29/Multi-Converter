const releaseNotesRelativeUrlBase = "https://github.com/Amix29/Multi-Converter";

export function safeReleaseNoteHref(href: string) {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return trimmed;

  try {
    const url = new URL(trimmed, releaseNotesRelativeUrlBase);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return url.toString();
  } catch {
    return null;
  }

  return null;
}

export function safeMarkdownClassName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}
