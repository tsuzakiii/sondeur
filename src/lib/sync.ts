"use client";

import { getSupabase } from "./supabase/client";
import { getState, hydrate } from "./store";
import type { SondeurNode, Tree } from "./types";

/**
 * Supabase への write-through 同期。
 * - ログインしていない間はすべて no-op (アプリは localStorage だけで動く)
 * - ノードは「ストリーミング完了時」にのみ永続化する (空ノードをリモートに作らない)
 * - 書き込みはツリー毎の直列キューで順序保証する (FK レース防止)
 * - ログイン時はリモートとローカルをマージし、欠けている側を修復する
 */

let userId: string | null = null;
/** ログイン/ログアウトの世代。startSync 中にセッションが変わったら結果を捨てるためのガード */
let generation = 0;

export function isSyncActive(): boolean {
  return userId !== null;
}

function logError(op: string) {
  return (err: unknown) => console.error(`[sync] ${op} failed`, err);
}

// ---- ツリー毎の直列書き込みキュー ----

const queues = new Map<string, Promise<void>>();

function enqueue(treeId: string, op: string, fn: () => Promise<void>) {
  const prev = queues.get(treeId) ?? Promise.resolve();
  const next = prev.then(fn).catch(logError(op));
  queues.set(treeId, next);
}

// ---- row mapping ----

interface TreeRow {
  id: string;
  user_id: string;
  title: string;
  root_node_id: string | null;
  created_at: string;
  updated_at: string;
  shared?: boolean;
}

interface NodeRow {
  id: string;
  tree_id: string;
  parent_id: string | null;
  edge_type: SondeurNode["edgeType"];
  selected_span: string;
  span_start: number;
  span_end: number;
  question: string | null;
  content: string;
  collapsed: boolean;
  created_at: string;
}

function nodeToRow(n: SondeurNode): NodeRow {
  return {
    id: n.id,
    tree_id: n.treeId,
    parent_id: n.parentId,
    edge_type: n.edgeType,
    selected_span: n.selectedSpan,
    span_start: n.spanStart,
    span_end: n.spanEnd,
    question: n.question ?? null,
    content: n.content,
    collapsed: n.collapsed,
    created_at: new Date(n.createdAt).toISOString(),
  };
}

function rowToNode(r: NodeRow): SondeurNode {
  return {
    id: r.id,
    treeId: r.tree_id,
    parentId: r.parent_id,
    edgeType: r.edge_type,
    selectedSpan: r.selected_span,
    spanStart: r.span_start,
    spanEnd: r.span_end,
    ...(r.question ? { question: r.question } : {}),
    content: r.content,
    // 完了時にしか保存しない設計だが、過去の不整合行が混ざっても done と偽らない
    status: r.content ? "done" : "error",
    collapsed: r.collapsed,
    createdAt: Date.parse(r.created_at),
  };
}

function treeToRow(tree: Tree, uid: string): TreeRow {
  return {
    id: tree.id,
    user_id: uid,
    title: tree.title,
    root_node_id: tree.rootNodeId,
    created_at: new Date(tree.createdAt).toISOString(),
    updated_at: new Date(tree.updatedAt).toISOString(),
  };
}

/** 永続化対象のノード (完了済みのみ)。親が先に来るよう作成順に並べる */
function persistableNodes(tree: Tree): NodeRow[] {
  return Object.values(tree.nodes)
    .filter((n) => n.status === "done" && n.content.length > 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(nodeToRow);
}

async function upsertTreeWithNodes(tree: Tree, uid: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("trees").upsert(treeToRow(tree, uid));
  if (error) throw error;
  const nodes = persistableNodes(tree);
  if (nodes.length > 0) {
    const { error: nodeErr } = await supabase.from("nodes").upsert(nodes);
    if (nodeErr) throw nodeErr;
  }
}

// ---- ログイン時のロード & マージ ----

/** ローカルとリモートの同一ツリーをマージする。ノードは和集合、本文は長い方 (追記のみなので長い=新しい) */
function mergeTree(local: Tree, remote: Tree): { merged: Tree; needsRepair: boolean } {
  const nodes: Record<string, SondeurNode> = { ...remote.nodes };
  let needsRepair = false;
  for (const [id, ln] of Object.entries(local.nodes)) {
    const rn = nodes[id];
    if (!rn) {
      nodes[id] = ln;
      // ローカルで完了済みなのにリモートに無い → 過去の書き込み失敗。修復対象
      if (ln.status === "done" && ln.content.length > 0) needsRepair = true;
    } else if (ln.content.length > rn.content.length) {
      nodes[id] = ln;
      needsRepair = true;
    }
  }
  const base = local.updatedAt >= remote.updatedAt ? local : remote;
  return { merged: { ...base, nodes }, needsRepair };
}

/** ログイン時: リモートを読み込み、ローカルとマージして状態を差し替える。欠けている側は修復 push */
export async function startSync(uid: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  const gen = ++generation;
  userId = uid;

  const [{ data: treeRows, error: tErr }, { data: nodeRows, error: nErr }] = await Promise.all([
    supabase.from("trees").select("*"),
    supabase.from("nodes").select("*"),
  ]);
  if (gen !== generation) return; // 取得中にログアウト/アカウント切替が起きた
  if (tErr || nErr) {
    console.error("[sync] initial load failed", tErr ?? nErr);
    return;
  }

  const remote: Record<string, Tree> = {};
  for (const r of (treeRows ?? []) as TreeRow[]) {
    remote[r.id] = {
      id: r.id,
      title: r.title,
      rootNodeId: r.root_node_id ?? "",
      nodes: {},
      createdAt: Date.parse(r.created_at),
      updatedAt: Date.parse(r.updated_at),
      shared: r.shared ?? false,
    };
  }
  for (const r of (nodeRows ?? []) as NodeRow[]) {
    const tree = remote[r.tree_id];
    if (tree) tree.nodes[r.id] = rowToNode(r);
  }

  const local = getState().trees;
  const merged: Record<string, Tree> = { ...remote };
  for (const lt of Object.values(local)) {
    const rt = remote[lt.id];
    if (!rt) {
      // ゲスト時代 (または過去の書き込み失敗) のローカルツリーをリモートへ移行
      merged[lt.id] = lt;
      enqueue(lt.id, "migrate tree", () => upsertTreeWithNodes(lt, uid));
    } else {
      const { merged: mt, needsRepair } = mergeTree(lt, rt);
      merged[lt.id] = mt;
      if (needsRepair) {
        enqueue(mt.id, "repair tree", () => upsertTreeWithNodes(mt, uid));
      }
    }
  }

  if (gen !== generation) return;
  hydrate(merged);
}

export function stopSync() {
  userId = null;
  generation++;
}

// ---- write-through hooks ----

/** ツリー作成時: ツリー行のみ作る (ルートノードは生成完了時に保存される) */
export function syncTreeCreated(treeId: string) {
  if (!userId) return;
  const uid = userId;
  const tree = getState().trees[treeId];
  if (!tree) return;
  const row = treeToRow(tree, uid);
  enqueue(treeId, "tree create", async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("trees").upsert(row);
    if (error) throw error;
  });
}

/** ストリーミング完了時: ノードを確定保存し、ツリーの updated_at を進める */
export function syncNodeFinalized(treeId: string, nodeId: string) {
  if (!userId) return;
  const node = getState().trees[treeId]?.nodes[nodeId];
  if (!node || node.status !== "done" || node.content.length === 0) return;
  const row = nodeToRow(node);
  enqueue(treeId, "node finalize", async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("nodes").upsert(row);
    if (error) throw error;
    const { error: tErr } = await supabase
      .from("trees")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", treeId);
    if (tErr) throw tErr;
  });
}

export function syncTreeDeleted(treeId: string) {
  if (!userId) return;
  enqueue(treeId, "tree delete", async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("trees").delete().eq("id", treeId);
    if (error) throw error;
  });
}

export function syncCollapsed(treeId: string, nodeId: string) {
  if (!userId) return;
  const node = getState().trees[treeId]?.nodes[nodeId];
  if (!node) return;
  const collapsed = node.collapsed;
  enqueue(treeId, "collapse", async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    // ノードが未保存 (streaming中) なら行が無いだけなので no-op で問題ない
    const { error } = await supabase.from("nodes").update({ collapsed }).eq("id", nodeId);
    if (error) throw error;
  });
}
