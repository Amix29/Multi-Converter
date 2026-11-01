<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  
  
  

  import { languageLabel, languageOptions, t, type LanguageCode, type TranslationKey } from "../../i18n";
  import { minimumReportVersion } from "../../lib/updateService";
  import type { Step } from "../types";
  import CloseIcon from "../components/CloseIcon.svelte";
  

  type WelcomePreviewKind = "hello" | "language" | "convert";
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
  function stepLabels(language: LanguageCode): Array<{
    id: Step;
    label: string;
    title: string;
  }> {
    return [
      { id: 1, label: "01", title: t(language, "step.files") },
      { id: 2, label: "02", title: t(language, "step.format") },
      { id: 3, label: "03", title: t(language, "step.output") },
    ];
  }
  let props: {
    language: LanguageCode;
  } = $props();
</script>

<section
  class="settings-panel mini-settings-panel is-language"
  aria-hidden="true"
>
  <header class="settings-header">
    <div><h2>{t(props.language, "settings.title")}</h2></div>
    <button class="icon-button" type="button" disabled> <CloseIcon /> </button>
  </header>
  <div class="settings-grid">
    <section class="settings-column">
      <section class="setting-select language-setting mini-focus">
        <span class="label"> {t(props.language, "settings.language")} </span>
        <div class="language-choice-grid">
          {#each languageOptions as languageOption (languageOption)}<button
              type="button"
              class={`language-choice ${props.language === languageOption ? "is-selected" : ""}`}
              disabled
            >
              {languageLabel(props.language, languageOption)}
            </button>{/each}
        </div>
      </section>
      <section class="setting-toggle">
        <div>
          <span class="label">
            {t(props.language, "settings.notifications")}
          </span>
          <p>{t(props.language, "settings.notificationsDetail")}</p>
        </div>
        <label class="switch-control">
          <input type="checkbox" checked readonly />
          <span aria-hidden="true"></span>
        </label>
      </section>
    </section>
    <section class="settings-side">
      <section class="update-settings-card">
        <div class="update-settings-heading">
          <div>
            <span class="label"> {t(props.language, "update.label")} </span>
            <strong>{t(props.language, "update.settingsTitle")}</strong>
          </div>
        </div>
        <p>
          {t(props.language, "update.currentVersion", {
            version: minimumReportVersion,
          })}
        </p>
        <p>{t(props.language, "update.unknown")}</p>
        <div class="settings-actions">
          <Button
            variant="unstyled"
            size="inherit"
            class="secondary-button"
            type="button"
            disabled
          >
            {t(props.language, "update.checking")}
          </Button>
        </div>
      </section>
    </section>
  </div>
</section>
