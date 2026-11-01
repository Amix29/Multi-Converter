import { api, createExportEntries, type ExportEntryV1, type ExportResult } from "../../lib/api";
import { t, translateBackendMessage, type LanguageCode } from "../../i18n";
import type { ExportKind, FileItem, NoticeTone } from "../types";
import type { StateSetter } from "../../lib/stateUpdate";
import { batchReportRows } from "./batchReport";
import { exportNoticeMessage } from "./model";
function convertedExportPlan(files: FileItem[]) {
  const results = files.flatMap((file) =>
    file.status === "done" && file.result?.outputPath
      ? [{ outputPath: file.result.outputPath, source: file }]
      : [],
  );
  return {
    entries: createExportEntries(results),
    paths: results.map(({ outputPath }) => outputPath),
  };
}
export function createOutputActions(context: {
  files: FileItem[];
  language: LanguageCode;
  outputDir: string | null;
  isConverting: boolean;
  isExporting: boolean;
  isTempOutputCleaned: boolean;
  exportResult: ExportResult | null;
  setExportResult: StateSetter<ExportResult | null>;
  setIsExporting: StateSetter<boolean>;
  setExportedPaths: StateSetter<Set<string>>;
  showNotice(tone: NoticeTone, message: string): void;
}) {
  const { setExportResult, setIsExporting, setExportedPaths } = context;
  async function finalizeSuccessfulExport(
    kind: ExportKind,
    result: ExportResult,
  ) {
    setExportResult(result);
    setExportedPaths(
      (paths) =>
        new Set([...paths, ...convertedExportPlan(context.files).paths]),
    );
    context.showNotice(
      "success",
      exportNoticeMessage(context.language, kind, result),
    );
  }
  async function exportResults(
    kind: ExportKind,
    exporter: (
      paths: string[],
      entries: ExportEntryV1[],
    ) => Promise<ExportResult | null>,
  ) {
    const { entries, paths } = convertedExportPlan(context.files);
    if (
      !paths.length ||
      context.isConverting ||
      context.isExporting ||
      context.isTempOutputCleaned
    )
      return;
    setIsExporting(true);
    context.showNotice(
      "info",
      kind === "downloads"
        ? t(context.language, "notice.exportDownloadsPreparing")
        : t(context.language, "notice.exportFolderChoosing"),
    );
    try {
      const result = await exporter(paths, entries);
      if (!result) {
        context.showNotice(
          "info",
          t(context.language, "notice.exportCancelled"),
        );
        return;
      }
      await finalizeSuccessfulExport(kind, result);
    } catch (error) {
      context.showNotice(
        "error",
        translateBackendMessage(
          context.language,
          error instanceof Error ? error.message : String(error || ""),
        ),
      );
    } finally {
      setIsExporting(false);
    }
  }
  async function exportResultsToFolder() {
    const { entries, paths } = convertedExportPlan(context.files);
    if (
      !paths.length ||
      context.isConverting ||
      context.isExporting ||
      context.isTempOutputCleaned
    )
      return;
    setIsExporting(true);
    context.showNotice(
      "info",
      t(context.language, "notice.exportFolderChoosing"),
    );
    try {
      const destinationDir = await api.pickOutputFolder();
      if (!destinationDir) {
        context.showNotice(
          "info",
          t(context.language, "notice.exportCancelled"),
        );
        return;
      }
      await finalizeSuccessfulExport(
        "folder",
        await api.exportToFolder(
          paths,
          destinationDir,
          context.outputDir,
          entries,
        ),
      );
    } catch (error) {
      context.showNotice(
        "error",
        translateBackendMessage(
          context.language,
          error instanceof Error ? error.message : String(error || ""),
        ),
      );
    } finally {
      setIsExporting(false);
    }
  }
  async function revealCurrentFolder() {
    if (!context.exportResult) return;
    const target =
      context.exportResult.files.length === 1
        ? context.exportResult.files[0]
        : context.exportResult.destinationDir;
    try {
      await api.revealFile(target);
    } catch {
      context.showNotice("error", t(context.language, "notice.revealFailed"));
    }
  }
  async function exportBatchReport() {
    if (
      !context.outputDir ||
      context.isConverting ||
      context.isExporting ||
      context.isTempOutputCleaned
    )
      return;
    setIsExporting(true);
    try {
      const destination = await api.pickOutputFolder();
      if (!destination) {
        context.showNotice(
          "info",
          t(context.language, "notice.exportCancelled"),
        );
        return;
      }
      await api.exportBatchReport(
        context.outputDir,
        destination,
        batchReportRows(context.files),
      );
      context.showNotice("success", t(context.language, "notice.reportSaved"));
    } catch (error) {
      context.showNotice(
        "error",
        translateBackendMessage(
          context.language,
          error instanceof Error ? error.message : String(error || ""),
        ),
      );
    } finally {
      setIsExporting(false);
    }
  }
  return {
    exportResults,
    exportResultsToFolder,
    revealCurrentFolder,
    exportBatchReport,
  };
}
