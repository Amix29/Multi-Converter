import type { AlternativePage } from "./alternative-data";
import type { ConversionPage } from "./conversion-data";
import type { FormatPage } from "./format-data";
import type { GuidePage } from "./guide-data";

export const downloadPath = "/download/";
export const aboutPath = "/about/";
export const privacyPath = "/privacy/";
export const legalPath = "/legal-notice/";
export const documentationPath = "/documentation/";
export const convertHubPath = "/convert/";
export const formatsHubPath = "/formats/";
export const guidesHubPath = "/guides/";
export const alternativesHubPath = "/alternatives/";

export function conversionSlug(page: ConversionPage) {
  return `${page.source.toLowerCase()}-to-${page.target.toLowerCase()}`;
}

export function conversionPath(page: ConversionPage) {
  return `${convertHubPath}${conversionSlug(page)}/`;
}

export function formatPath(page: FormatPage) {
  return `${formatsHubPath}${page.slug}/`;
}

export function guideSlug(page: GuidePage) {
  const known: Record<string, string> = {
    "convertisseur-fichiers-local": "local-file-converter",
    "conversion-fichiers-hors-ligne": "offline-file-conversion",
    "convertisseur-sans-upload": "file-converter-without-upload",
    "convertisseur-open-source-windows": "open-source-windows-file-converter",
    "convertisseur-windows-gratuit": "free-windows-file-converter",
    "local-vs-convertisseur-en-ligne": "local-vs-online-file-converter",
    "convertisseur-pdf-local": "local-pdf-converter",
    "convertisseur-audio-local": "local-audio-converter",
    "convertisseur-video-sans-upload": "video-converter-without-upload",
    "extension-maximum-quality": "maximum-quality-extension"
  };

  return known[page.slug] || page.slug;
}

export function guidePath(page: GuidePage) {
  return `${guidesHubPath}${guideSlug(page)}/`;
}

export function alternativePath(page: AlternativePage) {
  return `${alternativesHubPath}${page.slug}/`;
}
