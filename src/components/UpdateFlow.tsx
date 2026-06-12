import { useEffect, useState } from "react";
import { t, type LanguageCode } from "../i18n";
import { releaseNotesForLanguage, translateReleaseNotesForLanguage } from "../lib/releaseNotes";
import {
  releasePageUrl,
  type AppUpdateInfo,
  type UpdateDownloadSize,
  type UpdateStatus,
} from "../lib/updateService";
import { ReleaseNotesMarkdown } from "./ReleaseNotesMarkdown";

export function UpdateDialog(props: {
  isOpen: boolean;
  language: LanguageCode;
  updateInfo: AppUpdateInfo | null;
  updateStatus: UpdateStatus;
  updateDownloadProgress: number | null;
  updateDownloadSize: UpdateDownloadSize | null;
  onInstall(): void;
  onCancel(): void;
}) {
  const rawReleaseNotes = props.updateInfo?.body?.trim() ?? "";
  const [localizedReleaseNotes, setLocalizedReleaseNotes] = useState("");

  useEffect(() => {
    if (!props.isOpen || !rawReleaseNotes) {
      setLocalizedReleaseNotes("");
      return;
    }

    let disposed = false;
    setLocalizedReleaseNotes(releaseNotesForLanguage(rawReleaseNotes, props.language));
    translateReleaseNotesForLanguage(rawReleaseNotes, props.language).then((translated) => {
      if (!disposed) setLocalizedReleaseNotes(translated);
    });

    return () => {
      disposed = true;
    };
  }, [props.isOpen, props.language, rawReleaseNotes]);

  if (!props.isOpen || !props.updateInfo) return null;
  const installing = props.updateStatus === "installing";
  const releaseNotes = localizedReleaseNotes.trim();

  return (
    <div className="update-overlay" role="presentation" onMouseDown={installing ? undefined : props.onCancel}>
      <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <span className="label">{t(props.language, "update.label")}</span>
          <h2 id="update-dialog-title">{t(props.language, "update.dialogTitle", { version: props.updateInfo.version })}</h2>
        </header>
        <div className="update-version-hero" aria-label={t(props.language, "update.latestVersion", { version: props.updateInfo.version })}>
          <span>{t(props.language, "update.availableBadge")}</span>
          <strong>{props.updateInfo.version}</strong>
        </div>
        <p>{t(props.language, "update.dialogBody", { current: props.updateInfo.currentVersion, latest: props.updateInfo.version })}</p>
        <section className="update-release-notes" aria-label={t(props.language, "update.releaseNotes")}>
          <strong>{t(props.language, "update.releaseNotes")}</strong>
          {releaseNotes ? <ReleaseNotesMarkdown body={releaseNotes} /> : <p>{t(props.language, "update.noReleaseNotes")}</p>}
        </section>
        {installing && <UpdateProgress language={props.language} progress={props.updateDownloadProgress} size={props.updateDownloadSize} />}
        <a className="release-link" href={releasePageUrl(props.updateInfo.version)} target="_blank" rel="noreferrer">
          {t(props.language, "update.openRelease")}
        </a>
        <div className="update-actions">
          <button className="secondary-button" type="button" disabled={installing} onClick={props.onCancel}>
            {t(props.language, "update.cancel")}
          </button>
          <button className="primary-button" type="button" disabled={installing} onClick={props.onInstall}>
            {installing ? t(props.language, "update.installing") : t(props.language, "update.install")}
          </button>
        </div>
      </section>
    </div>
  );
}

export function UpdateInstallDialog(props: {
  isVisible: boolean;
  language: LanguageCode;
  updateInfo: AppUpdateInfo | null;
  progress: number | null;
  size: UpdateDownloadSize | null;
}) {
  if (!props.isVisible) return null;
  const version = props.updateInfo?.version ?? "";

  return (
    <div className="update-install-overlay" role="presentation">
      <section className="update-install-dialog" role="alertdialog" aria-modal="true" aria-labelledby="update-install-title">
        <span className="label">{t(props.language, "update.label")}</span>
        <h2 id="update-install-title">{t(props.language, "update.installingTitle", { version })}</h2>
        <p>{t(props.language, "update.installingBody")}</p>
        <UpdateProgress language={props.language} progress={props.progress} size={props.size} />
      </section>
    </div>
  );
}

export function UpdateReminder(props: {
  isVisible: boolean;
  language: LanguageCode;
  updateInfo: AppUpdateInfo | null;
  updateStatus: UpdateStatus;
  onInstall(): void;
  onOpenDetails(): void;
}) {
  if (!props.isVisible || !props.updateInfo) return null;
  const installing = props.updateStatus === "installing";

  return (
    <aside className="update-reminder" data-testid="update-reminder" role="status" aria-live="polite">
      <div>
        <span>{t(props.language, "update.availableBadge")}</span>
        <strong>{t(props.language, "update.reminderTitle", { version: props.updateInfo.version })}</strong>
        <button type="button" onClick={props.onOpenDetails}>{t(props.language, "update.details")}</button>
      </div>
      <button className="primary-button" type="button" disabled={installing} onClick={props.onInstall}>
        {installing ? t(props.language, "update.installing") : t(props.language, "update.install")}
      </button>
    </aside>
  );
}

export function UpdateProgress(props: { language: LanguageCode; progress: number | null; size?: UpdateDownloadSize | null }) {
  const label = props.progress === null ? t(props.language, "update.installing") : t(props.language, "update.progress", { progress: props.progress });
  const sizeLabel = props.size ? updateDownloadSizeLabel(props.size) : null;
  return (
    <div className={`update-progress ${props.progress === null ? "is-indeterminate" : ""}`}>
      <div className="update-progress-header">
        <span>{label}</span>
        {sizeLabel && <strong>{sizeLabel}</strong>}
      </div>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={props.progress ?? undefined}>
        <div className="progress-bar" style={props.progress === null ? undefined : { width: `${props.progress}%` }} />
      </div>
    </div>
  );
}

function updateDownloadSizeLabel(size: UpdateDownloadSize) {
  const downloaded = formatMegabytes(size.downloaded);
  return size.total ? `${downloaded} / ${formatMegabytes(size.total)}` : downloaded;
}

function formatMegabytes(bytes: number) {
  const value = bytes / (1024 * 1024);
  return `${Math.max(0, Math.round(value))} Mo`;
}
