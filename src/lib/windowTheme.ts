import { invoke } from "@tauri-apps/api/core";
import type { ThemePreference } from "../app/theme.svelte.js";

export interface WindowThemeRequest {
  preference: ThemePreference;
  background: string;
  foreground: string;
}

type ApplyWindowTheme = (request: WindowThemeRequest) => Promise<void>;

// Serialize native updates so a slow earlier change cannot overwrite the latest choice.
export function createWindowThemeSynchronizer(apply: ApplyWindowTheme) {
  let tail: Promise<void> = Promise.resolve();
  let lastRequest: string | null = null;
  let lastUpdate = tail;

  return (request: WindowThemeRequest): Promise<void> => {
    const identity = JSON.stringify(request);
    if (identity === lastRequest) return lastUpdate;
    lastRequest = identity;
    const update = tail.then(() => apply(request));
    lastUpdate = update;
    // The caller reports errors; recover the queue so the next choice can still apply.
    tail = update.catch(() => {
      if (lastUpdate === update) lastRequest = null;
    });
    return update;
  };
}

const synchronize = createWindowThemeSynchronizer((request) =>
  invoke<void>("sync_window_theme", { ...request }),
);

export function syncNativeWindowTheme(
  preference: ThemePreference,
): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return Promise.resolve();
  const colors = getComputedStyle(document.documentElement);
  return synchronize({
    preference,
    background: colors.getPropertyValue("--bg").trim(),
    foreground: colors.getPropertyValue("--fg").trim(),
  });
}
