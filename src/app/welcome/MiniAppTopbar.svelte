<script lang="ts">
  
  
  import brandLogoUrl from "../../assets/multi-converter-icon-brand-orange.svg";

  import { t, type LanguageCode, type TranslationKey } from "../../i18n";
  
  import type { Step } from "../types";
  
  import SettingsIcon from "../components/SettingsIcon.svelte";

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

<div class="topbar mini-topbar" aria-hidden="true">
  <div class="brand">
    <div class="brand-mark"><img src={brandLogoUrl} alt="" /></div>
    <div><h1>Multi-Converter</h1></div>
  </div>
  <nav class="process-strip">
    {#each stepLabels(props.language) as item (item.id)}<button
        type="button"
        class={`process-step ${item.id === 1 ? "is-active" : ""}`}
        disabled
      >
        <span>{item.label}</span> <strong>{item.title}</strong>
      </button>{/each}
  </nav>
  <div class="topbar-actions">
    <button class="icon-button" type="button" disabled>
      <SettingsIcon />
    </button>
  </div>
</div>
