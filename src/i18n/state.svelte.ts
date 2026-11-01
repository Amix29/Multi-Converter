import { dictionaries, defaultLanguage, languageOptions, type LanguageCode } from "./index";
export function createI18n() {
  let initial: LanguageCode = defaultLanguage;
  try {
    const saved = localStorage.getItem("multi-converter-language");
    if (languageOptions.includes(saved as LanguageCode))
      initial = saved as LanguageCode;
  } catch {
    /* Optional storage. */
  }
  let language = $state(initial);
  document.documentElement.lang = initial;
  function setLanguage(value: LanguageCode) {
    if (!dictionaries[value]) return;
    language = value;
    document.documentElement.lang = value;
    try {
      localStorage.setItem("multi-converter-language", value);
    } catch {
      /* Selection remains usable. */
    }
  }
  return {
    get language() {
      return language;
    },
    setLanguage,
  };
}
