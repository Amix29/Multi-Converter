import type { ConversionResult, FileDescription, TargetFormat } from "../lib/api";
import type { TranslationKey } from "../i18n";

export type Step = 1 | 2 | 3;
export type Status = "pending" | "ready" | "queued" | "working" | "canceling" | "canceled" | "done" | "error" | "unsupported";
export type NoticeTone = "info" | "success" | "error";
export type ExportKind = "downloads" | "folder";
export type FeedbackKind = "bug" | "feature" | "other";
export type ImportFeedback =
  | { state: "analyzing"; count: number | null; visible: boolean }
  | { state: "done"; count: number; visible: boolean }
  | null;

export interface FileItem extends FileDescription {
  id: string;
  jobId: string;
  selectedFormat: string | null;
  progress: number;
  phase: string;
  status: Status;
  result: ConversionResult | null;
  convertedFormat: string | null;
  error: string | null;
}

export interface ConversionIntent {
  id: string;
  labelKey: TranslationKey;
  target: TargetFormat;
  priority: number;
}

export type Notice = { id: number; tone: NoticeTone; message: string };

export const statusLabelKeys: Record<Status, TranslationKey> = {
  pending: "status.pending",
  ready: "status.ready",
  queued: "status.queued",
  working: "status.working",
  canceling: "status.canceling",
  canceled: "status.canceled",
  done: "status.done",
  error: "status.error",
  unsupported: "status.unsupported",
};
