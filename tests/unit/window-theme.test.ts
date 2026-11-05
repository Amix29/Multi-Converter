import { afterEach, expect, test, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  createWindowThemeSynchronizer,
  syncNativeWindowTheme,
  type WindowThemeRequest,
} from "../../src/lib/windowTheme";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => vi.unstubAllGlobals());

const light: WindowThemeRequest = {
  preference: "light",
  background: "#f5f3ec",
  foreground: "#1d241f",
};
const dark: WindowThemeRequest = {
  preference: "dark",
  background: "#111710",
  foreground: "#eef2e8",
};

test("rapid theme changes finish in request order and suppress duplicate media events", async () => {
  let finishFirst: (() => void) | undefined;
  const first = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const apply = vi
    .fn()
    .mockImplementationOnce(() => first)
    .mockResolvedValue(undefined);
  const synchronize = createWindowThemeSynchronizer(apply);
  const initial = synchronize(light);
  const latest = synchronize(dark);
  expect(synchronize({ ...dark })).toBe(latest);
  await Promise.resolve();
  expect(apply.mock.calls).toEqual([[light]]);
  finishFirst?.();
  await Promise.all([initial, latest]);
  expect(apply.mock.calls).toEqual([[light], [dark]]);
});

test("a failed native update does not prevent retrying the same preference", async () => {
  const apply = vi
    .fn()
    .mockRejectedValueOnce(new Error("window not ready"))
    .mockResolvedValue(undefined);
  const synchronize = createWindowThemeSynchronizer(apply);
  await expect(synchronize(light)).rejects.toThrow("window not ready");
  await synchronize(light);
  expect(apply).toHaveBeenCalledTimes(2);
});

test("browser preview does not invoke a native command or read native colors", async () => {
  vi.stubGlobal("window", {});
  const readColors = vi.fn();
  vi.stubGlobal("getComputedStyle", readColors);
  await syncNativeWindowTheme("light");
  expect(readColors).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

test("native updates read current design tokens and retain the system preference", async () => {
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  vi.stubGlobal("document", { documentElement: {} });
  let palette = { "--bg": " #f5f3ec ", "--fg": " #1d241f " };
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (name: keyof typeof palette) => palette[name],
  }));
  await syncNativeWindowTheme("system");
  expect(invoke).toHaveBeenLastCalledWith("sync_window_theme", {
    ...light,
    preference: "system",
  });
  palette = { "--bg": "#111710", "--fg": "#eef2e8" };
  await syncNativeWindowTheme("dark");
  expect(invoke).toHaveBeenLastCalledWith("sync_window_theme", dark);
});
