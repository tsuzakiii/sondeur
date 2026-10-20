import { getSignedInUserId } from "./authState";
import { getSupabase } from "./supabase/client";
import { validLocale, type Locale } from "./localeConfig";

type PendingLocale = { locale: Locale; revision: string };
const pendingMemory = new Map<string, PendingLocale>();
const flights = new Map<string, Promise<boolean>>();
const storageKey = (userId: string) => `sondeur.locale.pending.${userId}`;

function pending(userId: string): PendingLocale | null {
  const inMemory = pendingMemory.get(userId);
  if (inMemory) return inMemory;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const value = JSON.parse(raw);
      if (validLocale(value?.locale) && typeof value.revision === "string") return value;
    }
  } catch { /* The in-memory choice still works when storage is blocked. */ }
  return null;
}

export function pendingAccountLocale(userId: string): Locale | null {
  return pending(userId)?.locale ?? null;
}

/** Record the choice before starting a request, so a reload can resume the save. */
export function stageAccountLocale(userId: string, locale: Locale) {
  const value = { locale, revision: crypto.randomUUID() };
  pendingMemory.set(userId, value);
  try { localStorage.setItem(storageKey(userId), JSON.stringify(value)); } catch {}
}

/** Serialize writes and only clear the exact choice acknowledged by the server. */
export function syncAccountLocale(userId: string): Promise<boolean> {
  const existing = flights.get(userId);
  if (existing) return existing;
  const sync = async () => {
    try {
      for (;;) {
        if (getSignedInUserId() !== userId) return false;
        const choice = pending(userId);
        if (!choice) return true;
        const supabase = getSupabase();
        if (!supabase) return false;
        // PostgREST builders are lazy thenables: `void rpc(...)` sends nothing.
        const { error } = await supabase.rpc("update_locale", { p_locale: choice.locale })
          .abortSignal(AbortSignal.timeout(10000));
        if (error || getSignedInUserId() !== userId) return false;
        if (pending(userId)?.revision === choice.revision) {
          pendingMemory.delete(userId);
          try { localStorage.removeItem(storageKey(userId)); } catch {}
          return true;
        }
      }
    } catch {
      return false;
    }
  };
  const flight = sync().finally(() => flights.delete(userId));
  flights.set(userId, flight);
  return flight;
}
