import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const i18nDir = join(root, "src", "i18n");
const languages = ["fr", "en", "es", "de", "pt", "it"];

const dictionaries = Object.fromEntries(
  languages.map((language) => [language, JSON.parse(readFileSync(join(i18nDir, `${language}.json`), "utf8"))]),
);

const base = dictionaries.fr;
const baseKeys = Object.keys(base).sort();
const errors = [];

for (const language of languages) {
  const dictionary = dictionaries[language];
  const keys = Object.keys(dictionary).sort();
  const missing = baseKeys.filter((key) => !(key in dictionary));
  const extra = keys.filter((key) => !(key in base));

  for (const key of missing) errors.push(`${language}: missing key "${key}"`);
  for (const key of extra) errors.push(`${language}: extra key "${key}"`);

  for (const key of baseKeys) {
    if (!(key in dictionary)) continue;
    const value = dictionary[key];
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`${language}: empty translation for "${key}"`);
      continue;
    }

    const expected = placeholders(base[key]);
    const actual = placeholders(value);
    for (const name of expected.filter((item) => !actual.includes(item))) {
      errors.push(`${language}: missing placeholder "{${name}}" in "${key}"`);
    }
    for (const name of actual.filter((item) => !expected.includes(item))) {
      errors.push(`${language}: extra placeholder "{${name}}" in "${key}"`);
    }
  }
}

if (errors.length) {
  console.error(`i18n validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`i18n validation passed: ${baseKeys.length} keys across ${languages.length} languages.`);

function placeholders(value) {
  return Array.from(String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g), (match) => match[1]).sort();
}
