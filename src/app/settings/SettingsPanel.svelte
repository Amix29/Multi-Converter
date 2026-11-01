<script lang="ts">
  import { Button } from "../../components/ui/button/index.js";
  import ModalSurface from "../../components/ModalSurface.svelte";
  
  
  import UpdateProgress from "../../components/UpdateProgress.svelte";
  import { languageLabel, languageOptions, t, type LanguageCode } from "../../i18n";
  import type { AppUpdateInfo, UpdateDownloadSize, UpdateStatus } from "../../lib/updateService";
  import CloseIcon from "../components/CloseIcon.svelte";
  import EngineDiagnostics from "./EngineDiagnostics.svelte";
  import type { DependencyBootstrap } from "../../lib/api";
  import type { ThemePreference } from "../theme.svelte.js";

  let props: {
    theme: ThemePreference;
    onTheme(theme: ThemePreference): void;
    isOpen: boolean;
    dependencies: DependencyBootstrap | null;
    language: LanguageCode;
    notificationsEnabled: boolean;
    recoveryEnabled: boolean;
    recoveryBusy: boolean;
    internetAvailable: boolean;
    currentVersion: string;
    updateInfo: AppUpdateInfo | null;
    updateStatus: UpdateStatus;
    updateDownloadProgress: number | null;
    updateDownloadSize: UpdateDownloadSize | null;
    onClose(): void;
    onLanguage(language: LanguageCode): void;
    onNotificationsEnabled(enabled: boolean): void;
    onRecoveryEnabled(enabled: boolean): void;
    onCheckForUpdate(): void;
    onInstallUpdate(): void;
  } = $props();
  const panelRef: { current: HTMLElement | null } = $state({ current: null });
  const closeButtonRef: { current: HTMLButtonElement | null } = $state({
    current: null,
  });
  const handleLanguageSelection = (value: string) => {
    if (languageOptions.includes(value as LanguageCode))
      props.onLanguage(value as LanguageCode);
  };
  const handleLanguageKeyDown = (
    event: KeyboardEvent & { currentTarget: HTMLButtonElement },
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
</script>

{#if !!props.isOpen}<ModalSurface
    bind:ref={panelRef.current}
    class="settings-panel"
    role="dialog"
    aria-labelledby="settings-title"
    onmousedown={(event) => event.stopPropagation()}
    open={props.isOpen}
    overlayClass="settings-overlay"
    initialFocus={() => closeButtonRef.current}
    onEscape={props.onClose}
  >
    <header class="settings-header">
      <div>
        <h2 id="settings-title">{t(props.language, "settings.title")}</h2>
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
    <div class="settings-grid">
      <section class="settings-column">
        <section class="theme-setting" aria-labelledby="theme-setting-title">
          <span class="label" id="theme-setting-title"
            >{t(props.language, "settings.appearance")}</span
          >
          <div
            class="theme-choices"
            role="group"
            aria-labelledby="theme-setting-title"
          >
            {#each ["system", "light", "dark"] as const as theme (theme)}<button
                type="button"
                aria-pressed={props.theme === theme}
                onclick={() => props.onTheme(theme)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"
                  >{#if theme === "system"}<path d="M3 4h18v13H3zM8 21h8m-4-4v4"
                    ></path>{:else}{#if theme === "light"}<circle
                        cx="12"
                        cy="12"
                        r="4"
                      ></circle><path
                        d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"
                      ></path>{:else}<path
                        d="M20 15a8 8 0 0 1-11-11 8 8 0 1 0 11 11Z"
                      ></path>{/if}{/if}</svg
                >
                {t(props.language, `settings.theme.${theme}`)}
              </button>{/each}
          </div>
        </section>
        <section
          class="setting-select language-setting"
          aria-labelledby="language-setting-title"
        >
          <span class="label" id="language-setting-title">
            {t(props.language, "settings.language")}
          </span>
          <div
            class="language-choice-grid"
            role="radiogroup"
            aria-labelledby="language-setting-title"
          >
            {#each languageOptions as languageOption (languageOption)}<button
                type="button"
                class={`language-choice ${props.language === languageOption ? "is-selected" : ""}`}
                role="radio"
                aria-checked={props.language === languageOption}
                tabindex={props.language === languageOption ? 0 : -1}
                data-language-option={languageOption}
                onclick={() => handleLanguageSelection(languageOption)}
                onkeydown={(event) =>
                  handleLanguageKeyDown(event, languageOption)}
              >
                {languageLabel(props.language, languageOption)}
              </button>{/each}
          </div>
        </section>
        <section
          class="setting-toggle"
          aria-labelledby="notifications-setting-title"
        >
          <div>
            <span class="label" id="notifications-setting-title">
              {t(props.language, "settings.notifications")}
            </span>
            <p>{t(props.language, "settings.notificationsDetail")}</p>
          </div>
          <label class="switch-control">
            <input
              type="checkbox"
              aria-labelledby="notifications-setting-title"
              checked={props.notificationsEnabled}
              onchange={(event) =>
                props.onNotificationsEnabled(event.currentTarget.checked)}
            /> <span aria-hidden="true"></span>
          </label>
        </section>
        <section
          class="setting-toggle"
          aria-labelledby="recovery-setting-title"
        >
          <div>
            <span class="label" id="recovery-setting-title"
              >{t(props.language, "recovery.setting")}</span
            >
            <p id="recovery-setting-detail">
              {t(props.language, "recovery.settingDetail")}
            </p>
          </div>
          <label class="switch-control">
            <input
              type="checkbox"
              aria-labelledby="recovery-setting-title"
              aria-describedby="recovery-setting-detail"
              checked={props.recoveryEnabled}
              disabled={props.recoveryBusy}
              onchange={(event) =>
                props.onRecoveryEnabled(event.currentTarget.checked)}
            /> <span aria-hidden="true"></span>
          </label>
        </section>
      </section>
      <section class="settings-side">
        <EngineDiagnostics
          language={props.language}
          initial={props.dependencies}
        />
        <section
          class="update-settings-card"
          aria-labelledby="update-settings-title"
        >
          <div class="update-settings-heading">
            <div>
              <span class="label"> {t(props.language, "update.label")} </span>
              <strong id="update-settings-title">
                {t(props.language, "update.settingsTitle")}
              </strong>
            </div>
            {#if props.updateStatus === "available"}<b
                >{t(props.language, "update.availableBadge")}</b
              >{/if}
          </div>
          <p>
            {t(props.language, "update.currentVersion", {
              version: props.currentVersion,
            })}
          </p>
          {#if props.updateInfo}<div class="update-version-inline">
              <span>
                {t(props.language, "update.latestVersion", {
                  version: props.updateInfo.version,
                })}
              </span> <strong>{props.updateInfo.version}</strong>
            </div>{:else}<p>
              {props.updateStatus === "notAvailable"
                ? t(props.language, "update.none")
                : t(props.language, "update.unknown")}
            </p>{/if}
          {#if props.updateStatus === "installing"}<UpdateProgress
              language={props.language}
              progress={props.updateDownloadProgress}
              size={props.updateDownloadSize}
            />{/if}
          <div class="settings-actions">
            {#if props.updateInfo}<Button
                variant="unstyled"
                size="inherit"
                class="primary-button"
                type="button"
                disabled={props.updateStatus === "installing"}
                onclick={props.onInstallUpdate}
              >
                {props.updateStatus === "installing"
                  ? t(props.language, "update.installing")
                  : t(props.language, "update.install")}
              </Button>{:else}<Button
                variant="unstyled"
                size="inherit"
                class="secondary-button"
                type="button"
                disabled={props.updateStatus === "checking" ||
                  !props.internetAvailable}
                onclick={props.onCheckForUpdate}
              >
                {props.updateStatus === "checking"
                  ? t(props.language, "update.checking")
                  : t(props.language, "update.check")}
              </Button>{/if}
          </div>
          {#if !props.internetAvailable}<small
              >{t(props.language, "update.internetRequired")}</small
            >{/if}
        </section>
      </section>
    </div>
  </ModalSurface>{/if}
