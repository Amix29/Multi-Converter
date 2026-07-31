import { useRef } from "react";
import { UpdateProgress } from "../../components/UpdateFlow";
import { useModalAccessibility } from "../../hooks/useModalAccessibility";
import {
  languageLabel,
  languageOptions,
  t,
  type LanguageCode,
} from "../../i18n";
import type {
  AppUpdateInfo,
  UpdateDownloadSize,
  UpdateStatus,
} from "../../lib/updateService";
import { CloseIcon } from "../components/Icons";

export function SettingsPanel(props: {
  isOpen: boolean;
  language: LanguageCode;
  notificationsEnabled: boolean;
  internetAvailable: boolean;
  currentVersion: string;
  updateInfo: AppUpdateInfo | null;
  updateStatus: UpdateStatus;
  updateDownloadProgress: number | null;
  updateDownloadSize: UpdateDownloadSize | null;
  onClose(): void;
  onLanguage(language: LanguageCode): void;
  onNotificationsEnabled(enabled: boolean): void;
  onCheckForUpdate(): void;
  onInstallUpdate(): void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useModalAccessibility({
    isOpen: props.isOpen,
    surfaceRef: panelRef,
    initialFocusRef: closeButtonRef,
    onEscape: props.onClose,
  });

  if (!props.isOpen) return null;
  const handleLanguageSelection = (value: string) => {
    if (languageOptions.includes(value as LanguageCode))
      props.onLanguage(value as LanguageCode);
  };
  const handleLanguageKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    languageOption: LanguageCode,
  ) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const currentIndex = languageOptions.indexOf(languageOption);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? languageOptions.length - 1
          : (currentIndex +
              (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) +
              languageOptions.length) %
            languageOptions.length;
    const nextLanguage = languageOptions[nextIndex];
    props.onLanguage(nextLanguage);
    window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(`[data-language-option='${nextLanguage}']`)
        ?.focus();
    });
  };

  return (
    <div
      className="settings-overlay"
      role="presentation"
      onMouseDown={props.onClose}
    >
      <section
        ref={panelRef}
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <div>
            <h2 id="settings-title">{t(props.language, "settings.title")}</h2>
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

        <div className="settings-grid">
          <section className="settings-column">
            <section
              className="setting-select language-setting"
              aria-labelledby="language-setting-title"
            >
              <span className="label" id="language-setting-title">
                {t(props.language, "settings.language")}
              </span>
              <div
                className="language-choice-grid"
                role="radiogroup"
                aria-labelledby="language-setting-title"
              >
                {languageOptions.map((languageOption) => (
                  <button
                    key={languageOption}
                    type="button"
                    className={`language-choice ${props.language === languageOption ? "is-selected" : ""}`}
                    role="radio"
                    aria-checked={props.language === languageOption}
                    tabIndex={props.language === languageOption ? 0 : -1}
                    data-language-option={languageOption}
                    onClick={() => handleLanguageSelection(languageOption)}
                    onKeyDown={(event) =>
                      handleLanguageKeyDown(event, languageOption)
                    }
                  >
                    {languageLabel(props.language, languageOption)}
                  </button>
                ))}
              </div>
            </section>

            <section
              className="setting-toggle"
              aria-labelledby="notifications-setting-title"
            >
              <div>
                <span className="label" id="notifications-setting-title">
                  {t(props.language, "settings.notifications")}
                </span>
                <p>{t(props.language, "settings.notificationsDetail")}</p>
              </div>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={props.notificationsEnabled}
                  onChange={(event) =>
                    props.onNotificationsEnabled(event.currentTarget.checked)
                  }
                />
                <span aria-hidden="true" />
              </label>
            </section>
          </section>

          <section className="settings-side">
            <section
              className="update-settings-card"
              aria-labelledby="update-settings-title"
            >
              <div className="update-settings-heading">
                <div>
                  <span className="label">
                    {t(props.language, "update.label")}
                  </span>
                  <strong id="update-settings-title">
                    {t(props.language, "update.settingsTitle")}
                  </strong>
                </div>
                {props.updateStatus === "available" && (
                  <b>{t(props.language, "update.availableBadge")}</b>
                )}
              </div>
              <p>
                {t(props.language, "update.currentVersion", {
                  version: props.currentVersion,
                })}
              </p>
              {props.updateInfo ? (
                <div className="update-version-inline">
                  <span>
                    {t(props.language, "update.latestVersion", {
                      version: props.updateInfo.version,
                    })}
                  </span>
                  <strong>{props.updateInfo.version}</strong>
                </div>
              ) : (
                <p>
                  {props.updateStatus === "notAvailable"
                    ? t(props.language, "update.none")
                    : t(props.language, "update.unknown")}
                </p>
              )}
              {props.updateStatus === "installing" && (
                <UpdateProgress
                  language={props.language}
                  progress={props.updateDownloadProgress}
                  size={props.updateDownloadSize}
                />
              )}
              <div className="settings-actions">
                {props.updateInfo ? (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={props.updateStatus === "installing"}
                    onClick={props.onInstallUpdate}
                  >
                    {props.updateStatus === "installing"
                      ? t(props.language, "update.installing")
                      : t(props.language, "update.install")}
                  </button>
                ) : (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={
                      props.updateStatus === "checking" ||
                      !props.internetAvailable
                    }
                    onClick={props.onCheckForUpdate}
                  >
                    {props.updateStatus === "checking"
                      ? t(props.language, "update.checking")
                      : t(props.language, "update.check")}
                  </button>
                )}
              </div>
              {!props.internetAvailable && (
                <small>{t(props.language, "update.internetRequired")}</small>
              )}
            </section>
          </section>
        </div>
      </section>
    </div>
  );
}
