<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";

  import ModalSurface from "../../components/ModalSurface.svelte";
  import { untrack } from "svelte";

  import brandLogoUrl from "../../assets/multi-converter-icon-brand-orange.svg";
  import { t, type LanguageCode, type TranslationKey } from "../../i18n";

  import type { Step } from "../types";
  import CloseIcon from "../components/CloseIcon.svelte";

  import WelcomePreview from "./WelcomePreview.svelte";
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
    isOpen: boolean;
    language: LanguageCode;
    onClose(): void;
  } = $props();
  const panelRef: { current: HTMLElement | null } = $state({ current: null });
  const closeButtonRef: { current: HTMLButtonElement | null } = $state({
    current: null,
  });
  let slideIndex = $state.raw(0);
  const setSlideIndex: StateSetter<typeof slideIndex> = (value) => {
    slideIndex = resolveStateUpdate(value, slideIndex);
  };
  let furthestSlideIndex = $state.raw(0);
  const setFurthestSlideIndex: StateSetter<typeof furthestSlideIndex> = (
    value,
  ) => {
    furthestSlideIndex = resolveStateUpdate(value, furthestSlideIndex);
  };
  const slides = $derived.by(() => welcomeSlides());
  let slide = $derived(slides[slideIndex]);
  let isFirstSlide = $derived(slideIndex === 0);
  let isLastSlide = $derived(slideIndex === slides.length - 1);
  $effect(() => {
    void [props.isOpen];
    return untrack(() => {
      if (props.isOpen) {
        setSlideIndex(0);
        setFurthestSlideIndex(0);
      }
    });
  });
  $effect(() => {
    void [props.isOpen, slides.length];
    return untrack(() => {
      if (!props.isOpen) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "ArrowRight")
          advanceWelcomeStep(
            slides.length,
            setSlideIndex,
            setFurthestSlideIndex,
          );
        if (event.key === "ArrowLeft")
          setSlideIndex((index) => Math.max(0, index - 1));
      };
      window.addEventListener("keydown", onKeyDown);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
      };
    });
  });
</script>

{#if !!props.isOpen}<ModalSurface
    bind:ref={panelRef.current}
    class="welcome-panel"
    role="dialog"
    aria-labelledby="welcome-title"
    onmousedown={(event) => event.stopPropagation()}
    open={props.isOpen}
    overlayClass="welcome-overlay"
    initialFocus={() => closeButtonRef.current}
    onEscape={props.onClose}
  >
    <header class="welcome-header">
      <div class="welcome-brand-mark" aria-hidden="true">
        <img src={brandLogoUrl} alt="" />
      </div>
      <div
        class="welcome-progress"
        aria-label={t(props.language, "welcome.progress", {
          current: slideIndex + 1,
          total: slides.length,
        })}
      >
        {#each slides as item, index (item.id)}<button
            type="button"
            class={index === slideIndex ? "is-active" : ""}
            aria-label={t(props.language, "welcome.goToStep", {
              step: index + 1,
            })}
            aria-current={index === slideIndex ? "step" : undefined}
            disabled={index > furthestSlideIndex}
            onclick={() => {
              if (index <= furthestSlideIndex) setSlideIndex(index);
            }}
          ></button>{/each}
      </div>
      <button
        bind:this={closeButtonRef.current}
        class="icon-button"
        type="button"
        aria-label={t(props.language, "app.close")}
        onclick={props.onClose}
      >
        <CloseIcon />
      </button>
    </header>
    <div class="welcome-layout">
      <div class="welcome-copy">
        <span class="eyebrow"> {t(props.language, slide.eyebrowKey)} </span>
        <h2 id="welcome-title">{t(props.language, slide.titleKey)}</h2>
        <p>{t(props.language, slide.bodyKey)}</p>
      </div>
      <WelcomePreview kind={slide.preview} language={props.language} />
    </div>
    <footer class="welcome-actions">
      <Button
        variant="unstyled"
        size="inherit"
        class="secondary-button"
        type="button"
        disabled={isFirstSlide}
        onclick={() => setSlideIndex((index) => Math.max(0, index - 1))}
      >
        {t(props.language, "welcome.back")}
      </Button>
      <Button
        variant="unstyled"
        size="inherit"
        class="primary-button"
        type="button"
        onclick={() => {
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
      </Button>
    </footer>
  </ModalSurface>{/if}
