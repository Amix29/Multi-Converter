import { useEffect, useMemo, useRef, useState } from "react";
import brandLogoUrl from "../../assets/multi-converter-icon-brand-orange.svg";
import { useModalAccessibility } from "../../hooks/useModalAccessibility";
import {
  languageLabel,
  languageOptions,
  t,
  type LanguageCode,
  type TranslationKey,
} from "../../i18n";
import { minimumReportVersion } from "../../lib/updateService";
import type { Step } from "../types";
import { CloseIcon, SettingsIcon } from "../components/Icons";

type WelcomePreviewKind = "hello" | "language" | "convert";

export function WelcomePanel(props: {
  isOpen: boolean;
  language: LanguageCode;
  onClose(): void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [furthestSlideIndex, setFurthestSlideIndex] = useState(0);
  const slides = useMemo(() => welcomeSlides(), []);
  const slide = slides[slideIndex];
  const isFirstSlide = slideIndex === 0;
  const isLastSlide = slideIndex === slides.length - 1;

  useModalAccessibility({
    isOpen: props.isOpen,
    surfaceRef: panelRef,
    initialFocusRef: closeButtonRef,
    onEscape: props.onClose,
  });

  useEffect(() => {
    if (props.isOpen) {
      setSlideIndex(0);
      setFurthestSlideIndex(0);
    }
  }, [props.isOpen]);

  useEffect(() => {
    if (!props.isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight")
        advanceWelcomeStep(slides.length, setSlideIndex, setFurthestSlideIndex);
      if (event.key === "ArrowLeft")
        setSlideIndex((index) => Math.max(0, index - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [props.isOpen, slides.length]);

  if (!props.isOpen) return null;

  return (
    <div className="welcome-overlay" role="presentation">
      <section
        ref={panelRef}
        className="welcome-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="welcome-header">
          <div className="welcome-brand-mark" aria-hidden="true">
            <img src={brandLogoUrl} alt="" />
          </div>
          <div
            className="welcome-progress"
            aria-label={t(props.language, "welcome.progress", {
              current: slideIndex + 1,
              total: slides.length,
            })}
          >
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={index === slideIndex ? "is-active" : ""}
                aria-label={t(props.language, "welcome.goToStep", {
                  step: index + 1,
                })}
                aria-current={index === slideIndex ? "step" : undefined}
                disabled={index > furthestSlideIndex}
                onClick={() => {
                  if (index <= furthestSlideIndex) setSlideIndex(index);
                }}
              />
            ))}
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            aria-label={t(props.language, "app.close")}
            onClick={props.onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="welcome-layout">
          <div className="welcome-copy">
            <span className="eyebrow">
              {t(props.language, slide.eyebrowKey)}
            </span>
            <h2 id="welcome-title">{t(props.language, slide.titleKey)}</h2>
            <p>{t(props.language, slide.bodyKey)}</p>
          </div>
          <WelcomePreview kind={slide.preview} language={props.language} />
        </div>

        <footer className="welcome-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={isFirstSlide}
            onClick={() => setSlideIndex((index) => Math.max(0, index - 1))}
          >
            {t(props.language, "welcome.back")}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              if (isLastSlide) {
                props.onClose();
                return;
              }
              advanceWelcomeStep(
                slides.length,
                setSlideIndex,
                setFurthestSlideIndex,
              );
            }}
          >
            {isLastSlide
              ? t(props.language, "welcome.start")
              : t(props.language, "welcome.next")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function advanceWelcomeStep(
  slideCount: number,
  setSlideIndex: (updater: (index: number) => number) => void,
  setFurthestSlideIndex: (updater: (index: number) => number) => void,
) {
  setSlideIndex((index) => {
    const nextIndex = Math.min(slideCount - 1, index + 1);
    setFurthestSlideIndex((furthestIndex) =>
      Math.max(furthestIndex, nextIndex),
    );
    return nextIndex;
  });
}

function welcomeSlides(): Array<{
  id: WelcomePreviewKind;
  eyebrowKey: TranslationKey;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  preview: WelcomePreviewKind;
}> {
  return [
    {
      id: "hello",
      eyebrowKey: "welcome.eyebrow",
      titleKey: "welcome.helloTitle",
      bodyKey: "welcome.helloBody",
      preview: "hello",
    },
    {
      id: "language",
      eyebrowKey: "welcome.stepSettings",
      titleKey: "welcome.languageTitle",
      bodyKey: "welcome.languageText",
      preview: "language",
    },
    {
      id: "convert",
      eyebrowKey: "welcome.stepStart",
      titleKey: "welcome.convertTitle",
      bodyKey: "welcome.convertText",
      preview: "convert",
    },
  ];
}

function WelcomePreview(props: {
  kind: WelcomePreviewKind;
  language: LanguageCode;
}) {
  if (props.kind === "hello") {
    return (
      <div
        className="welcome-preview welcome-preview-app is-hello"
        aria-label={t(props.language, "welcome.previewLabel")}
      >
        <div className="mini-capture-frame mini-app-capture">
          <MiniAppTopbar language={props.language} />
          <MiniUploadArea language={props.language} />
        </div>
      </div>
    );
  }

  if (props.kind === "language") {
    return (
      <div
        className="welcome-preview welcome-preview-settings is-language"
        aria-label={t(props.language, "welcome.previewLabel")}
      >
        <div className="mini-capture-frame mini-settings-capture">
          <MiniSettingsPanel language={props.language} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="welcome-preview welcome-preview-app is-convert"
      aria-label={t(props.language, "welcome.previewLabel")}
    >
      <div className="mini-capture-frame mini-app-capture">
        <MiniAppTopbar language={props.language} />
        <MiniUploadArea language={props.language} />
        <div className="empty-state">{t(props.language, "upload.empty")}</div>
      </div>
    </div>
  );
}

function MiniAppTopbar(props: { language: LanguageCode }) {
  return (
    <div className="topbar mini-topbar" aria-hidden="true">
      <div className="brand">
        <div className="brand-mark">
          <img src={brandLogoUrl} alt="" />
        </div>
        <div>
          <h1>Multi-Converter</h1>
        </div>
      </div>
      <nav className="process-strip">
        {stepLabels(props.language).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`process-step ${item.id === 1 ? "is-active" : ""}`}
            disabled
          >
            <span>{item.label}</span>
            <strong>{item.title}</strong>
          </button>
        ))}
      </nav>
      <div className="topbar-actions">
        <button className="icon-button" type="button" disabled>
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}

function MiniUploadArea(props: { language: LanguageCode }) {
  return (
    <section className="drop-zone mini-drop-zone" aria-hidden="true">
      <div className="sketch-orbit">
        <img src={brandLogoUrl} alt="" />
      </div>
      <div>
        <strong>{t(props.language, "upload.dragDrop")}</strong>
      </div>
      <button className="primary-button" type="button" disabled>
        {t(props.language, "upload.browse")}
      </button>
    </section>
  );
}

function MiniSettingsPanel(props: { language: LanguageCode }) {
  return (
    <section
      className="settings-panel mini-settings-panel is-language"
      aria-hidden="true"
    >
      <header className="settings-header">
        <div>
          <h2>{t(props.language, "settings.title")}</h2>
        </div>
        <button className="icon-button" type="button" disabled>
          <CloseIcon />
        </button>
      </header>
      <div className="settings-grid">
        <section className="settings-column">
          <section className="setting-select language-setting mini-focus">
            <span className="label">
              {t(props.language, "settings.language")}
            </span>
            <div className="language-choice-grid">
              {languageOptions.map((languageOption) => (
                <button
                  key={languageOption}
                  type="button"
                  className={`language-choice ${props.language === languageOption ? "is-selected" : ""}`}
                  disabled
                >
                  {languageLabel(props.language, languageOption)}
                </button>
              ))}
            </div>
          </section>
          <section className="setting-toggle">
            <div>
              <span className="label">
                {t(props.language, "settings.notifications")}
              </span>
              <p>{t(props.language, "settings.notificationsDetail")}</p>
            </div>
            <label className="switch-control">
              <input type="checkbox" checked readOnly />
              <span aria-hidden="true" />
            </label>
          </section>
        </section>
        <section className="settings-side">
          <section className="update-settings-card">
            <div className="update-settings-heading">
              <div>
                <span className="label">
                  {t(props.language, "update.label")}
                </span>
                <strong>{t(props.language, "update.settingsTitle")}</strong>
              </div>
            </div>
            <p>
              {t(props.language, "update.currentVersion", {
                version: minimumReportVersion,
              })}
            </p>
            <p>{t(props.language, "update.unknown")}</p>
            <div className="settings-actions">
              <button className="secondary-button" type="button" disabled>
                {t(props.language, "update.checking")}
              </button>
            </div>
          </section>
        </section>
      </div>
    </section>
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
