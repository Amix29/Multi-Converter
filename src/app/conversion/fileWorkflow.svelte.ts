import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";
import { untrack } from "svelte";

import { api, type FileDescription, type MediaMode } from "../../lib/api";
import { updateMediaMode } from "./mediaOptions";
import { translateBackendMessage, type LanguageCode } from "../../i18n";
import type { FileItem, ImportFeedback, NoticeTone, Step } from "../types";
import {
  applyProgressBatch,
  preferredImportOrigin,
  selectUniqueImports,
} from "./largeListModel";
import {
  clamp,
  clipboardEventFiles,
  clipboardFileName,
  unsupportedFilesText,
  isEditablePasteTarget,
  skippedFilesText,
  targetForFormat,
  toClipboardFileInput,
  updateFileSelection,
} from "./model";

export function createFileWorkflow(options: {
  language: LanguageCode;
  showNotice(tone: NoticeTone, message: string): void;
}) {
  let step = $state.raw<Step>(1);
  function setStep(value: Step | ((current: Step) => Step)) {
    step =
      typeof value === "function"
        ? (value as (current: typeof step) => typeof step)(step)
        : value;
    if (step === 3) isDragOver = false;
  }
  let files = $state.raw<FileItem[]>([]);
  const setFiles: StateSetter<typeof files> = (value) => {
    files = resolveStateUpdate(value, files);
  };
  let importFeedback = $state.raw<ImportFeedback>(null);
  const setImportFeedback: StateSetter<typeof importFeedback> = (value) => {
    importFeedback = resolveStateUpdate(value, importFeedback);
  };
  let isDragOver = $state.raw(false);
  const setIsDragOver: StateSetter<boolean> = (value) => {
    isDragOver = resolveStateUpdate(value, isDragOver);
  };
  let canImportDroppedFiles = $derived(step === 1 || step === 2);
  const progressQueueRef = {
    current: new Map<
      string,
      {
        jobId: string;
        progress: number;
        phase: string;
      }
    >(),
  };
  const progressFrameRef: { current: number | null | null } = { current: null };
  $effect(() => {
    void [importFeedback];
    return untrack(() => {
      if (!importFeedback || importFeedback.state !== "done") return;
      const timeout = window.setTimeout(() => setImportFeedback(null), 2600);
      return () => window.clearTimeout(timeout);
    });
  });
  const addFiles = (incomingFiles: FileDescription[]) => {
    let added = 0;
    let limitNoticeScheduled = false;
    setFiles((existing) => {
      const incomingByPath = new Map(
        incomingFiles.filter(Boolean).map((file) => [file.path, file]),
      );
      const promotedExisting = existing.map((file) => {
        const candidate = incomingByPath.get(file.path);
        const importOrigin = preferredImportOrigin(
          file.importOrigin,
          candidate?.importOrigin,
        );
        return importOrigin !== file.importOrigin
          ? { ...file, importOrigin }
          : file;
      });
      const selection = selectUniqueImports(promotedExisting, incomingFiles);
      if (selection.rejected > 0 && !limitNoticeScheduled) {
        limitNoticeScheduled = true;
        window.queueMicrotask(() =>
          options.showNotice(
            "error",
            skippedFilesText(options.language, selection.rejected),
          ),
        );
      }
      added = selection.accepted.length;
      const incoming = selection.accepted.map<FileItem>((file) => ({
        ...file,
        id: crypto.randomUUID(),
        jobId: crypto.randomUUID(),
        selectedFormat: null,
        progress: 0,
        phase: "phase.waiting",
        status: "pending",
        result: null,
        convertedFormat: null,
        error: null,
      }));
      return incoming.length
        ? [...promotedExisting, ...incoming]
        : promotedExisting;
    });
    return added;
  };
  let importsInFlight = 0;
  let addedInBatch = 0;
  let feedbackTimer: number;
  const importFiles = async (
    count: number | null,
    loader: () => Promise<FileDescription[]>,
  ) => {
    if (importsInFlight++ === 0) {
      addedInBatch = 0;
      setImportFeedback(null);
      feedbackTimer = window.setTimeout(() => {
        setImportFeedback({ state: "analyzing", count, visible: true });
      }, 280);
    }
    try {
      const descriptions = await loader();
      addedInBatch += addFiles(descriptions);
    } catch (error) {
      options.showNotice(
        "error",
        translateBackendMessage(
          options.language,
          error instanceof Error ? error.message : String(error || ""),
        ),
      );
    } finally {
      if (--importsInFlight === 0) {
        window.clearTimeout(feedbackTimer);
        const showDone = addedInBatch > 0 && (importFeedback?.state === "analyzing" || addedInBatch > 6);
        setImportFeedback(showDone ? { state: "done", count: addedInBatch, visible: true } : null);
      }
    }
  };
  const describePaths = async (paths: string[]) => {
    const result = await api.describePaths(paths);
    const notices: string[] = [];
    if (result.unsupportedCount) notices.push(unsupportedFilesText(options.language, result.unsupportedCount));
    if (result.rejected.length) {
      const details = result.rejected
        .slice(0, 5)
        .map(
          (failure) =>
            `${failure.path.split(/[\\/]/).pop()}: ${translateBackendMessage(options.language, failure.message)}`,
        )
        .join(" · ");
      notices.push(`${skippedFilesText(options.language, result.rejected.length)} ${details}`);
    } else if (!result.unsupportedCount && !result.files.length && paths.length) {
      notices.push(skippedFilesText(options.language, paths.length));
    }
    if (notices.length) options.showNotice(result.rejected.length ? "error" : "info", notices.join(" "));
    return result.files;
  };
  const addFilePaths = async (paths: string[]) => {
    await importFiles(null, async () => {
      return describePaths(paths);
    });
  };
  const importClipboardContent = async (pastedFiles: File[], text: string) => {
    const nativePaths = pastedFiles
      .map(
        (file) =>
          (
            file as File & {
              path?: string;
            }
          ).path,
      )
      .filter((path): path is string => Boolean(path));
    const localFiles = pastedFiles.filter(
      (file) =>
        !(
          file as File & {
            path?: string;
          }
        ).path,
    );
    if (!localFiles.length && !nativePaths.length && text.trim()) {
      localFiles.push(
        new File([text], clipboardFileName("text/plain"), {
          type: "text/plain",
        }),
      );
    }
    await importFiles(nativePaths.length ? null : localFiles.length, async () => {
      const savedPaths = localFiles.length
        ? await api.saveClipboardFiles(
            await Promise.all(localFiles.map(toClipboardFileInput)),
          )
        : [];
      const paths = [...nativePaths, ...savedPaths];
      return describePaths(paths);
    });
  };
  $effect(() => {
    void [importClipboardContent];
    return untrack(() => {
      function onPaste(event: ClipboardEvent) {
        if (!canImportDroppedFiles || isEditablePasteTarget(event.target))
          return;
        const pastedFiles = clipboardEventFiles(event.clipboardData);
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!pastedFiles.length && !text.trim()) return;
        event.preventDefault();
        void importClipboardContent(pastedFiles, text);
      }
      window.addEventListener("paste", onPaste);
      return () => window.removeEventListener("paste", onPaste);
    });
  });
  $effect(() => {
    void [addFilePaths];
    return untrack(() => {
      let progressUnlisten: (() => void) | undefined;
      let dropUnlisten: (() => void) | undefined;
      let disposed = false;
      void api
        .onProgress((payload) => {
          if (disposed) return;
          progressQueueRef.current.set(payload.jobId, {
            jobId: payload.jobId,
            progress: clamp(payload.progress, 0, 100),
            phase: payload.phase || "phase.conversion",
          });
          if (progressFrameRef.current !== null) return;
          progressFrameRef.current = window.requestAnimationFrame(() => {
            progressFrameRef.current = null;
            const updates = [...progressQueueRef.current.values()];
            progressQueueRef.current.clear();
            if (!disposed && updates.length)
              setFiles((items) => applyProgressBatch(items, updates));
          });
        })
        .then((unlisten) => {
          if (disposed) unlisten();
          else progressUnlisten = unlisten;
        });
      void api
        .onFileDrop(async (paths) => {
          if (disposed || !paths.length) return;
          if (canImportDroppedFiles) {
            await addFilePaths(paths);
          }
        })
        .then((unlisten) => {
          if (disposed) unlisten();
          else dropUnlisten = unlisten;
        });
      return () => {
        disposed = true;
        if (progressFrameRef.current !== null) {
          window.cancelAnimationFrame(progressFrameRef.current);
          progressFrameRef.current = null;
        }
        progressQueueRef.current.clear();
        progressUnlisten?.();
        dropUnlisten?.();
      };
    });
  });
  const addPickedFiles = async () => {
    try {
      const paths = await api.pickFilePaths();
      if (paths.length) await addFilePaths(paths);
    } catch (error) {
      setImportFeedback(null);
      options.showNotice(
        "error",
        translateBackendMessage(
          options.language,
          error instanceof Error ? error.message : String(error || ""),
        ),
      );
    }
  };
  const handleHtmlDrop = async (
    event: DragEvent & { currentTarget: HTMLElement },
  ) => {
    event.preventDefault();
    setIsDragOver(false);
    if (!canImportDroppedFiles) return;
    const paths = Array.from(event.dataTransfer?.files ?? [])
      .map(
        (file) =>
          (
            file as File & {
              path?: string;
            }
          ).path,
      )
      .filter((path): path is string => Boolean(path));
    if (paths.length) await addFilePaths(paths);
  };
  const resetFiles = () => setFiles([]);
  const removeFile = (fileId: string) => {
    setFiles((items) => {
      const next = items.filter((file) => file.id !== fileId);
      if (!next.length) setStep(1);
      return next;
    });
  };
  const applyFileFormat = (fileId: string, format: string) => {
    setFiles((items) =>
      items.map((file) =>
        file.id === fileId && targetForFormat(file, format)
          ? updateFileSelection(file, format)
          : file,
      ),
    );
  };
  const applyMediaMode = (fileId: string, mode: MediaMode) => {
    setFiles((items) =>
      items.map((file) =>
        file.id === fileId ? updateMediaMode(file, mode) : file,
      ),
    );
  };
  const applyCompatibleFormat = (sourceFileId: string, format: string) => {
    setFiles((items) =>
      items.map((file) =>
        file.id !== sourceFileId &&
        targetForFormat(file, format) &&
        file.selectedFormat !== format
          ? updateFileSelection(file, format)
          : file,
      ),
    );
  };
  return {
    get addPickedFiles() {
      return addPickedFiles;
    },
    get applyCompatibleFormat() {
      return applyCompatibleFormat;
    },
    get applyFileFormat() {
      return applyFileFormat;
    },
    get applyMediaMode() {
      return applyMediaMode;
    },
    get files() {
      return files;
    },
    get handleHtmlDrop() {
      return handleHtmlDrop;
    },
    get importFeedback() {
      return importFeedback;
    },
    get isDragOver() {
      return isDragOver;
    },
    get removeFile() {
      return removeFile;
    },
    get resetFiles() {
      return resetFiles;
    },
    setFiles,
    setIsDragOver,
    setStep,
    get step() {
      return step;
    },
  };
}
