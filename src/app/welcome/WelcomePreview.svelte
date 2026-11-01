<script lang="ts">
  import { t, type LanguageCode, type TranslationKey } from "../../i18n";

  import type { Step } from "../types";

  import MiniAppTopbar from "./MiniAppTopbar.svelte";
  import MiniUploadArea from "./MiniUploadArea.svelte";
  import MiniSettingsPanel from "./MiniSettingsPanel.svelte";
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
    kind: WelcomePreviewKind;
    language: LanguageCode;
  } = $props();
</script>

{#if props.kind === "hello"}<div
    class="welcome-preview welcome-preview-app is-hello"
    aria-label={t(props.language, "welcome.previewLabel")}
  >
    <div class="mini-capture-frame mini-app-capture">
      <MiniAppTopbar language={props.language} />
      <MiniUploadArea language={props.language} />
    </div>
  </div>{:else}{#if props.kind === "language"}<div
      class="welcome-preview welcome-preview-settings is-language"
      aria-label={t(props.language, "welcome.previewLabel")}
    >
      <div class="mini-capture-frame mini-settings-capture">
        <MiniSettingsPanel language={props.language} />
      </div>
    </div>{:else}<div
      class="welcome-preview welcome-preview-app is-convert"
      aria-label={t(props.language, "welcome.previewLabel")}
    >
      <div class="mini-capture-frame mini-app-capture">
        <MiniAppTopbar language={props.language} />
        <MiniUploadArea language={props.language} />
        <div class="empty-state">{t(props.language, "upload.empty")}</div>
      </div>
    </div>{/if}{/if}
