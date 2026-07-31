import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { ClipboardFileInput, ExportResult, FileDescription, TargetFormat } from "../../lib/api";
import { pluralKey, t, translateCategory, type LanguageCode, type TranslationKey } from "../../i18n";
import type { ConversionIntent, ExportKind, FileItem } from "../types";

export const welcomeStorageKey = "multi-converter-welcome-seen";
export const notificationsStorageKey = "multi-converter-notifications-enabled";
export const feedbackPrivacyStorageKey = "multi-converter-feedback-public-warning-seen";
export const appModeStorageKey = "multi-converter-app-mode";

const isTauriRuntime = "__TAURI_INTERNALS__" in window;
const maxClipboardMemoryFileBytes = 128 * 1024 * 1024;

export function isAvailableTarget(target: TargetFormat) {
  return target.engineAvailable && (!target.availability || target.availability === "available");
}

export function hasAvailableDescriptionTargets(file: FileDescription) {
  return file.targets.some(isAvailableTarget);
}

export function hasAvailableTargets(file: FileItem) {
  return hasAvailableDescriptionTargets(file);
}

export function displayFileName(file: FileDescription) {
  const extension = (file.extension || file.sourceFormat || "").replace(/^\./, "").toLowerCase();
  if (!extension) return file.name;
  const suffix = `.${extension}`;
  return file.name.toLowerCase().endsWith(suffix) ? file.name.slice(0, -suffix.length) || file.name : file.name;
}

export function availableTargetsForFile(file: FileItem) {
  return file.targets.filter(isAvailableTarget);
}

export function targetForFormat(file: FileItem, format: string) {
  return availableTargetsForFile(file).find((target) => target.format === format) ?? null;
}

export function updateFileSelection(file: FileItem, format: string): FileItem {
  const isCached = isConvertedForSelection({ ...file, selectedFormat: format });
  return {
    ...file,
    selectedFormat: format,
    progress: isCached ? 100 : 0,
    phase: isCached ? "phase.done" : "phase.waiting",
    status: isCached ? "done" : "ready",
    result: isCached ? file.result : null,
    convertedFormat: isCached ? file.convertedFormat : null,
    error: null,
  };
}

export function fileGroupId(file: FileDescription) {
  if (file.categoryId === "documents") return "documents";
  if (file.categoryId === "images") return "images";
  if (file.categoryId === "audio") return "audio";
  if (file.categoryId === "video") return "video";
  return "other";
}

export function uniqueIntents(intents: ConversionIntent[]) {
  const byFormat = new Map<string, ConversionIntent>();
  intents.forEach((intent) => {
    const existing = byFormat.get(intent.target.format);
    if (!existing || intent.priority < existing.priority) byFormat.set(intent.target.format, intent);
  });
  return Array.from(byFormat.values()).sort((a, b) => a.priority - b.priority || a.target.rank - b.target.rank);
}

export function groupedFormatOptions(file: FileItem) {
  const intents = uniqueIntents(availableTargetsForFile(file).map((target) => intentForTarget(target, file)));
  const recommendedFormats = new Set(preferredFormatsForGroup(fileGroupId(file), [file]));
  const recommended = intents.filter((intent) => recommendedFormats.has(intent.target.format) || isPrimaryIntent(intent));
  const recommendedFormatSet = new Set(recommended.map((intent) => intent.target.format));
  return {
    recommended,
    other: intents.filter((intent) => !recommendedFormatSet.has(intent.target.format)),
  };
}

function preferredFormatsForGroup(groupId: string, files: FileItem[]) {
  const formats = new Set(files.map((file) => file.sourceFormat).filter((format): format is string => Boolean(format)));
  if (groupId === "images") return formats.size === 1 && (formats.has("jpg") || formats.has("jpeg")) ? ["png", "webp"] : ["jpg", "png", "webp"];
  if (groupId === "audio") return formats.size === 1 && formats.has("mp3") ? ["m4a", "wav", "flac"] : ["mp3", "m4a", "wav"];
  if (groupId === "video") return formats.size === 1 && formats.has("mp4") ? ["webm", "mov", "mkv"] : ["mp4", "webm", "mov"];
  if (groupId === "documents") {
    const onlyPdf = files.length > 0 && files.every((file) => file.sourceFormat === "pdf");
    if (onlyPdf) return ["txt", "html", "png", "jpg"];
    return formats.size === 1 && formats.has("pdf") ? ["txt", "odt", "docx"] : ["pdf", "odt", "txt", "docx"];
  }
  return [];
}

function isPrimaryIntent(intent: ConversionIntent) {
  return intent.priority < 50;
}

function intentForTarget(target: TargetFormat, file: FileDescription): ConversionIntent {
  const format = target.format;
  let labelKey: TranslationKey = "format.intent.other";
  let priority = 90 + target.rank;

  if (target.categoryId === "audio" && file.categoryId === "video") {
    labelKey = "format.intent.audio";
    priority = formatPopularityPriority("audio", format, target.rank);
  } else if (target.categoryId === "video" && file.categoryId !== "video") {
    labelKey = "format.intent.video";
    priority = formatPopularityPriority("video", format, target.rank);
  } else if (format === "jpg" || format === "mp4" || format === "mp3") {
    labelKey = "format.intent.compatibility";
    priority = 10;
  } else if (format === "webp") {
    labelKey = "format.intent.lighter";
    priority = file.categoryId === "images" ? formatPopularityPriority("images", format, target.rank) : 80 + target.rank;
  } else if (format === "png") {
    labelKey = "format.intent.quality";
    priority = file.categoryId === "images" || file.sourceFormat === "pdf" ? formatPopularityPriority("images", format, target.rank) : 80 + target.rank;
  } else if (format === "pdf") {
    labelKey = "format.intent.document";
    priority = 10;
  } else if (format === "txt") {
    labelKey = "format.intent.text";
    priority = file.categoryId === "documents" ? formatPopularityPriority("documents", format, target.rank) : file.sourceFormat === "pdf" ? 10 : 35;
  } else if (format === "odt" || format === "docx" || format === "rtf") {
    labelKey = "format.intent.editable";
    priority = file.categoryId === "documents" ? formatPopularityPriority("documents", format, target.rank) : 80 + target.rank;
  } else if (format === "m4a" || format === "wav" || format === "flac" || format === "ogg") {
    labelKey = "format.intent.audio";
    priority = formatPopularityPriority("audio", format, target.rank);
  } else if (format === "webm" || format === "mov" || format === "mkv") {
    labelKey = "format.intent.video";
    priority = formatPopularityPriority("video", format, target.rank);
  } else if (file.categoryId === "documents" && ["html", "csv", "json", "xml"].includes(format)) {
    priority = formatPopularityPriority("documents", format, target.rank);
  }

  return { id: `${labelKey}-${target.format}`, labelKey, target, priority };
}

function formatPopularityPriority(groupId: string, format: string, fallbackRank: number) {
  const preferred: Record<string, string[]> = {
    documents: ["pdf", "docx", "odt", "rtf", "txt", "html", "csv", "json", "xml"],
    images: ["jpg", "jpeg", "png", "webp", "tiff", "bmp", "ico"],
    video: ["mp4", "webm", "mkv", "mov", "avi", "wmv", "mpg"],
    audio: ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "wma"],
  };
  const index = preferred[groupId]?.indexOf(format.toLowerCase()) ?? -1;
  return index >= 0 ? 10 + index : 80 + fallbackRank;
}

export function fileSummary(files: FileDescription[], language: LanguageCode) {
  const counts = new Map<string, number>();
  files.forEach((file) => {
    const groupId = fileGroupId(file);
    const label = (groupId === "other" ? t(language, "category.unknown") : translateCategory(language, groupId)).toLowerCase();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return Array.from(counts, ([label, count]) => `${count} ${label}`).join(", ");
}

export function fileCountText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.count", count), { count });
}

export function uploadedFilesSummary(language: LanguageCode, count: number, summary: string) {
  return t(language, "upload.summaryByCategory", { countText: fileCountText(language, count), summary });
}

export function readyCountText(language: LanguageCode, ready: number, total: number) {
  return t(language, pluralKey("progress.readyCount", ready), { ready, total });
}

export function importAnalyzingText(language: LanguageCode, count: number) {
  return t(language, "import.analyzingCount", { countText: fileCountText(language, count) });
}

export function importedFilesText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.added", count), { count });
}

export function convertedFilesText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.converted", count), { count });
}

export function exportedFilesText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.exported", count), { count });
}

export function skippedFilesText(language: LanguageCode, count: number) {
  return t(language, pluralKey("file.skipped", count), { count });
}

export function progressErrorSummary(language: LanguageCode, completed: number, failed: number) {
  return t(language, "progress.errorSummary", { completed, failed });
}

export function progressSummaryText(language: LanguageCode, completed: number, failed: number, canceled: number, total: number) {
  const parts = [convertedFilesText(language, completed)];
  if (failed > 0) parts.push(t(language, "progress.summaryFailed", { count: failed }));
  if (canceled > 0) parts.push(t(language, pluralKey("file.canceled", canceled), { count: canceled }));
  parts.push(t(language, "progress.ofTotal", { total: fileCountText(language, total) }));
  return parts.join(t(language, "progress.summarySeparator"));
}

export function isConvertedForSelection(file: FileItem) {
  return Boolean(file.selectedFormat && file.result && file.status === "done" && file.convertedFormat === file.selectedFormat);
}

export function shouldConvertFile(file: FileItem) {
  return Boolean(file.selectedFormat && file.status !== "unsupported" && !isConvertedForSelection(file));
}

export function shouldReconvertCleanedResult(file: FileItem, isTempOutputCleaned: boolean) {
  return Boolean(isTempOutputCleaned && file.selectedFormat && file.status === "done");
}

export function getConvertedOutputPaths(files: FileItem[]) {
  return files.filter((file) => file.status === "done" && file.result?.outputPath).map((file) => file.result!.outputPath);
}

export function isEditablePasteTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

export function clipboardEventFiles(data: DataTransfer | null) {
  if (!data) return [];
  const files = Array.from(data.files);
  if (files.length) return files;
  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

export function clipboardFileName(mimeType: string) {
  const extensions: Record<string, string> = {
    "text/plain": "txt", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    "image/bmp": "bmp", "image/tiff": "tiff", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/ogg": "ogg", "audio/flac": "flac", "audio/mp4": "m4a", "video/mp4": "mp4", "video/quicktime": "mov",
    "video/webm": "webm", "video/x-matroska": "mkv",
  };
  return `clipboard-${new Date().toISOString().replace(/[:.]/g, "-")}.${extensions[mimeType.toLowerCase()] ?? "bin"}`;
}

export async function toClipboardFileInput(file: File): Promise<ClipboardFileInput> {
  if (file.size > maxClipboardMemoryFileBytes) throw new Error("clipboard.fileTooLarge");
  return {
    name: file.name || clipboardFileName(file.type),
    mimeType: file.type || "application/octet-stream",
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
  };
}

export async function notifyConversionFinished(language: LanguageCode, failed: boolean, enabled: boolean) {
  if (!isTauriRuntime || !enabled) return;
  try {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) permissionGranted = (await requestPermission()) === "granted";
    if (!permissionGranted) return;
    sendNotification({
      title: "Multi-Converter",
      body: failed ? t(language, "notice.conversionsFinishedWithErrors") : t(language, "notice.conversionsFinished"),
    });
  } catch (error) {
    console.warn("System notification failed", error);
  }
}

export function exportNoticeMessage(language: LanguageCode, kind: ExportKind, result: ExportResult) {
  if (kind === "downloads") {
    return result.destinationCreated ? t(language, "notice.exportDownloadsCreated") : t(language, "notice.exportDownloadsReady");
  }
  const folder = result.destinationDir.split(/[\\/]/).filter(Boolean).pop() || result.destinationDir;
  return result.destinationCreated
    ? t(language, "notice.exportFolderCreated", { folder })
    : t(language, "notice.exportFolderReady", { folder });
}

export function getSelectedTarget(file: FileItem) {
  return file.targets.find((target) => target.format === file.selectedFormat) ?? null;
}

export function conversionLabel(file: FileItem, language: LanguageCode) {
  const target = getSelectedTarget(file);
  if (!target) return t(language, "common.notConverted");
  return `${target.label} · ${translateCategory(language, target.categoryId || target.category)}`;
}

export function compactFileMeta(file: FileDescription, language: LanguageCode) {
  const extension = file.extension || t(language, "format.noExtension");
  const warnings = file.warnings?.map((warning) => fileWarningText(warning.code, language)) ?? [];
  return [extension, formatBytes(file.size, language), ...warnings].join(" · ");
}

function fileWarningText(code: string, language: LanguageCode) {
  if (code === "largeFile") return t(language, "file.warningLarge");
  if (code === "memoryIntensive") return t(language, "file.warningMemory");
  if (code === "partialFolderImport") return t(language, "file.warningPartialImport");
  return t(language, "file.warningGeneric");
}

function formatBytes(bytes: number, language: LanguageCode) {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${t(language, "common.bytes")}`;
  const units = [t(language, "common.bytes"), t(language, "common.kilobytes"), t(language, "common.megabytes"), t(language, "common.gigabytes")];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

export function readStoredNotificationsEnabled() {
  return localStorage.getItem(notificationsStorageKey) !== "false";
}

export function readStoredFeedbackPrivacyAccepted() {
  return localStorage.getItem(feedbackPrivacyStorageKey) === "true";
}

export function shouldShowWelcome() {
  if (import.meta.env.DEV) return new URLSearchParams(window.location.search).get("mockWelcomeSeen") !== "1";
  return false;
}

export function conversionConcurrency(jobs: FileItem[]) {
  const total = jobs.length;
  if (total <= 1) return total;
  const cores = Math.max(1, Math.floor(navigator.hardwareConcurrency || 2));
  const totalBytes = jobs.reduce((sum, file) => sum + Math.max(0, file.size || 0), 0);
  const largestBytes = jobs.reduce((max, file) => Math.max(max, file.size || 0), 0);
  const videoJobs = jobs.filter((file) => file.categoryId === "video").length;
  const heavyBatch = totalBytes > 1.4 * 1024 * 1024 * 1024 || largestBytes > 850 * 1024 * 1024;
  const coreLimit = cores <= 2 ? 1 : cores <= 4 ? 2 : cores <= 8 ? 3 : 4;
  const videoLimit = videoJobs > 0 ? Math.max(1, Math.min(coreLimit, Math.floor(cores / 3) || 1)) : coreLimit;
  const heavyLimit = heavyBatch ? Math.min(videoJobs > 0 ? 1 : 2, videoLimit) : videoLimit;
  return Math.max(1, Math.min(total, heavyLimit));
}

export async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}
