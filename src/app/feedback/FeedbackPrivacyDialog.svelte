<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";

  import ModalSurface from "../../components/ModalSurface.svelte";
  import { untrack } from "svelte";
  
  import { api } from "../../lib/api";
  import { t, type LanguageCode, type TranslationKey } from "../../i18n";
  import { minimumReportVersion, repositoryUrl } from "../../lib/updateService";
  import type { FeedbackKind } from "../types";
  import CloseIcon from "../components/CloseIcon.svelte";

  const issueNewUrl = `${repositoryUrl}/issues/new`;
  const feedbackKinds: FeedbackKind[] = ["bug", "feature", "other"];
  const feedbackLabels: Record<FeedbackKind, string> = {
    bug: "Bug",
    feature: "Feature",
    other: "Other",
  };
  const feedbackTemplates: Record<FeedbackKind, string> = {
    bug: "bug_report.yml",
    feature: "feature_request.yml",
    other: "other.md",
  };
  const feedbackTitlePrefixes: Record<FeedbackKind, string> = {
    bug: "[Bug]: ",
    feature: "[Feature]: ",
    other: "",
  };
  function feedbackKindLabelKey(kind: FeedbackKind): TranslationKey {
    if (kind === "bug") return "feedback.kindBug";
    if (kind === "feature") return "feedback.kindFeature";
    return "feedback.kindOther";
  }
  function feedbackKindDescriptionKey(kind: FeedbackKind): TranslationKey {
    if (kind === "bug") return "feedback.kindBugDescription";
    if (kind === "feature") return "feedback.kindFeatureDescription";
    return "feedback.kindOtherDescription";
  }
  function effectiveAppVersion(version: string) {
    return compareVersions(version, minimumReportVersion) >= 0
      ? version
      : minimumReportVersion;
  }
  function compareVersions(left: string, right: string) {
    const leftParts = versionParts(left);
    const rightParts = versionParts(right);
    for (
      let index = 0;
      index < Math.max(leftParts.length, rightParts.length);
      index += 1
    ) {
      const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
      if (delta !== 0) return delta;
    }
    return 0;
  }
  function versionParts(version: string) {
    return version
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  }
  function detectedOperatingSystem() {
    const userAgentData = navigator as Navigator & {
      userAgentData?: {
        platform?: string;
      };
    };
    const platform =
      userAgentData.userAgentData?.platform || navigator.platform || "";
    const value = `${platform} ${navigator.userAgent || ""}`.toLowerCase();
    if (
      value.includes("windows") ||
      value.includes("win32") ||
      value.includes("win64")
    )
      return "Windows";
    if (value.includes("mac")) return "macOS";
    if (value.includes("linux")) return "Linux";
    return platform || "Inconnu";
  }
  async function openExternalUrl(url: string) {
    try {
      await api.openExternalUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }
  function feedbackLauncher() {
    return document.querySelector<HTMLElement>(
      "[data-testid='feedback-launcher']",
    );
  }
  let props: {
    isOpen: boolean;
    language: LanguageCode;
    repositoryUrl: string;
    onAccept(): void;
    onClose(): void;
  } = $props();
  const panelRef: { current: HTMLElement | null } = $state({ current: null });
  const repositoryButtonRef: { current: HTMLButtonElement | null } = $state({
    current: null,
  });
  let remainingSeconds = $state.raw(5);
  const setRemainingSeconds: StateSetter<typeof remainingSeconds> = (value) => {
    remainingSeconds = resolveStateUpdate(value, remainingSeconds);
  };
  let canClose = $derived(remainingSeconds <= 0);
  $effect(() => {
    void [props.isOpen];
    return untrack(() => {
      setRemainingSeconds(5);
      if (!props.isOpen) return;
      const startedAt = Date.now();
      const interval = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setRemainingSeconds(Math.max(0, 5 - elapsed));
      }, 250);
      return () => window.clearInterval(interval);
    });
  });
</script>

{#if !!props.isOpen}<ModalSurface
    bind:ref={panelRef.current}
    class="feedback-warning-panel"
    role="alertdialog"
    aria-labelledby="feedback-warning-title"
    open={props.isOpen}
    overlayClass="feedback-overlay"
    initialFocus={() => repositoryButtonRef.current}
    onEscape={canClose ? props.onClose : undefined}
    returnFocus={feedbackLauncher}
  >
    <header class="feedback-dialog-header">
      <div>
        <span class="label"> {t(props.language, "feedback.publicLabel")} </span>
        <h2 id="feedback-warning-title">
          {t(props.language, "feedback.warningTitle")}
        </h2>
      </div>
      <button
        class="icon-button"
        type="button"
        aria-label={t(props.language, "app.close")}
        disabled={!canClose}
        onclick={props.onClose}
      >
        <CloseIcon />
      </button>
    </header>
    <div class="feedback-warning-copy">
      <p>
        {t(props.language, "feedback.warningBodyBefore")}{" "}
        <button
          bind:this={repositoryButtonRef.current}
          class="inline-link-button"
          type="button"
          onclick={() => void openExternalUrl(props.repositoryUrl)}
        >
          Multi-Converter
        </button>
        {t(props.language, "feedback.warningBodyAfter")}
      </p>
      <p>{t(props.language, "feedback.warningPrivacy")}</p>
    </div>
    <footer class="feedback-actions">
      <Button
        variant="unstyled"
        size="inherit"
        class="ghost-button"
        type="button"
        disabled={!canClose}
        onclick={props.onClose}
      >
        {t(props.language, "feedback.close")}
      </Button>
      <Button
        variant="unstyled"
        size="inherit"
        class="primary-button"
        type="button"
        disabled={!canClose}
        onclick={props.onAccept}
      >
        {canClose
          ? t(props.language, "feedback.accept")
          : t(props.language, "feedback.wait", {
              seconds: remainingSeconds,
            })}
      </Button>
    </footer>
  </ModalSurface>{/if}
