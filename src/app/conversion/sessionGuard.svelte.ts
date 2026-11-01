import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";
import { untrack } from "svelte";

type SessionAction = () => void | Promise<void>;
export function createSessionGuard(options: {
  isConverting: boolean;
  isExporting: boolean;
  hasUnexportedResults: boolean;
  cancelAndWait(): Promise<void>;
  onError(): void;
}) {
  let pendingAction = $state.raw<SessionAction | null>(null);
  const setPendingAction: StateSetter<typeof pendingAction> = (value) => {
    pendingAction = resolveStateUpdate(value, pendingAction);
  };
  let isConfirming = $state.raw(false);
  const setIsConfirming: StateSetter<boolean> = (value) => {
    isConfirming = resolveStateUpdate(value, isConfirming);
  };
  const confirming = { current: false };
  let needsConfirmation = $derived(
    options.isConverting || options.hasUnexportedResults,
  );
  const request = (action: SessionAction) => {
    if (confirming.current) return;
    if (options.isExporting) {
      options.onError();
      return;
    }
    if (needsConfirmation) setPendingAction(() => action);
    else void Promise.resolve(action()).catch(options.onError);
  };
  const dismiss = () => {
    if (!confirming.current) setPendingAction(null);
  };
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
  const handleClose = (
    event: {
      preventDefault(): void;
    },
    close: SessionAction,
  ) => {
    if (!needsConfirmation && !options.isExporting) return;
    event.preventDefault();
    request(close);
  };
  $effect(() => {
    void [needsConfirmation, options.isExporting];
    return untrack(() => {
      const beforeUnload = (event: BeforeUnloadEvent) => {
        if (needsConfirmation || options.isExporting) {
          event.preventDefault();
          event.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", beforeUnload);
      return () => window.removeEventListener("beforeunload", beforeUnload);
    });
  });
  $effect(() => {
    void [handleClose];
    return untrack(() => {
      if (!("__TAURI_INTERNALS__" in window)) return;
      let disposed = false;
      let unlisten: (() => void) | undefined;
      void import("@tauri-apps/api/window")
        .then(async ({ getCurrentWindow }) => {
          const nativeWindow = getCurrentWindow();
          const stop = await nativeWindow.onCloseRequested((event) => {
            handleClose(event, () => nativeWindow.destroy());
          });
          if (disposed) stop();
          else unlisten = stop;
        })
        .catch(options.onError);
      return () => {
        disposed = true;
        unlisten?.();
      };
    });
  });
  return {
    get request() {
      return request;
    },
    get dismiss() {
      return dismiss;
    },
    get confirm() {
      return confirm;
    },
    get isOpen() {
      return Boolean(pendingAction);
    },
    get isConfirming() {
      return isConfirming;
    },
  };
}
