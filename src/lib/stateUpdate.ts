export type StateUpdate<T> = T | ((current: T) => T);
export type StateSetter<T> = (value: StateUpdate<T>) => void;
export function resolveStateUpdate<T>(value: StateUpdate<T>, current: T): T {
  return typeof value === "function"
    ? (value as (current: T) => T)(current)
    : value;
}
