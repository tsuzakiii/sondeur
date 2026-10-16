import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Tree } from "@/lib/types";
import { clearTrees, getState, hydrate, restoreTrailDocument, saveTrailDocument } from "@/lib/store";
import { startSync, stopSync, syncDocumentSaved } from "@/lib/sync";
const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabase: () => ({ from, rpc }) }));
const doc = (time = 2000) => ({ markdown: `# Document ${time}`, sourceKey: "a".repeat(64), createdAt: time, locale: "ja" });
const tree = (): Tree => ({ id: "t", title: "Question", rootNodeId: "n", nodes: { n: { id: "n", treeId: "t", parentId: null, edgeType: "root", selectedSpan: "Question", spanStart: -1, spanEnd: -1, content: "Answer", status: "done", collapsed: false, createdAt: 1000 } }, createdAt: 1000, updatedAt: 1000 });
const treeRow = { id: "t", user_id: "user-a", title: "Question", root_node_id: "n", created_at: new Date(1000).toISOString(), updated_at: new Date(1000).toISOString() };
const row = (time = 2000) => ({ tree_id: "t", markdown: doc(time).markdown, source_key: doc(time).sourceKey, created_at: new Date(time).toISOString(), locale: "ja" });
let remoteDocs: ReturnType<typeof row>[];
let remoteTrees: typeof treeRow[];
let upsert: ReturnType<typeof vi.fn>;
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string,v: string) => values.set(k,v), removeItem: (k: string) => values.delete(k) } });
  stopSync({ clearLocal: true });
  remoteTrees = [treeRow]; remoteDocs = [];
  upsert = vi.fn().mockResolvedValue({ error: null });
  from.mockImplementation((name: string) => ({ select: vi.fn(async () => ({ data: name === "trees" ? remoteTrees : name === "tree_documents" ? remoteDocs : [], error: null })), upsert }));
  rpc.mockImplementation(async (_name, p) => ({ data: [{ tree_id: p.p_tree_id, markdown: p.p_markdown, source_key: p.p_source_key, created_at: p.p_created_at, locale: p.p_locale }], error: null }));
});
afterEach(() => { stopSync({ clearLocal: true }); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("restores a cloud document after clearing local state, without consuming a generation", async () => {
  remoteDocs = [row()];
  await startSync("user-a");
  expect(getState().trees.t.document).toEqual({ ...doc(), synced: true });
  expect(getState().trees.t.documentGenerations).toBeUndefined();
  expect(rpc).not.toHaveBeenCalled();
  clearTrees();
  await startSync("user-a");
  expect(getState().trees.t.document?.markdown).toBe(doc().markdown);
});
it("migrates a guest document only after its tree is saved, and retains the generation count", async () => {
  remoteTrees = [];
  hydrate({ t: { ...tree(), document: doc(), documentGenerations: 1 } }, "guest");
  await startSync("user-a");
  await vi.waitFor(() => expect(getState().trees.t.document?.synced).toBe(true));
  expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
  expect(rpc).toHaveBeenCalledWith("save_tree_document", expect.objectContaining({ p_tree_id: "t", p_markdown: doc().markdown }));
  expect(getState().trees.t.documentGenerations).toBe(1);
});
it("prefers a newer cloud document over an older local snapshot", async () => {
  remoteDocs = [row(3000)];
  hydrate({ t: { ...tree(), document: doc(2000) } }, "user-a");
  await startSync("user-a");
  expect(getState().trees.t.document).toEqual({ ...doc(3000), synced: true });
  expect(rpc).not.toHaveBeenCalled();
});
it("keeps an unsaved document and retries only persistence after a network failure", async () => {
  await startSync("user-a");
  saveTrailDocument("t", doc(), "user-a");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  expect(await syncDocumentSaved("t")).toBe(false);
  expect(getState().trees.t.document).toEqual(doc());
  expect(await syncDocumentSaved("t")).toBe(true);
  expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({ id: "t", user_id: "user-a" }), { onConflict: "id", ignoreDuplicates: true });
  expect(getState().trees.t.document?.synced).toBe(true);
  expect(getState().trees.t.documentGenerations).toBe(1);
  log.mockRestore();
});
it("does not send a queued document after sign-out or restore it under another account", async () => {
  await startSync("user-a");
  saveTrailDocument("t", doc(), "user-a");
  const pending = syncDocumentSaved("t");
  stopSync({ clearLocal: true });
  expect(await pending).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
  hydrate({ t: tree() }, "user-b");
  expect(restoreTrailDocument("t", doc(), "user-a")).toBe(false);
});
it("does not mark a newer local generation saved when an older save returns", async () => {
  await startSync("user-a");
  saveTrailDocument("t", doc(3000), "user-a");
  expect(restoreTrailDocument("t", doc(2000), "user-a")).toBe(false);
  expect(getState().trees.t.document).toEqual(doc(3000));
});
