import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Tree } from "../types";

const { select, upsert } = vi.hoisted(() => ({ select: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabase: () => ({
  from: (table: string) => ({
    select: () => {
      let owner: string | undefined;
      const query = {
        eq: (_key: string, value: string) => { owner = value; return query; },
        abortSignal: (signal: AbortSignal) => select(table, owner, signal),
      };
      return query;
    },
    upsert,
  }),
}) }));
const saved: Tree = { id: "local", title: "Saved trail", rootNodeId: "n", nodes: {}, createdAt: 1000, updatedAt: 1000 };
const remote = { id: "remote", user_id: "a", title: "Cloud trail", root_node_id: "root", created_at: "2026-01-01", updated_at: "2026-01-01" };
let values: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  values = new Map();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  upsert.mockResolvedValue({ error: null });
  select.mockImplementation(async (table: string) => ({ data: table === "trees" ? [remote] : [], error: null }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("recovers the observed nodes-only 401 without needing a reload", async () => {
  let nodesCalls = 0;
  select.mockImplementation(async (table: string) =>
    table === "nodes" && nodesCalls++ === 0
      ? { data: null, error: { code: "PGRST301", message: "JWT expired" } }
      : { data: table === "trees" ? [remote] : [], error: null });
  const sync = await import("../sync");
  const status = await import("../syncStatus");
  const work = sync.startSync("a");
  expect(status.getSyncStatus()).toBe("loading");
  await vi.advanceTimersByTimeAsync(1600);
  await work;
  expect(nodesCalls).toBe(2);
  expect(status.getSyncStatus()).toBe("ready");
  expect((await import("../store")).getState().trees.remote.title).toBe("Cloud trail");
  expect(select).toHaveBeenCalledWith("trees", "a", expect.any(AbortSignal));
});

it("restores only the authenticated owner's cache and exposes retry after bounded failures", async () => {
  values.set("sondeur.trees.owner.v1", "a");
  values.set("sondeur.trees.v1", JSON.stringify({ local: saved }));
  select.mockRejectedValue(new Error("offline"));
  const sync = await import("../sync");
  const store = await import("../store");
  const status = await import("../syncStatus");
  expect(store.getState().trees).toEqual({});
  const work = sync.startSync("a");
  expect(store.getState().trees.local).toEqual(saved);
  await vi.advanceTimersByTimeAsync(1600);
  await work;
  expect(status.getSyncStatus()).toBe("error");
  expect(select).toHaveBeenCalledTimes(9);
  expect(store.getState().trees.local).toEqual(saved);
  select.mockResolvedValue({ data: [], error: null });
  await sync.retrySync();
  expect(status.getSyncStatus()).toBe("ready");
  expect(store.getState().trees.local).toEqual(saved);
});

it("does not reveal another owner's cache if the new account's load fails", async () => {
  values.set("sondeur.trees.owner.v1", "a");
  values.set("sondeur.trees.v1", JSON.stringify({ local: saved }));
  select.mockRejectedValue(new Error("offline"));
  const sync = await import("../sync");
  const work = sync.startSync("b");
  await vi.advanceTimersByTimeAsync(1600);
  await work;
  expect((await import("../store")).getState().trees).toEqual({});
  expect(upsert).not.toHaveBeenCalled();
});

it("cancels delayed retries on sign-out, and a late response cannot restore old data", async () => {
  let resolve!: (value: unknown) => void;
  const response = new Promise(r => { resolve = r; });
  select.mockImplementation(() => response);
  const sync = await import("../sync");
  const status = await import("../syncStatus");
  const work = sync.startSync("a");
  sync.stopSync({ clearLocal: true });
  resolve({ data: [remote], error: null });
  await work;
  await vi.advanceTimersByTimeAsync(20_000);
  expect(status.getSyncStatus()).toBe("idle");
  expect((await import("../store")).getState().trees).toEqual({});
  expect(upsert).not.toHaveBeenCalled();
});

it("does not start another load while one is already in progress", async () => {
  select.mockImplementation(() => new Promise(() => {}));
  const sync = await import("../sync");
  void sync.startSync("a");
  await sync.startSync("a");
  expect(select).toHaveBeenCalledTimes(3);
  sync.stopSync();
});

it("keeps local work created during a retry in the final snapshot", async () => {
  select.mockRejectedValueOnce(new Error("temporary"));
  const sync = await import("../sync");
  const store = await import("../store");
  const work = sync.startSync("a");
  const { treeId } = store.createTree("New while loading");
  await vi.advanceTimersByTimeAsync(1600);
  await work;
  expect(store.getState().trees[treeId].title).toBe("New while loading");
  expect(store.getState().trees.remote.title).toBe("Cloud trail");
});
