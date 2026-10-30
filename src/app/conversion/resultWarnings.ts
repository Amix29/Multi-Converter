import { t, translateBackendMessage, type LanguageCode, type TranslationKey } from "../../i18n";

const keys: Record<string, TranslationKey> = {
  "integrated-text-fallback": "fidelity.textFallback",
  "single-column-table": "fidelity.singleColumn",
  "text-layout": "fidelity.textLayout",
  "media-primary-streams": "fidelity.primaryStreams",
  "image-profile-loss": "fidelity.profileLoss",
  "image-depth-loss": "fidelity.depthLoss",
  "image-exif-loss": "fidelity.exifLoss",
};

export function resultWarningText(language: LanguageCode, warning: { code: string; message: string }) {
  return keys[warning.code] ? t(language, keys[warning.code]) : translateBackendMessage(language, warning.message);
}
