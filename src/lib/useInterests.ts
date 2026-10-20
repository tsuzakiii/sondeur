"use client";

import { useSyncExternalStore } from "react";
import { saveAccountInterests, useAuthInfo, useAuthReady } from "./authState";
import { normalizeInterests, type InterestId } from "./interests";

const GUEST_KEY = "sondeur.interests.guest.v1";
const CHANGE_EVENT = "sondeur-interests-change";
const EMPTY: InterestId[] = [];
let lastRaw: string | null = null;
let guestSnapshot = EMPTY;

function readGuest() {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(GUEST_KEY); } catch {}
  if (raw !== lastRaw) {
    lastRaw = raw;
    try { guestSnapshot = normalizeInterests(JSON.parse(raw ?? "[]")); }
    catch { guestSnapshot = EMPTY; }
  }
  return guestSnapshot;
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function useInterests() {
  const auth = useAuthInfo();
  const ready = useAuthReady();
  const guest = useSyncExternalStore(subscribe, readGuest, () => EMPTY);
  const interests = auth.kind === "signedIn" ? auth.interests : guest;
  async function save(next: InterestId[]): Promise<boolean> {
    if (!ready) return false;
    if (auth.kind === "signedIn") return saveAccountInterests(auth.userId, next);
    try {
      window.localStorage.setItem(GUEST_KEY, JSON.stringify(normalizeInterests(next)));
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return true;
    } catch { return false; }
  }
  return { interests, ready, save, owner: auth.kind === "signedIn" ? auth.userId : "guest" };
}
