import { useEffect, useRef, useState, type DragEvent } from "react";
import { api, type AppMode, type FileDescription } from "../../lib/api";
import { translateBackendMessage, type LanguageCode } from "../../i18n";
import type { FileItem, ImportFeedback, NoticeTone, Step } from "../types";
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
  appMode: AppMode;
  language: LanguageCode;
  showNotice(tone: NoticeTone, message: string): void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editorDropRequest, setEditorDropRequest] = useState<{ id: number; paths: string[] } | null>(null);
  const canImportDroppedFiles = options.appMode === "converter" && (step === 1 || step === 2);
  const canImportDroppedFilesRef = useRef(canImportDroppedFiles);
  const appModeRef = useRef(options.appMode);

  useEffect(() => {
    appModeRef.current = options.appMode;
  }, [options.appMode]);

  useEffect(() => {
    canImportDroppedFilesRef.current = canImportDroppedFiles;
    if (!canImportDroppedFiles) setIsDragOver(false);
  }, [canImportDroppedFiles]);

  useEffect(() => {
    if (!importFeedback || importFeedback.state !== "done") return;
    const timeout = window.setTimeout(() => setImportFeedback(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [importFeedback]);

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
  }, [options.language]);

  useEffect(() => {
    let progressUnlisten: (() => void) | undefined;
    let dropUnlisten: (() => void) | undefined;
    let disposed = false;

    api.onProgress((payload) => {
      setFiles((items) => items.map((file) => file.jobId === payload.jobId
        ? { ...file, progress: Math.max(clamp(file.progress, 0, 100), clamp(payload.progress, 0, 100)), phase: payload.phase || "phase.conversion" }
        : file));
    }).then((unlisten) => {
      if (disposed) unlisten();
      else progressUnlisten = unlisten;
    });

    api.onFileDrop(async (paths) => {
      if (!paths.length) return;
      if (appModeRef.current === "editor") {
        setEditorDropRequest({ id: Date.now(), paths });
        return;
      }
      if (canImportDroppedFilesRef.current) await addFilePaths(paths);
    }).then((unlisten) => {
      if (disposed) unlisten();
      else dropUnlisten = unlisten;
    });

    return () => {
      disposed = true;
      progressUnlisten?.();
      dropUnlisten?.();
    };
  }, [options.language]);

  function addFiles(incomingFiles: FileDescription[]) {
    setFiles((existing) => {
      const knownPaths = new Set(existing.map((file) => file.path));
      const incoming = incomingFiles
        .filter((file) => file && !knownPaths.has(file.path))
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
      return [...existing, ...incoming];
    });
  }

  async function addFilePaths(paths: string[]) {
    await importFiles(paths.length, async () => {
      const descriptions = await api.describePaths(paths);
      if (!descriptions.length && paths.length) options.showNotice("error", skippedFilesText(options.language, paths.length));
      return descriptions;
    });
  }

  async function addPickedFiles() {
    try {
      const paths = await api.pickFilePaths();
      if (paths.length) await addFilePaths(paths);
    } catch (error) {
      setImportFeedback(null);
      options.showNotice("error", translateBackendMessage(options.language, error instanceof Error ? error.message : String(error || "")));
    }
  }

  async function importClipboardContent(pastedFiles: File[], text: string) {
    const nativePaths = pastedFiles
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    const localFiles = pastedFiles.filter((file) => !(file as File & { path?: string }).path);
    if (!localFiles.length && !nativePaths.length && text.trim()) {
      localFiles.push(new File([text], clipboardFileName("text/plain"), { type: "text/plain" }));
    }
    await importFiles(nativePaths.length + localFiles.length, async () => {
      const savedPaths = localFiles.length ? await api.saveClipboardFiles(await Promise.all(localFiles.map(toClipboardFileInput))) : [];
      const paths = [...nativePaths, ...savedPaths];
      const descriptions = await api.describePaths(paths);
      if (!descriptions.length && paths.length) options.showNotice("error", skippedFilesText(options.language, paths.length));
      return descriptions;
    });
  }

  async function importFiles(count: number | null, loader: () => Promise<FileDescription[]>) {
    let feedbackShown = false;
    const timer = window.setTimeout(() => {
      feedbackShown = true;
      setImportFeedback({ state: "analyzing", count, visible: true });
    }, 280);
    try {
      const descriptions = await loader();
      window.clearTimeout(timer);
      if (descriptions.length) addFiles(descriptions);
      if (feedbackShown || descriptions.length > 6) setImportFeedback({ state: "done", count: descriptions.length, visible: true });
    } catch (error) {
      window.clearTimeout(timer);
      setImportFeedback(null);
      options.showNotice("error", translateBackendMessage(options.language, error instanceof Error ? error.message : String(error || "")));
    }
  }

  async function handleHtmlDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (!canImportDroppedFiles) return;
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (paths.length) await addFilePaths(paths);
  }

  function resetFiles() {
    setFiles([]);
  }

  function removeFile(fileId: string) {
    setFiles((items) => {
      const next = items.filter((file) => file.id !== fileId);
      if (!next.length) setStep(1);
      return next;
    });
  }

  function applyFileFormat(fileId: string, format: string) {
    setFiles((items) => items.map((file) => file.id === fileId && targetForFormat(file, format) ? updateFileSelection(file, format) : file));
  }

  return {
    addPickedFiles,
    applyFileFormat,
    editorDropRequest,
    files,
    handleHtmlDrop,
    importFeedback,
    isDragOver,
    removeFile,
    resetFiles,
    setFiles,
    setIsDragOver,
    setStep,
    step,
  };
}
