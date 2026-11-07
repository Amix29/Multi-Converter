export const libreOfficeProfileId = "windows-headless-v1";

export function retainLibreOfficeFile(name) {
  if (/(^|\/)(licen[cs]e|copying|copyright|notice)[^/]*$/i.test(name)) return true;
  if (name.startsWith("help/") || name.startsWith("share/gallery/")) return false;
  if (/^share\/config\/images_[^/]+\.zip$/.test(name)) return name === "share/config/images_colibre.zip";
  const language = /^program\/resource\/([^/]+)\/LC_MESSAGES\//.exec(name)?.[1];
  return !language || language === "en-US";
}
