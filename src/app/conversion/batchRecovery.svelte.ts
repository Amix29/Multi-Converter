import { resolveStateUpdate, type StateSetter } from "../../lib/stateUpdate";
import { untrack } from "svelte";

import { api, type QualityProfile, type RecoveryPlan, type RecoveryState } from "../../lib/api";
import { t, type LanguageCode } from "../../i18n";
import type { FileItem, NoticeTone } from "../types";
import { recoveryPlan } from "./recoveryModel";

export function createBatchRecovery(options: {
  language: LanguageCode;
  showNotice(tone: NoticeTone, message: string): void;
}) {
  let enabled = $state.raw(false);
  const setEnabled: StateSetter<boolean> = (value) => {
    enabled = resolveStateUpdate(value, enabled);
  };
  let isLoading = $state.raw(true);
  const setLoading: StateSetter<boolean> = (value) => {
    isLoading = resolveStateUpdate(value, isLoading);
  };
  let isBusy = $state.raw(false);
  const setBusy: StateSetter<boolean> = (value) => {
    isBusy = resolveStateUpdate(value, isBusy);
  };
  let pending = $state.raw<RecoveryPlan | null>(null);
  const setPending: StateSetter<typeof pending> = (value) => {
    pending = resolveStateUpdate(value, pending);
  };
  const enabledRef = { current: false };
  const busy = { current: false };
  const change: { current: Promise<RecoveryState> | null | null } = {
    current: null,
  };
  const initialLoad: { current: Promise<void> | null | null } = {
    current: null,
  };
  const fail = () =>
    options.showNotice("error", t(options.language, "recovery.failed"));
  const skipped = (count: number) => {
    if (count)
      options.showNotice(
        "info",
        t(options.language, "recovery.skipped", { count }),
      );
  };
  $effect(() => {
    void [fail, skipped];
    return untrack(() => {
      let disposed = false;
      initialLoad.current = api
        .loadBatchRecovery()
        .then((state) => {
          if (disposed) return;
          enabledRef.current = state.enabled;
          setEnabled(state.enabled);
          setPending(state.plan);
          skipped(state.skippedFiles);
        })
        .catch(() => {
          if (!disposed) fail();
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        });
      return () => {
        disposed = true;
      };
    });
  });
  async function configure(value: boolean) {
    if (busy.current) return;
    busy.current = true;
    setBusy(true);
    const request = api.setBatchRecoveryEnabled(value);
    change.current = request;
    try {
      const state = await request;
      enabledRef.current = state.enabled;
      setEnabled(state.enabled);
      setPending(state.plan);
    } catch {
      fail();
    } finally {
      busy.current = false;
      change.current = null;
      setBusy(false);
    }
  }
  async function saveBeforeBatch(files: FileItem[], quality: QualityProfile) {
    if (initialLoad.current) await initialLoad.current;
    if (change.current) await change.current.catch(() => null);
    if (!enabledRef.current) return;
    try {
      const plan = recoveryPlan(files, quality);
      const saved = await api.saveBatchRecovery(plan);
      if (enabledRef.current && saved < plan.files.length) fail();
    } catch {
      fail();
    }
  }
  async function clear() {
    if (change.current) await change.current.catch(() => null);
    if (busy.current) return;
    busy.current = true;
    setBusy(true);
    try {
      await api.clearBatchRecovery();
      setPending(null);
    } catch {
      fail();
    } finally {
      busy.current = false;
      setBusy(false);
    }
  }
  async function restore() {
    if (busy.current) return null;
    busy.current = true;
    setBusy(true);
    try {
      const state = await api.loadBatchRecovery();
      if (!state.plan) {
        setPending(null);
        if (state.skippedFiles) skipped(state.skippedFiles);
        else
          options.showNotice(
            "info",
            t(options.language, "recovery.unavailable"),
          );
        return null;
      }
      const descriptions = await api.describePaths(
        state.plan.files.map((file) => file.path),
      );
      skipped(state.skippedFiles + descriptions.rejected.length);
      setPending(null);
      return descriptions.files.length
        ? { descriptions: descriptions.files, plan: state.plan }
        : null;
    } catch {
      fail();
      return null;
    } finally {
      busy.current = false;
      setBusy(false);
    }
  }
  return {
    get enabled() {
      return enabled;
    },
    get isLoading() {
      return isLoading;
    },
    get isBusy() {
      return isBusy;
    },
    get pending() {
      return pending;
    },
    configure,
    saveBeforeBatch,
    clear,
    restore,
  };
}
