import { memo } from "react";
import brandLogoUrl from "../../assets/multi-converter-icon-brand-orange.svg";
import { t, type LanguageCode } from "../../i18n";
import { FeedbackButton } from "../feedback/FeedbackOverlays";
import type { Step } from "../types";
import { SettingsIcon } from "../components/Icons";

export const AppTopbar = memo(function AppTopbar(props: {
  step: Step;
  language: LanguageCode;
  isConverting: boolean;
  feedbackVisible: boolean;
  onFeedback(): void;
  onSettings(): void;
  onStep(step: Step): void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-title-row">
          <div className="brand-mark" aria-hidden="true">
            <img src={brandLogoUrl} alt="" />
          </div>
          <h1>Multi-Converter</h1>
        </div>
      </div>

      <nav
        className="process-strip"
        aria-label={t(props.language, "app.progress")}
      >
        {stepLabels(props.language).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`process-step ${props.step === item.id ? "is-active" : ""} ${props.step > item.id ? "is-done" : ""}`}
            disabled={item.id > props.step || props.isConverting}
            onClick={() => props.onStep(item.id)}
          >
            <span>{item.label}</span>
            <strong>{item.title}</strong>
          </button>
        ))}
      </nav>

      <div className="topbar-actions">
        <FeedbackButton
          isVisible={props.feedbackVisible}
          language={props.language}
          onOpen={props.onFeedback}
        />
        <button
          className="icon-button"
          type="button"
          aria-label={t(props.language, "app.settings")}
          title={t(props.language, "app.settings")}
          onClick={props.onSettings}
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
});

function stepLabels(
  language: LanguageCode,
): Array<{ id: Step; label: string; title: string }> {
  return [
    { id: 1, label: "01", title: t(language, "step.files") },
    { id: 2, label: "02", title: t(language, "step.format") },
    { id: 3, label: "03", title: t(language, "step.output") },
  ];
}
