import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const key = "multi-converter.theme";

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(key);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch { return "system"; }
}

export function initializeTheme() {
  const preference = readPreference();
  document.documentElement.dataset.theme = preference === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : preference;
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = preference === "system"
        ? system.matches ? "dark" : "light" : preference;
    };
    apply();
    system.addEventListener("change", apply);
    try { localStorage.setItem(key, preference); } catch { /* Theme remains usable without storage. */ }
    return () => system.removeEventListener("change", apply);
  }, [preference]);
  return { preference, setPreference };
}
