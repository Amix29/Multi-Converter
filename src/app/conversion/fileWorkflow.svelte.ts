import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";
import { untrack } from "svelte";

import { api, type FileDescription, type MediaMode } from "../../lib/api";
import { updateMediaMode } from "./mediaOptions";
import { translateBackendMessage, type LanguageCode } from "../../i18n";
import type { FileItem, ImportFeedback, NoticeTone, Step } from "../types";
import { applyProgressBatch, preferredImportOrigin, selectUniqueImports, withoutUnsupportedFiles } from "./largeListModel";
import { clamp, clipboardEventFiles, clipboardFileName, hasAvailableDescriptionTargets, isEditablePasteTarget, skippedFilesText, targetForFormat, toClipboardFileInput, updateFileSelection } from "./model";

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
      const incoming = selection.accepted.map<FileItem>((file) => ({
        ...file,
        id: crypto.randomUUID(),
        jobId: crypto.randomUUID(),
        selectedFormat: null,
        progress: 0,
        phase: "phase.waiting",
        status: hasAvailableDescriptionTargets(file)
          ? "pending"
          : "unsupported",
        result: null,
        convertedFormat: null,
        error: null,
      }));
      return incoming.length
        ? [...promotedExisting, ...incoming]
        : promotedExisting;
    });
  };
  const importFiles = async (
    count: number | null,
    loader: () => Promise<FileDescription[]>,
  ) => {
    let feedbackShown = false;
    const timer = window.setTimeout(() => {
      feedbackShown = true;
      setImportFeedback({ state: "analyzing", count, visible: true });
    }, 280);
    try {
      const descriptions = await loader();
      window.clearTimeout(timer);
      if (descriptions.length) addFiles(descriptions);
      if (feedbackShown || descriptions.length > 6) {
        setImportFeedback({
          state: "done",
          count: descriptions.length,
          visible: true,
        });
      }
    } catch (error) {
      window.clearTimeout(timer);
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
  const describePaths = async (paths: string[]) => {
    const result = await api.describePaths(paths);
    if (result.rejected.length) {
      const details = result.rejected
        .slice(0, 5)
        .map(
          (failure) =>
            `${failure.path.split(/[\\/]/).pop()}: ${translateBackendMessage(options.language, failure.message)}`,
        )
        .join(" · ");
      options.showNotice(
        "error",
        `${skippedFilesText(options.language, result.rejected.length)} ${details}`,
      );
    } else if (!result.files.length && paths.length) {
      options.showNotice(
        "error",
        skippedFilesText(options.language, paths.length),
      );
    }
    return result.files;
  };
  const addFilePaths = async (paths: string[]) => {
    await importFiles(paths.length, async () => {
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
    await importFiles(nativePaths.length + localFiles.length, async () => {
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
  const removeUnsupported = () =>
    setFiles((items) => withoutUnsupportedFiles(items));
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
    get removeUnsupported() {
      return removeUnsupported;
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
