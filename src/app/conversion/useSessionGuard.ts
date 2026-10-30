import { useEffect, useRef, useState } from "react";
import { useStableEvent } from "../useStableEvent";

type SessionAction = () => void | Promise<void>;

export function useSessionGuard(options: {
  isConverting: boolean;
  isExporting: boolean;
  hasUnexportedResults: boolean;
  cancelAndWait(): Promise<void>;
  onError(): void;
}) {
  const [pendingAction, setPendingAction] = useState<SessionAction | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const confirming = useRef(false);
  const needsConfirmation = options.isConverting || options.hasUnexportedResults;
  const request = useStableEvent((action: SessionAction) => {
    if (confirming.current) return;
    if (options.isExporting) { options.onError(); return; }
    if (needsConfirmation) setPendingAction(() => action);
    else void Promise.resolve(action()).catch(options.onError);
  });
  const dismiss = () => { if (!confirming.current) setPendingAction(null); };
  const confirm = async () => {
    if (!pendingAction || confirming.current) return;
    confirming.current = true;
    setIsConfirming(true);
    try {
      await options.cancelAndWait();
      await pendingAction();
      setPendingAction(null);
    } catch {
      options.onError();
    } finally {
      confirming.current = false;
      setIsConfirming(false);
    }
  };
  const handleClose = useStableEvent((event: { preventDefault(): void }, close: SessionAction) => {
    if (!needsConfirmation && !options.isExporting) return;
    event.preventDefault();
    request(close);
  });

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (needsConfirmation || options.isExporting) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [needsConfirmation, options.isExporting]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const nativeWindow = getCurrentWindow();
      const stop = await nativeWindow.onCloseRequested((event) => {
        handleClose(event, () => nativeWindow.destroy());
      });
      if (disposed) stop();
      else unlisten = stop;
    }).catch(options.onError);
    return () => { disposed = true; unlisten?.(); };
  }, [handleClose]);

  return { request, dismiss, confirm, isOpen: Boolean(pendingAction), isConfirming };
}
