import { useRef } from "react";
import type { AppMode } from "../../lib/api";
import brandLogoUrl from "../../assets/multi-converter-icon-brand-orange.svg";
import { t, type LanguageCode } from "../../i18n";
import { FeedbackButton } from "../feedback/FeedbackOverlays";
import type { Step } from "../types";
import { DocumentModeIcon, SettingsIcon } from "../components/Icons";

export function AppTopbar(props: {
  appMode: AppMode;
  step: Step;
  language: LanguageCode;
  isConverting: boolean;
  feedbackVisible: boolean;
  onAppMode(mode: AppMode): void;
  onFeedback(): void;
  onSettings(): void;
  onStep(step: Step): void;
}) {
  const converterTabRef = useRef<HTMLButtonElement>(null);
  const editorTabRef = useRef<HTMLButtonElement>(null);

  function selectModeWithKeyboard(
    event: React.KeyboardEvent<HTMLButtonElement>,
    mode: AppMode,
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextMode =
      event.key === "ArrowLeft" || event.key === "Home"
        ? "converter"
        : event.key === "ArrowRight" || event.key === "End"
          ? "editor"
          : mode;
    props.onAppMode(nextMode);
    window.requestAnimationFrame(() => {
      (nextMode === "converter"
        ? converterTabRef
        : editorTabRef
      ).current?.focus();
    });
  }

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <img src={brandLogoUrl} alt="" />
        </div>
        <div className="brand-copy">
          <h1>Multi-Converter</h1>
          <div
            className="mode-toggle"
            role="tablist"
            aria-label={t(props.language, "mode.label")}
          >
            <button
              ref={converterTabRef}
              type="button"
              role="tab"
              aria-selected={props.appMode === "converter"}
              tabIndex={props.appMode === "converter" ? 0 : -1}
              className={props.appMode === "converter" ? "is-converter" : ""}
              onClick={() => props.onAppMode("converter")}
              onKeyDown={(event) => selectModeWithKeyboard(event, "converter")}
            >
              {t(props.language, "mode.converter")}
            </button>
            <button
              ref={editorTabRef}
              type="button"
              role="tab"
              aria-selected={props.appMode === "editor"}
              tabIndex={props.appMode === "editor" ? 0 : -1}
              className={props.appMode === "editor" ? "is-editor" : ""}
              onClick={() => props.onAppMode("editor")}
              onKeyDown={(event) => selectModeWithKeyboard(event, "editor")}
            >
              {t(props.language, "mode.editor")}
            </button>
          </div>
        </div>
      </div>

      {props.appMode === "converter" ? (
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
      ) : (
        <div className="editor-context-pill">
          <DocumentModeIcon />
          {t(props.language, "editor.contextTitle")}
        </div>
      )}

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
}

function stepLabels(
  language: LanguageCode,
): Array<{ id: Step; label: string; title: string }> {
  return [
    { id: 1, label: "01", title: t(language, "step.files") },
    { id: 2, label: "02", title: t(language, "step.format") },
    { id: 3, label: "03", title: t(language, "step.output") },
  ];
}
