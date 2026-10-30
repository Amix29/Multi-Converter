import type { MediaMode } from "../../lib/api";
import { t, type LanguageCode } from "../../i18n";

export function MediaModeSelector(props: {
  language: LanguageCode;
  value: MediaMode;
  onChange(value: MediaMode): void;
}) {
  return (
    <div className="quality-options">
      <label className="quality-selector">
        <span>{t(props.language, "media.mode")}</span>
        <select value={props.value} onChange={(event) => {
          if (event.currentTarget.value === "convert" || event.currentTarget.value === "copy") props.onChange(event.currentTarget.value);
        }}>
          <option value="convert">{t(props.language, "media.convert")}</option>
          <option value="copy">{t(props.language, "media.copy")}</option>
        </select>
      </label>
      <p>{t(props.language, props.value === "copy" ? "media.copyDetail" : "media.convertDetail")}</p>
    </div>
  );
}
