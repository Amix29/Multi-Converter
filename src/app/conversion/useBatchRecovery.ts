import { useEffect, useRef, useState } from "react";
import { api, type QualityProfile, type RecoveryPlan, type RecoveryState } from "../../lib/api";
import { t, type LanguageCode } from "../../i18n";
import type { FileItem, NoticeTone } from "../types";
import { useStableEvent } from "../useStableEvent";
import { recoveryPlan } from "./recoveryModel";

export function useBatchRecovery(options: { language: LanguageCode; showNotice(tone: NoticeTone, message: string): void }) {
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [isBusy, setBusy] = useState(false);
  const [pending, setPending] = useState<RecoveryPlan | null>(null);
  const enabledRef = useRef(false);
  const busy = useRef(false);
  const change = useRef<Promise<RecoveryState> | null>(null);
  const initialLoad = useRef<Promise<void> | null>(null);
  const fail = useStableEvent(() => options.showNotice("error", t(options.language, "recovery.failed")));
  const skipped = useStableEvent((count: number) => { if (count) options.showNotice("info", t(options.language, "recovery.skipped", { count })); });

  useEffect(() => {
    let disposed = false;
    initialLoad.current = api.loadBatchRecovery().then((state) => {
      if (disposed) return;
      enabledRef.current = state.enabled; setEnabled(state.enabled); setPending(state.plan); skipped(state.skippedFiles);
    }).catch(() => { if (!disposed) fail(); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [fail, skipped]);

  async function configure(value: boolean) {
    if (busy.current) return;
    busy.current = true; setBusy(true);
    const request = api.setBatchRecoveryEnabled(value); change.current = request;
    try {
      const state = await request;
      enabledRef.current = state.enabled; setEnabled(state.enabled); setPending(state.plan);
    } catch { fail(); }
    finally { busy.current = false; change.current = null; setBusy(false); }
  }

  async function saveBeforeBatch(files: FileItem[], quality: QualityProfile) {
    if (initialLoad.current) await initialLoad.current;
    if (change.current) await change.current.catch(() => null);
    if (!enabledRef.current) return;
    try {
      const plan = recoveryPlan(files, quality);
      const saved = await api.saveBatchRecovery(plan);
      if (enabledRef.current && saved < plan.files.length) fail();
    } catch { fail(); }
  }

  async function clear() {
    if (change.current) await change.current.catch(() => null);
    if (busy.current) return;
    busy.current = true; setBusy(true);
    try { await api.clearBatchRecovery(); setPending(null); }
    catch { fail(); }
    finally { busy.current = false; setBusy(false); }
  }

  async function restore() {
    if (busy.current) return null;
    busy.current = true; setBusy(true);
    try {
      const state = await api.loadBatchRecovery();
      if (!state.plan) {
        setPending(null);
        if (state.skippedFiles) skipped(state.skippedFiles);
        else options.showNotice("info", t(options.language, "recovery.unavailable"));
        return null;
      }
      const descriptions = await api.describePaths(state.plan.files.map((file) => file.path));
      skipped(state.skippedFiles + descriptions.rejected.length);
      setPending(null);
      return descriptions.files.length ? { descriptions: descriptions.files, plan: state.plan } : null;
    } catch { fail(); return null; }
    finally { busy.current = false; setBusy(false); }
  }

  return { enabled, isLoading, isBusy, pending, configure, saveBeforeBatch, clear, restore };
}
