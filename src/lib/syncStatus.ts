"use client";

import { useSyncExternalStore } from "react";

export type SyncStatus = "idle" | "loading" | "ready" | "error";
let status: SyncStatus = "idle";
const listeners = new Set<() => void>();

export function setSyncStatus(next: SyncStatus) {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener();
}

export const getSyncStatus = () => status;
export function useSyncStatus() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    getSyncStatus,
    () => "idle" as const
  );
}
