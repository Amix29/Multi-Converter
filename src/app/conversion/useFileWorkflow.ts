import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { api, type FileDescription } from "../../lib/api";
import { translateBackendMessage, type LanguageCode } from "../../i18n";
import type { FileItem, ImportFeedback, NoticeTone, Step } from "../types";
import {
  applyProgressBatch,
  preferredImportOrigin,
  selectUniqueImports,
  withoutUnsupportedFiles,
} from "./largeListModel";
import {
  clamp,
  clipboardEventFiles,
  clipboardFileName,
  hasAvailableDescriptionTargets,
  isEditablePasteTarget,
  skippedFilesText,
  targetForFormat,
  toClipboardFileInput,
  updateFileSelection,
} from "./model";

export function useFileWorkflow(options: {
  language: LanguageCode;
  showNotice(tone: NoticeTone, message: string): void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const canImportDroppedFiles = step === 1 || step === 2;
  const canImportDroppedFilesRef = useRef(canImportDroppedFiles);
  const languageRef = useRef(options.language);
  const showNoticeRef = useRef(options.showNotice);
  const progressQueueRef = useRef(new Map<string, { jobId: string; progress: number; phase: string }>());
  const progressFrameRef = useRef<number | null>(null);

  useEffect(() => {
    languageRef.current = options.language;
    showNoticeRef.current = options.showNotice;
  }, [options.language, options.showNotice]);

  useEffect(() => {
    canImportDroppedFilesRef.current = canImportDroppedFiles;
    if (!canImportDroppedFiles) setIsDragOver(false);
  }, [canImportDroppedFiles]);

  useEffect(() => {
    if (!importFeedback || importFeedback.state !== "done") return;
    const timeout = window.setTimeout(() => setImportFeedback(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [importFeedback]);

  const addFiles = useCallback((incomingFiles: FileDescription[]) => {
    let limitNoticeScheduled = false;
    setFiles((existing) => {
      const incomingByPath = new Map(incomingFiles.filter(Boolean).map((file) => [file.path, file]));
      const promotedExisting = existing.map((file) => {
        const candidate = incomingByPath.get(file.path);
        const importOrigin = preferredImportOrigin(file.importOrigin, candidate?.importOrigin);
        return importOrigin !== file.importOrigin ? { ...file, importOrigin } : file;
      });
      const selection = selectUniqueImports(promotedExisting, incomingFiles);
      if (selection.rejected > 0 && !limitNoticeScheduled) {
        limitNoticeScheduled = true;
        window.queueMicrotask(() => showNoticeRef.current(
          "error",
          skippedFilesText(languageRef.current, selection.rejected),
        ));
      }
      const incoming = selection.accepted
        .map<FileItem>((file) => ({
          ...file,
          id: crypto.randomUUID(),
          jobId: crypto.randomUUID(),
          selectedFormat: null,
          progress: 0,
          phase: "phase.waiting",
          status: hasAvailableDescriptionTargets(file) ? "pending" : "unsupported",
          result: null,
          convertedFormat: null,
          error: null,
        }));
      return incoming.length ? [...promotedExisting, ...incoming] : promotedExisting;
    });
  }, []);

  const importFiles = useCallback(async (
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
        setImportFeedback({ state: "done", count: descriptions.length, visible: true });
      }
    } catch (error) {
      window.clearTimeout(timer);
      setImportFeedback(null);
      showNoticeRef.current(
        "error",
        translateBackendMessage(languageRef.current, error instanceof Error ? error.message : String(error || "")),
      );
    }
  }, [addFiles]);

  const describePaths = useCallback(async (paths: string[]) => {
    const result = await api.describePaths(paths);
    if (result.rejected.length) {
      const details = result.rejected.slice(0, 5).map((failure) =>
        `${failure.path.split(/[\\/]/).pop()}: ${translateBackendMessage(languageRef.current, failure.message)}`,
      ).join(" · ");
      showNoticeRef.current("error", `${skippedFilesText(languageRef.current, result.rejected.length)} ${details}`);
    } else if (!result.files.length && paths.length) {
      showNoticeRef.current("error", skippedFilesText(languageRef.current, paths.length));
    }
    return result.files;
  }, []);

  const addFilePaths = useCallback(async (paths: string[]) => {
    await importFiles(paths.length, async () => {
      return describePaths(paths);
    });
  }, [describePaths, importFiles]);

  const importClipboardContent = useCallback(async (pastedFiles: File[], text: string) => {
    const nativePaths = pastedFiles
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    const localFiles = pastedFiles.filter((file) => !(file as File & { path?: string }).path);
    if (!localFiles.length && !nativePaths.length && text.trim()) {
      localFiles.push(new File([text], clipboardFileName("text/plain"), { type: "text/plain" }));
    }
    await importFiles(nativePaths.length + localFiles.length, async () => {
      const savedPaths = localFiles.length
        ? await api.saveClipboardFiles(await Promise.all(localFiles.map(toClipboardFileInput)))
        : [];
      const paths = [...nativePaths, ...savedPaths];
      return describePaths(paths);
    });
  }, [describePaths, importFiles]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (!canImportDroppedFilesRef.current || isEditablePasteTarget(event.target)) return;
      const pastedFiles = clipboardEventFiles(event.clipboardData);
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!pastedFiles.length && !text.trim()) return;
      event.preventDefault();
      void importClipboardContent(pastedFiles, text);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importClipboardContent]);

  useEffect(() => {
    let progressUnlisten: (() => void) | undefined;
    let dropUnlisten: (() => void) | undefined;
    let disposed = false;

    void api.onProgress((payload) => {
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
        if (updates.length) setFiles((items) => applyProgressBatch(items, updates));
      });
    }).then((unlisten) => {
      if (disposed) unlisten();
      else progressUnlisten = unlisten;
    });

    void api.onFileDrop(async (paths) => {
      if (!paths.length) return;
      if (canImportDroppedFilesRef.current) {
        await addFilePaths(paths);
      }
    }).then((unlisten) => {
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
  }, [addFilePaths]);

  const addPickedFiles = useCallback(async () => {
    try {
      const paths = await api.pickFilePaths();
      if (paths.length) await addFilePaths(paths);
    } catch (error) {
      setImportFeedback(null);
      showNoticeRef.current(
        "error",
        translateBackendMessage(languageRef.current, error instanceof Error ? error.message : String(error || "")),
      );
    }
  }, [addFilePaths]);

  const handleHtmlDrop = useCallback(async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (!canImportDroppedFiles) return;
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (paths.length) await addFilePaths(paths);
  }, [addFilePaths, canImportDroppedFiles]);

  const resetFiles = useCallback(() => setFiles([]), []);
  const removeUnsupported = useCallback(() => setFiles((items) => withoutUnsupportedFiles(items)), []);
  const removeFile = useCallback((fileId: string) => {
    setFiles((items) => {
      const next = items.filter((file) => file.id !== fileId);
      if (!next.length) setStep(1);
      return next;
    });
  }, []);
  const applyFileFormat = useCallback((fileId: string, format: string) => {
    setFiles((items) => items.map((file) => file.id === fileId && targetForFormat(file, format)
      ? updateFileSelection(file, format)
      : file));
  }, []);
  const applyCompatibleFormat = useCallback((sourceFileId: string, format: string) => {
    setFiles((items) => items.map((file) => file.id !== sourceFileId
      && targetForFormat(file, format)
      && file.selectedFormat !== format
      ? updateFileSelection(file, format)
      : file));
  }, []);

  return {
    addPickedFiles,
    applyCompatibleFormat,
    applyFileFormat,
    files,
    handleHtmlDrop,
    importFeedback,
    isDragOver,
    removeFile,
    removeUnsupported,
    resetFiles,
    setFiles,
    setIsDragOver,
    setStep,
    step,
  };
}
