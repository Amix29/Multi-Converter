import { memo, useEffect, useState } from "react";
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
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const containers = document.querySelectorAll(".screen.is-active .file-lane, .screen.is-active .rail-scroll, .screen.is-active .format-results, .screen.is-active .job-list");
      setScrolled(window.scrollY > 16 || Array.from(containers).some(element => element.scrollTop > 16));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => { cancelAnimationFrame(frame); document.removeEventListener("scroll", onScroll, true); };
  }, [props.step]);
  return (
    <header className="topbar" data-scrolled={scrolled}>
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
            aria-current={props.step === item.id ? "step" : undefined}
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
