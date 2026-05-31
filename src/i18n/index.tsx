import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import it from "./it.json";
import pt from "./pt.json";

export type LanguageCode = "fr" | "en" | "es" | "de" | "pt" | "it";
export type PerformanceMode = "energySaver" | "balanced" | "highPerformance";
export type TranslationKey = keyof typeof fr;
type TranslationParams = Record<string, string | number>;
type TranslationDictionary = Record<TranslationKey, string>;

export const defaultLanguage: LanguageCode = "fr";
export const defaultPerformanceMode: PerformanceMode = "balanced";

export const languageOptions: LanguageCode[] = ["fr", "en", "es", "de", "pt", "it"];
export const performanceModes: PerformanceMode[] = ["energySaver", "balanced", "highPerformance"];

export const dictionaries: Record<LanguageCode, TranslationDictionary> = { fr, en, es, de, pt, it };

interface I18nContextValue {
  language: LanguageCode;
  setLanguage(language: LanguageCode): void;
  t(key: TranslationKey, params?: TranslationParams): string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider(props: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => readStoredLanguage());

  const value = useMemo<I18nContextValue>(() => {
    function setLanguage(nextLanguage: LanguageCode) {
      document.documentElement.lang = nextLanguage;
      localStorage.setItem("multi-converter-language", nextLanguage);
      setLanguageState(nextLanguage);
    }

    return {
      language,
      setLanguage,
      t: (key, params) => t(language, key, params),
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function t(language: LanguageCode, key: TranslationKey, params: TranslationParams = {}) {
  const value = dictionaries[language][key] ?? dictionaries.fr[key] ?? key;
  return Object.entries(params).reduce((text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)), value);
}

export function pluralKey(baseKey: string, count: number): TranslationKey {
  return `${baseKey}.${count === 1 ? "one" : "other"}` as TranslationKey;
}

const categoryKeyByValue: Record<string, TranslationKey> = {
  documents: "category.documents",
  text: "category.documents",
  "texte & documents": "category.documents",
  "text & documents": "category.documents",
  "texto y documentos": "category.documents",
  images: "category.images",
  image: "category.images",
  video: "category.video",
  "vidéo": "category.video",
  audio: "category.audio",
  office: "category.office",
  "tableurs & présentations": "category.office",
  archives: "category.archives",
  "archives & compression": "category.archives",
  fonts: "category.fonts",
  polices: "category.fonts",
  databases: "category.databases",
  "bases de données": "category.databases",
  cad: "category.cad",
  "cao / dessin technique": "category.cad",
  models3d: "category.models3d",
  "modèles 3d": "category.models3d",
  subtitles: "category.subtitles",
  "sous-titres": "category.subtitles",
  unknown: "category.unknown",
  inconnu: "category.unknown",
};

const phaseKeyByValue: Record<string, TranslationKey> = {
  analyse: "progressPhase.mediaAnalysis",
  préparation: "progressPhase.preparation",
  "analyse du média": "progressPhase.mediaAnalysis",
  "conversion audio": "progressPhase.audioConversion",
  "conversion vidéo": "progressPhase.videoConversion",
  finalisation: "progressPhase.finalization",
  "lecture de l'image": "progressPhase.imageReading",
  "encodage de l'image": "progressPhase.imageEncoding",
  "extraction du texte pdf": "progressPhase.pdfTextExtraction",
  "conversion texte": "progressPhase.textConversion",
  "composition du pdf": "progressPhase.pdfComposition",
  "finalisation du pdf": "progressPhase.pdfFinalization",
  "lecture des sous-titres": "progressPhase.subtitleReading",
  "ecriture des sous-titres": "progressPhase.subtitleWriting",
  "écriture des sous-titres": "progressPhase.subtitleWriting",
  terminé: "phase.done",
  annulation: "phase.canceling",
  annulé: "phase.canceled",
  "conversion annulée.": "phase.canceled",
  conversion: "phase.conversion",
  "en attente": "phase.waiting",
  démarrage: "phase.starting",
};

export function languageLabel(language: LanguageCode, option: LanguageCode) {
  return t(language, `language.${option}` as TranslationKey);
}

export function translateCategory(language: LanguageCode, categoryIdOrLabel?: string | null) {
  const normalized = normalizeText(categoryIdOrLabel);
  const key = normalized ? categoryKeyByValue[normalized] : "category.unknown";
  return key ? t(language, key) : categoryIdOrLabel || t(language, "category.unknown");
}

export function translatePhase(language: LanguageCode, phase?: string | null) {
  if (!phase) return t(language, "phase.conversion");
  const key = phaseKeyByValue[normalizeText(phase)];
  return key ? t(language, key) : phase;
}

export function translateBackendMessage(language: LanguageCode, message: string) {
  const value = message.trim();
  if (!value) return value;
  if (value in dictionaries[language]) return t(language, value as TranslationKey);

  if (
    value.includes("Fichier de sortie introuvable") ||
    value.includes("Impossible d'exporter ce fichier") ||
    value.includes("os error 2")
  ) {
    return t(language, "notice.exportUnavailable");
  }

  if (value === dictionaries.fr["error.invalidConversion"]) return t(language, "error.invalidConversion");
  if (value === dictionaries.fr["error.ffmpegGeneric"]) return t(language, "error.ffmpegGeneric");

  const extension = value.match(/^Format \.([^ ]+) non reconnu\.$/);
  if (extension) return t(language, "error.unrecognizedExtension", { format: extension[1] });

  const format = value.match(/^Format ([^ ]+) non reconnu\.$/);
  if (format) return t(language, "error.unrecognizedFormat", { format: format[1] });

  const unsupportedAudio = value.match(/^Format audio (.+) non supporté par le moteur intégré\.$/);
  if (unsupportedAudio) return t(language, "error.unsupportedAudioFormat", { format: unsupportedAudio[1] });

  const unsupportedVideo = value.match(/^Format vidéo (.+) non supporté par le moteur intégré\.$/);
  if (unsupportedVideo) return t(language, "error.unsupportedVideoFormat", { format: unsupportedVideo[1] });

  const unsupportedImage = value.match(/^Format image (.+) non supporté par le moteur intégré\.$/);
  if (unsupportedImage) return t(language, "error.unsupportedImageFormat", { format: unsupportedImage[1] });

  const unsupportedSubtitle = value.match(/^Format de sous-titres (.+) non supporté par le moteur intégré\.$/);
  if (unsupportedSubtitle) return t(language, "error.unsupportedSubtitleFormat", { format: unsupportedSubtitle[1] });

  const unsupportedText = value.match(/^Conversion texte vers (.+) non supportée\.$/);
  if (unsupportedText) return t(language, "error.unsupportedTextConversion", { format: unsupportedText[1] });

  const faithfulRequired = value.match(/^Conversion fidèle impossible pour (.+) -> (.+)\. (.+) Installez au moins un de ces moteurs : (.+)\.$/);
  if (faithfulRequired) {
    return t(language, "error.externalRequired", { source: faithfulRequired[1], target: faithfulRequired[2], reason: faithfulRequired[3], plan: faithfulRequired[4] });
  }

  const externalRequired = value.match(/^La conversion (.+) -> (.+) nécessite un moteur externe spécialisé non disponible\. Plan prévu : (.+)\.$/);
  if (externalRequired) {
    return t(language, "error.externalRequired", { source: externalRequired[1], target: externalRequired[2], reason: "", plan: externalRequired[3] });
  }

  const unavailableTool = value.match(/^(.+) n'est pas disponible sur cette machine\.$/);
  if (unavailableTool) return t(language, "error.toolUnavailable", { tool: unavailableTool[1] });

  const failedTool = value.match(/^(.+) a échoué\.$/);
  if (failedTool) return t(language, "error.toolFailed", { tool: failedTool[1] });

  return translatePhase(language, value);
}

export function performanceLabelKey(mode: PerformanceMode): TranslationKey {
  return `performance.${mode}.label` as TranslationKey;
}

export function performanceDetailKey(mode: PerformanceMode): TranslationKey {
  return `performance.${mode}.detail` as TranslationKey;
}

function readStoredLanguage(): LanguageCode {
  const value = localStorage.getItem("multi-converter-language");
  const language = languageOptions.includes(value as LanguageCode) ? (value as LanguageCode) : defaultLanguage;
  document.documentElement.lang = language;
  return language;
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}
