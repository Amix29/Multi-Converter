import { useEffect, useRef, useState } from "react";
import { useModalAccessibility } from "../../hooks/useModalAccessibility";
import { api } from "../../lib/api";
import { t, type LanguageCode, type TranslationKey } from "../../i18n";
import { minimumReportVersion, repositoryUrl } from "../../lib/updateService";
import type { FeedbackKind } from "../types";
import { CloseIcon } from "../components/Icons";

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

export function FeedbackButton(props: {
  isVisible: boolean;
  language: LanguageCode;
  onOpen(): void;
}) {
  if (!props.isVisible) return null;
  return (
    <button
      className="feedback-launcher"
      data-testid="feedback-launcher"
      type="button"
      onClick={props.onOpen}
      aria-label={t(props.language, "feedback.open")}
    >
      <span aria-hidden="true">!</span>
      <strong>{t(props.language, "feedback.launcher")}</strong>
    </button>
  );
}

export function FeedbackPrivacyDialog(props: {
  isOpen: boolean;
  language: LanguageCode;
  repositoryUrl: string;
  onAccept(): void;
  onClose(): void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const repositoryButtonRef = useRef<HTMLButtonElement>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(5);
  const canClose = remainingSeconds <= 0;

  useEffect(() => {
    setRemainingSeconds(5);
    if (!props.isOpen) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRemainingSeconds(Math.max(0, 5 - elapsed));
    }, 250);
    return () => window.clearInterval(interval);
  }, [props.isOpen]);

  useModalAccessibility({
    isOpen: props.isOpen,
    surfaceRef: panelRef,
    initialFocusRef: repositoryButtonRef,
    onEscape: canClose ? props.onClose : undefined,
    returnFocus: feedbackLauncher,
  });

  if (!props.isOpen) return null;

  return (
    <div className="feedback-overlay" role="presentation">
      <section
        ref={panelRef}
        className="feedback-warning-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="feedback-warning-title"
        tabIndex={-1}
      >
        <header className="feedback-dialog-header">
          <div>
            <span className="label">
              {t(props.language, "feedback.publicLabel")}
            </span>
            <h2 id="feedback-warning-title">
              {t(props.language, "feedback.warningTitle")}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={t(props.language, "app.close")}
            disabled={!canClose}
            onClick={props.onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="feedback-warning-copy">
          <p>
            {t(props.language, "feedback.warningBodyBefore")}{" "}
            <button
              ref={repositoryButtonRef}
              className="inline-link-button"
              type="button"
              onClick={() => void openExternalUrl(props.repositoryUrl)}
            >
              Multi-Converter
            </button>
            {t(props.language, "feedback.warningBodyAfter")}
          </p>
          <p>{t(props.language, "feedback.warningPrivacy")}</p>
        </div>

        <footer className="feedback-actions">
          <button
            className="ghost-button"
            type="button"
            disabled={!canClose}
            onClick={props.onClose}
          >
            {canClose
              ? t(props.language, "feedback.close")
              : t(props.language, "feedback.wait", {
                  seconds: remainingSeconds,
                })}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!canClose}
            onClick={props.onAccept}
          >
            {canClose
              ? t(props.language, "feedback.accept")
              : t(props.language, "feedback.wait", {
                  seconds: remainingSeconds,
                })}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function FeedbackDialog(props: {
  isOpen: boolean;
  language: LanguageCode;
  currentVersion: string;
  onClose(): void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const reportVersion = effectiveAppVersion(props.currentVersion);

  useModalAccessibility({
    isOpen: props.isOpen,
    surfaceRef: panelRef,
    initialFocusRef: closeButtonRef,
    onEscape: props.onClose,
    returnFocus: feedbackLauncher,
  });

  if (!props.isOpen) return null;

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

  return (
    <div
      className="feedback-overlay"
      role="presentation"
      onMouseDown={props.onClose}
    >
      <section
        ref={panelRef}
        className="feedback-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="feedback-dialog-header">
          <div>
            <span className="label">
              {t(props.language, "feedback.publicLabel")}
            </span>
            <h2 id="feedback-title">{t(props.language, "feedback.title")}</h2>
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

        <p className="feedback-choice-intro">
          {t(props.language, "feedback.chooseKindHelp")}
        </p>
        <div
          className="feedback-kind-grid"
          aria-label={t(props.language, "feedback.kindLabel")}
        >
          {feedbackKinds.map((item) => (
            <button
              key={item}
              type="button"
              className="feedback-kind"
              onClick={() => void openIssue(item)}
            >
              <strong>{t(props.language, feedbackKindLabelKey(item))}</strong>
              <span>{t(props.language, feedbackKindDescriptionKey(item))}</span>
            </button>
          ))}
        </div>
        <p className="feedback-github-note">
          {t(props.language, "feedback.githubLoginNote")}
        </p>
        <footer className="feedback-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={props.onClose}
          >
            {t(props.language, "feedback.cancel")}
          </button>
        </footer>
      </section>
    </div>
  );
}

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
    userAgentData?: { platform?: string };
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
