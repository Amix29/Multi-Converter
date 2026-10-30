import type { FileDescription, QualityProfile, RecoveryPlan } from "../../lib/api";
import type { FileItem } from "../types";
import { supportsStreamCopy } from "./mediaOptions";

export function recoveryPlan(files: FileItem[], qualityProfile: QualityProfile): RecoveryPlan {
  return { schemaVersion: 1, qualityProfile, files: files.filter((file) => file.selectedFormat).map((file) => ({
    path: file.path, targetFormat: file.selectedFormat as string, mediaMode: file.mediaMode ?? "convert", importOrigin: file.importOrigin ?? null,
  })) };
}

export function restoredFiles(descriptions: FileDescription[], plan: RecoveryPlan): FileItem[] {
  const selections = new Map(plan.files.map((file) => [file.path, file]));
  return descriptions.map((description) => {
    const saved = selections.get(description.path);
    const selectedFormat = description.targets.find((target) => target.format === saved?.targetFormat && target.engineAvailable && target.availability === "available")?.format ?? null;
    const hasAvailableTargets = description.targets.some((target) => target.engineAvailable && target.availability === "available");
    const file: FileItem = {
      ...description, importOrigin: saved?.importOrigin ?? description.importOrigin,
      id: crypto.randomUUID(), jobId: "", selectedFormat, mediaMode: "convert", progress: 0, phase: "phase.waiting",
      status: selectedFormat ? "ready" : hasAvailableTargets ? "pending" : "unsupported",
      result: null, convertedFormat: null, error: null,
    };
    if (saved?.mediaMode === "copy" && supportsStreamCopy(file)) file.mediaMode = "copy";
    return file;
  });
}
