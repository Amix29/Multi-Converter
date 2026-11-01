<script lang="ts">
  import { api } from "../../lib/api";
  import { t, type LanguageCode, type TranslationKey } from "../../i18n";
  import { minimumReportVersion, repositoryUrl } from "../../lib/updateService";
  import type { FeedbackKind } from "../types";

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
    isVisible: boolean;
    language: LanguageCode;
    onOpen(): void;
  } = $props();
</script>

{#if !!props.isVisible}<button
    class="feedback-launcher"
    data-testid="feedback-launcher"
    type="button"
    onclick={props.onOpen}
    aria-label={t(props.language, "feedback.open")}
  >
    <span aria-hidden="true">!</span>
    <strong>{t(props.language, "feedback.launcher")}</strong>
  </button>{/if}
