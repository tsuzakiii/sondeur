import { afterEach, beforeEach, describe, expect, it } from "vitest";

const STORAGE_KEY = "sondeur.trees.v1";
const OWNER_KEY = "sondeur.trees.owner.v1";

const sampleTrees = {
  t1: {
    id: "t1",
    title: "A's tree",
    rootNodeId: "n1",
    nodes: {
      n1: {
        id: "n1",
        treeId: "t1",
        parentId: null,
        edgeType: "root",
        selectedSpan: "hello",
        spanStart: -1,
        spanEnd: -1,
        content: "content",
        status: "done",
        collapsed: false,
        createdAt: 1_000_000,
      },
    },
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
  },
};

// store モジュールが自身の `loaded` フラグを持ち、モジュール初期化時に一度だけ load() を走らせる。
// テストごとに fresh な load を得るためモジュール自体を reset する。
async function freshStore() {
  const mod = await import("@/lib/store");
  return mod;
}

// jsdom 抜きの node 環境で localStorage を提供する
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

beforeEach(async () => {
  // window / localStorage を用意する
  const storage = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = storage;
  // モジュールキャッシュを毎回リセット (loaded フラグをクリアするため)
  const { vi } = await import("vitest");
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe("legacy state (no owner tag) is dropped at load", () => {
  it("AC-B1a: pre-existing trees without owner tag → getState() returns {} AND storage key removed", async () => {
    globalThis.window!.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleTrees));
    // owner tag は書かない (pre-owner-tag 状態を再現)

    const mod = await freshStore();
    const state = mod.getState();

    expect(state.trees).toEqual({});
    expect(globalThis.window!.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(globalThis.window!.localStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it("AC-B1d: legacy state cleanup blocks getStoredTreesForOwner for any uid", async () => {
    globalThis.window!.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleTrees));

    const mod = await freshStore();
    // load() を先に走らせる (getState 経由)
    mod.getState();
    // その後は uid を指定しても legacy tree は復元されない
    expect(mod.getStoredTreesForOwner("uidB")).toEqual({});
    expect(globalThis.window!.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("owner-tag paths (regression guards)", () => {
  it("AC-B1b: owner tag == 'guest' with trees → trees are loaded", async () => {
    globalThis.window!.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleTrees));
    globalThis.window!.localStorage.setItem(OWNER_KEY, "guest");

    const mod = await freshStore();
    const state = mod.getState();

    expect(state.trees).toHaveProperty("t1");
    expect(state.trees.t1.title).toBe("A's tree");
  });

  it("AC-B1c: owner tag == uid → getState() returns {} (only the same uid can restore via startSync)", async () => {
    globalThis.window!.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleTrees));
    globalThis.window!.localStorage.setItem(OWNER_KEY, "uidA");

    const mod = await freshStore();
    const state = mod.getState();

    expect(state.trees).toEqual({});
    // storageOwner は uidA として保持され、後で getStoredTreesForOwner("uidA") が復元できる
    expect(mod.getStorageOwner()).toBe("uidA");
    expect(mod.getStoredTreesForOwner("uidA")).toHaveProperty("t1");
    expect(mod.getStoredTreesForOwner("uidB")).toEqual({});
  });
});

describe("no legacy state present", () => {
  it("empty localStorage → getState() returns {} and no side effects", async () => {
    const mod = await freshStore();
    expect(mod.getState().trees).toEqual({});
    expect(globalThis.window!.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
