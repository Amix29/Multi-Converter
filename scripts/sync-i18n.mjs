import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const i18nDir = join(root, "src", "i18n");
const languages = ["fr", "en", "es", "de", "pt", "it"];
const base = readDictionary("fr");
const baseKeys = Object.keys(base);

for (const language of languages.filter((item) => item !== "fr")) {
  const dictionary = readDictionary(language);
  const synced = {};

  for (const key of baseKeys) {
    synced[key] = key in dictionary ? dictionary[key] : `[TODO ${language}] ${base[key]}`;
  }

  writeDictionary(language, synced);
}

console.log(`i18n sync completed from fr.json (${baseKeys.length} keys).`);

function readDictionary(language) {
  return JSON.parse(readFileSync(join(i18nDir, `${language}.json`), "utf8"));
}

function writeDictionary(language, dictionary) {
  writeFileSync(join(i18nDir, `${language}.json`), `${JSON.stringify(dictionary, null, 2)}\n`, "utf8");
}
