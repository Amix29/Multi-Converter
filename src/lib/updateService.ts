import { check } from "@tauri-apps/plugin-updater";
import { t, translateBackendMessage, type LanguageCode } from "../i18n";

export type UpdateStatus = "idle" | "checking" | "available" | "notAvailable" | "installing" | "error";

export interface AppUpdateInfo {
  version: string;
  currentVersion: string;
  date: string | null;
  body: string | null;
}

export interface UpdateDownloadSize {
  downloaded: number;
  total: number | null;
}

const updateInstallStorageKey = "multi-converter-update-installation";
const releaseApiBaseUrl = "https://api.github.com/repos/Amix29/Multi-Converter/releases/tags";
const releaseNotesTimeoutMs = 8000;

export const repositoryUrl = "https://github.com/Amix29/Multi-Converter";
export const releaseBaseUrl = `${repositoryUrl}/releases`;
export const latestReleaseUrl = `${releaseBaseUrl}/latest`;
export const updateCheckTimeoutMs = 20000;
export const minimumReportVersion = "1.0.4";

export function releaseTag(version: string) {
  const normalized = version.trim();
  return normalized.toLowerCase().startsWith("v") ? normalized : `v${normalized}`;
}

export function releasePageUrl(version: string) {
  return `${releaseBaseUrl}/tag/${encodeURIComponent(releaseTag(version))}`;
}

export async function fetchReleaseBodyForVersion(version: string, fallback: string | null) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), releaseNotesTimeoutMs);
  try {
    const response = await fetch(`${releaseApiBaseUrl}/${encodeURIComponent(releaseTag(version))}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { body?: unknown };
    const body = typeof data.body === "string" ? data.body.trim() : "";
    return body || fallback;
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function checkForUpdateWithTimeout() {
  return withTimeout(check({ timeout: updateCheckTimeoutMs }), updateCheckTimeoutMs + 2500, "update-check-timeout");
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

export function rememberUpdateInstallation(version: string, progress: number | null, size: UpdateDownloadSize | null) {
  localStorage.setItem(
    updateInstallStorageKey,
    JSON.stringify({
      version,
      progress,
      downloaded: size?.downloaded ?? null,
      total: size?.total ?? null,
      updatedAt: Date.now(),
    }),
  );
}

export function readPendingUpdateInstallation(): { version: string; progress: number | null; size: UpdateDownloadSize | null } | null {
  try {
    const raw = localStorage.getItem(updateInstallStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; progress?: unknown; downloaded?: unknown; total?: unknown };
    if (typeof parsed.version !== "string" || !parsed.version.trim()) return null;
    const progress = typeof parsed.progress === "number" && Number.isFinite(parsed.progress) ? clamp(parsed.progress, 0, 100) : null;
    const downloaded = typeof parsed.downloaded === "number" && Number.isFinite(parsed.downloaded) ? Math.max(0, parsed.downloaded) : null;
    const total = typeof parsed.total === "number" && Number.isFinite(parsed.total) && parsed.total > 0 ? parsed.total : null;
    return { version: parsed.version, progress, size: downloaded === null ? null : { downloaded, total } };
  } catch {
    return null;
  }
}

export function clearPendingUpdateInstallation() {
  localStorage.removeItem(updateInstallStorageKey);
}

export function updateCheckErrorMessage(language: LanguageCode, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (isUpdateCheckTimeout(error)) {
    return t(language, "update.none");
  }
  if (isMissingUpdateReleaseError(error)) {
    return t(language, "update.remoteUnavailable");
  }
  return translateBackendMessage(language, message);
}

export function isUpdateCheckTimeout(error: unknown) {
  return error instanceof Error && error.message === "update-check-timeout";
}

export function isMissingUpdateReleaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  return normalized.includes("valid release json") || normalized.includes("latest.json");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
