import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROFILE_CACHE_BASE,
  clearAllCachedProfiles,
  loadCachedProfile,
  resolveDisplayProfile,
  saveCachedProfile,
  type CachedProfile,
} from "@/components/authFooterCache";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const pA: CachedProfile = { userId: "uidA", plan: "pro", used: 299, hasStripe: true, monthKey: "2026-07" };
const pB: CachedProfile = { userId: "uidB", plan: "standard", used: 12, hasStripe: false, monthKey: "2026-07" };

beforeEach(() => {
  const storage = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
  (globalThis as unknown as { localStorage: unknown }).localStorage = storage;
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe("per-user profile cache scoping", () => {
  it("AC-B2a: loadCachedProfile returns per-user data, no cross-contamination", () => {
    saveCachedProfile("uidA", pA);
    saveCachedProfile("uidB", pB);
    expect(loadCachedProfile("uidA")).toEqual(pA);
    expect(loadCachedProfile("uidB")).toEqual(pB);
  });

  it("AC-B2b: clearAllCachedProfiles removes every per-user key", () => {
    saveCachedProfile("uidA", pA);
    saveCachedProfile("uidB", pB);
    clearAllCachedProfiles();
    expect(loadCachedProfile("uidA")).toBeNull();
    expect(loadCachedProfile("uidB")).toBeNull();
  });

  it("AC-B2c: clearAllCachedProfiles also removes the legacy unscoped key", () => {
    // pre-hotfix build wrote to the base key without uid suffix
    globalThis.window!.localStorage.setItem(PROFILE_CACHE_BASE, JSON.stringify(pA));
    saveCachedProfile("uidB", pB);
    clearAllCachedProfiles();
    expect(globalThis.window!.localStorage.getItem(PROFILE_CACHE_BASE)).toBeNull();
    expect(loadCachedProfile("uidB")).toBeNull();
  });

  it("AC-B2d: after save(uidA) then clearAll, loadCachedProfile(uidB) and loadCachedProfile(uidA) both return null (uidA→uidB direct switch)", () => {
    saveCachedProfile("uidA", pA);
    clearAllCachedProfiles();
    expect(loadCachedProfile("uidB")).toBeNull();
    expect(loadCachedProfile("uidA")).toBeNull();
  });

  it("AC-B2e: resolveDisplayProfile returns null when profile.userId !== authUserId (render-time render-safe fallback)", () => {
    // uidA→uidB 直接切替の render サイクル: state はまだ uidA の profile を保持している
    expect(resolveDisplayProfile(pA, "uidB")).toBeNull();
    // 同一ユーザーなら通す
    expect(resolveDisplayProfile(pA, "uidA")).toEqual(pA);
    // null profile (初回 mount) はそのまま null
    expect(resolveDisplayProfile(null, "uidB")).toBeNull();
  });

  it("AC-B2f: loadCachedProfile rejects payload whose userId does not match key", () => {
    // localStorage が tampered された想定: uidA の key に uidB のペイロードが入っている
    globalThis.window!.localStorage.setItem(`${PROFILE_CACHE_BASE}.uidA`, JSON.stringify(pB));
    expect(loadCachedProfile("uidA")).toBeNull();
  });

  it("AC-B2g: saveCachedProfile refuses payload whose userId does not match key argument", () => {
    // 契約違反 (呼び出し側のバグ) は sink しない
    saveCachedProfile("uidA", pB); // pB.userId === "uidB"
    expect(globalThis.window!.localStorage.getItem(`${PROFILE_CACHE_BASE}.uidA`)).toBeNull();
  });

  it("does not touch unrelated localStorage keys", () => {
    globalThis.window!.localStorage.setItem("unrelated.key", "value");
    globalThis.window!.localStorage.setItem("sondeur.trees.v1", "keep-me");
    saveCachedProfile("uidA", pA);
    clearAllCachedProfiles();
    expect(globalThis.window!.localStorage.getItem("unrelated.key")).toBe("value");
    expect(globalThis.window!.localStorage.getItem("sondeur.trees.v1")).toBe("keep-me");
  });
});
