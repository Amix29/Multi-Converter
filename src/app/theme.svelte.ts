import { resolveStateUpdate, type StateSetter } from "../lib/stateUpdate";
import { untrack } from "svelte";
import { syncNativeWindowTheme } from "../lib/windowTheme";

export type ThemePreference = "system" | "light" | "dark";
const key = "multi-converter.theme";
function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(key);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}
export function initializeTheme() {
  const preference = readPreference();
  document.documentElement.dataset.theme =
    preference === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
}
export function createTheme() {
  let preference = $state.raw<ThemePreference>(readPreference());
  const setPreference: StateSetter<typeof preference> = (value) => {
    preference = resolveStateUpdate(value, preference);
  };
  $effect(() => {
    void [preference];
    return untrack(() => {
      const system = matchMedia("(prefers-color-scheme: dark)");
      const apply = () => {
        document.documentElement.dataset.theme =
          preference === "system"
            ? system.matches
              ? "dark"
              : "light"
            : preference;
        void syncNativeWindowTheme(preference).catch((error: unknown) => {
          console.warn("Native window theme update failed", error);
        });
      };
      apply();
      system.addEventListener("change", apply);
      try {
        localStorage.setItem(key, preference);
      } catch {
        /* Theme remains usable without storage. */
      }
      return () => system.removeEventListener("change", apply);
    });
  });
  return {
    get preference() {
      return preference;
    },
    setPreference,
  };
}
