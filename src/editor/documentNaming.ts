const placeholderTitles = new Set([
  "sans titre",
  "untitled",
  "sin título",
  "ohne titel",
  "sem título",
  "senza titolo",
]);

export function isUntitledDocument(title: string) {
  return placeholderTitles.has(title.trim().toLowerCase()) || title.trim().length === 0;
}

export function normalizedDocumentTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").slice(0, 240);
}
