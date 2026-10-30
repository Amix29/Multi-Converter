import type { BatchReportRow } from "../../lib/api";
import type { FileItem } from "../types";

export function batchReportRows(files: FileItem[]): BatchReportRow[] {
  return files.filter((file) => file.selectedFormat).map((file) => {
    const result = file.status === "done" ? file.result : null;
    return {
      sourceName: file.name,
      targetFormat: file.selectedFormat as string,
      status: result?.outputPath ? "done" : file.status === "error" ? "error" : file.status === "canceled" ? "canceled" : "notRun",
      engine: result?.engine ?? null,
      qualityProfile: result?.mediaMode === "copy" ? null : result?.qualityProfile ?? null,
      mediaMode: result?.mediaMode ?? file.mediaMode ?? null,
      inputBytes: result?.inputBytes ?? file.size,
      durationMs: result?.durationMs ?? null,
      warningCodes: [...new Set(result?.warnings?.map((warning) => warning.code) ?? [])].slice(0, 32),
      outputPath: result?.outputPath ?? null,
    };
  });
}
