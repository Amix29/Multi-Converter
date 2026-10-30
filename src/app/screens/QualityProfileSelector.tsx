import type { QualityProfile } from "../../lib/api";
import { t, type LanguageCode } from "../../i18n";

export function QualityProfileSelector(props: {
  language: LanguageCode;
  value: QualityProfile;
  onChange(value: QualityProfile): void;
}) {
  return (
    <div className="quality-options">
      <label className="quality-selector">
        <span>{t(props.language, "quality.title")}</span>
        <select value={props.value} onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "compact" || value === "balanced" || value === "high") props.onChange(value);
        }}>
          <option value="compact">{t(props.language, "quality.compact")}</option>
          <option value="balanced">{t(props.language, "quality.balanced")}</option>
          <option value="high">{t(props.language, "quality.high")}</option>
        </select>
      </label>
      <p>{t(props.language, "quality.detail")}</p>
    </div>
  );
}

export function supportsQualityProfile(format: string | null, source: string | null) {
  if (source === "pdf" && (format === "png" || format === "jpg")) return true;
  return ["jpg", "mp3", "m4a", "ogg", "wma", "opus", "ac3", "aac", "mp2",
    "mp4", "mkv", "webm", "mov", "avi", "wmv", "mts", "mpeg2", "ogv", "flv"].includes(format ?? "");
}
