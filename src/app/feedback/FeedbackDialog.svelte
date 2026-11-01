<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  import ModalSurface from "../../components/ModalSurface.svelte";

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
    currentVersion: string;
    onClose(): void;
  } = $props();
  const panelRef: { current: HTMLElement | null } = $state({ current: null });
  const closeButtonRef: { current: HTMLButtonElement | null } = $state({
    current: null,
  });
  let reportVersion = $derived(effectiveAppVersion(props.currentVersion));
  async function openIssue(kind: FeedbackKind) {
    const params = new URLSearchParams({
      template: feedbackTemplates[kind],
      labels: feedbackLabels[kind],
    });
    if (feedbackTitlePrefixes[kind])
      params.set("title", feedbackTitlePrefixes[kind]);
    if (kind !== "other") {
      params.set("app-version", reportVersion);
      params.set("operating-system", detectedOperatingSystem());
    }
    await openExternalUrl(`${issueNewUrl}?${params.toString()}`);
  }
</script>

{#if !!props.isOpen}<ModalSurface
    bind:ref={panelRef.current}
    class="feedback-panel"
    role="dialog"
    aria-labelledby="feedback-title"
    onmousedown={(event) => event.stopPropagation()}
    open={props.isOpen}
    overlayClass="feedback-overlay"
    initialFocus={() => closeButtonRef.current}
    onEscape={props.onClose}
    returnFocus={feedbackLauncher}
  >
    <header class="feedback-dialog-header">
      <div>
        <span class="label"> {t(props.language, "feedback.publicLabel")} </span>
        <h2 id="feedback-title">{t(props.language, "feedback.title")}</h2>
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
    <p class="feedback-choice-intro">
      {t(props.language, "feedback.chooseKindHelp")}
    </p>
    <div
      class="feedback-kind-grid"
      aria-label={t(props.language, "feedback.kindLabel")}
    >
      {#each feedbackKinds as item (item)}<button
          type="button"
          class="feedback-kind"
          onclick={() => void openIssue(item)}
        >
          <strong>{t(props.language, feedbackKindLabelKey(item))}</strong>
          <span>{t(props.language, feedbackKindDescriptionKey(item))}</span>
        </button>{/each}
    </div>
    <p class="feedback-github-note">
      {t(props.language, "feedback.githubLoginNote")}
    </p>
    <footer class="feedback-actions">
      <Button
        variant="unstyled"
        size="inherit"
        class="ghost-button"
        type="button"
        onclick={props.onClose}
      >
        {t(props.language, "feedback.cancel")}
      </Button>
    </footer>
  </ModalSurface>{/if}
