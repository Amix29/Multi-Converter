export function supportsQualityProfile(format: string | null, source: string | null) {
  if (source === "pdf" && (format === "png" || format === "jpg")) return true;
  return ["jpg", "mp3", "m4a", "ogg", "wma", "opus", "ac3", "aac", "mp2",
    "mp4", "mkv", "webm", "mov", "avi", "wmv", "mts", "mpeg2", "ogv", "flv"].includes(format ?? "");
}
