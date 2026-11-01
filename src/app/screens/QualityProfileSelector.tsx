import type { QualityProfile } from "../../lib/api";
import { t, type LanguageCode } from "../../i18n";
import { ChoiceSelect } from "../components/ChoiceSelect";

export function QualityProfileSelector(props: {
  language: LanguageCode;
  value: QualityProfile;
  onChange(value: QualityProfile): void;
}) {
  return (
    <div className="quality-options">
      <ChoiceSelect label={t(props.language, "quality.title")} value={props.value}
        options={(["compact", "balanced", "high"] as const).map(value => ({value, label:t(props.language, `quality.${value}`)}))}
        onChange={(value) => {
          if (value === "compact" || value === "balanced" || value === "high") props.onChange(value);
        }} />
      <p>{t(props.language, "quality.detail")}</p>
    </div>
  );
}

export function supportsQualityProfile(format: string | null, source: string | null) {
  if (source === "pdf" && (format === "png" || format === "jpg")) return true;
  return ["jpg", "mp3", "m4a", "ogg", "wma", "opus", "ac3", "aac", "mp2",
    "mp4", "mkv", "webm", "mov", "avi", "wmv", "mts", "mpeg2", "ogv", "flv"].includes(format ?? "");
}
