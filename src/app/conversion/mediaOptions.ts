import type { FileItem } from "../types";
import type { MediaMode } from "../../lib/api";

export function supportsStreamCopy(file: Pick<FileItem, "categoryId" | "selectedFormat">) {
  return file.categoryId === "video" && ["mp4", "mov", "mkv", "webm"].includes(file.selectedFormat ?? "");
}

export function updateMediaMode(file: FileItem, mediaMode: MediaMode): FileItem {
  if (mediaMode === "copy" && !supportsStreamCopy(file)) return file;
  if ((file.mediaMode ?? "convert") === mediaMode) return file;
  return { ...file, mediaMode, result: null, convertedFormat: null, status: "ready",
    progress: 0, phase: "phase.waiting", jobId: "", error: null };
}
