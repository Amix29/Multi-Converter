import type { RecoveryPlan, RecoveryState } from "./contracts";

const key = "multi-converter-preview-recovery";

function read(): RecoveryState & { savedAt?: number } {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as (RecoveryState & { savedAt: number }) | null;
    if (!value || typeof value.enabled !== "boolean") return { enabled: false, plan: null, skippedFiles: 0 };
    if (value.plan && (value.plan.schemaVersion !== 1 || !Array.isArray(value.plan.files) || value.plan.files.length > 2_000)) value.plan = null;
    if (!value.savedAt || Date.now() - value.savedAt >= 86_400_000 || value.savedAt > Date.now()) value.plan = null;
    return value;
  } catch { return { enabled: false, plan: null, skippedFiles: 0 }; }
}

export const previewRecovery = {
  async load(): Promise<RecoveryState> { return read(); },
  async setEnabled(enabled: boolean): Promise<RecoveryState> {
    const state = { ...read(), enabled };
    if (!enabled) state.plan = null;
    localStorage.setItem(key, JSON.stringify(state));
    return state;
  },
  async save(plan: RecoveryPlan): Promise<number> {
    const state = read();
    if (!state.enabled) return 0;
    localStorage.setItem(key, JSON.stringify({ ...state, plan, savedAt: Date.now() }));
    return plan.files.length;
  },
  async clear(): Promise<boolean> {
    localStorage.setItem(key, JSON.stringify({ ...read(), plan: null }));
    return true;
  },
};
