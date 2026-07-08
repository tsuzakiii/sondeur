"use client";

import { useSyncExternalStore } from "react";
import type { EdgeType, SondeurNode, Tree } from "./types";

const STORAGE_KEY = "sondeur.trees.v1";
const STORAGE_OWNER_KEY = "sondeur.trees.owner.v1";
const GUEST_OWNER = "guest";

interface StoreState {
  trees: Record<string, Tree>;
}

let state: StoreState = { trees: {} };
let loaded = false;
let storageOwner = GUEST_OWNER;
const listeners = new Set<() => void>();

function normalizeTrees(trees: Record<string, Tree>): Record<string, Tree> {
  // streaming のまま保存されたノードは中断扱いにする
  for (const tree of Object.values(trees)) {
    for (const node of Object.values(tree.nodes)) {
      if (node.status === "streaming") {
        node.status = node.content.length > 0 ? "done" : "error";
      }
    }
  }
  return trees;
}

function readStoredOwner(): string {
  if (typeof window === "undefined") return storageOwner;
  return window.localStorage.getItem(STORAGE_OWNER_KEY) ?? GUEST_OWNER;
}

function readStoredTrees(): Record<string, Tree> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeTrees(JSON.parse(raw) as Record<string, Tree>);
    }
  } catch {
    // 壊れたデータは捨てる扱い
  }
  return {};
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  storageOwner = readStoredOwner();
  // アカウント所有の保存ツリーは、認証済みの同一ユーザーだと確認できるまで表示しない。
  state = { trees: storageOwner === GUEST_OWNER ? readStoredTrees() : {} };
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trees));
    window.localStorage.setItem(STORAGE_OWNER_KEY, storageOwner);
  } catch {
    // quota 超過などは無視 (メモリ上では動き続ける)
  }
}

function emit() {
  persist();
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StoreState {
  load();
  return state;
}

const serverSnapshot: StoreState = { trees: {} };
function getServerSnapshot(): StoreState {
  return serverSnapshot;
}

export function useTreeStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function uid(): string {
  return crypto.randomUUID();
}

/** 現在の状態を返す (リモート同期用) */
export function getState(): StoreState {
  load();
  return state;
}

/** localStorage 上のツリー所有者。guest または Supabase user id。 */
export function getStorageOwner(): string {
  load();
  return storageOwner;
}

/** 認証済みユーザーの同期処理だけが、所有者確認後に保存ツリーを読む。 */
export function getStoredTreesForOwner(owner: string): Record<string, Tree> {
  load();
  return readStoredOwner() === owner ? readStoredTrees() : {};
}

/** リモートから取得した状態で置き換える (ログイン時の同期用) */
export function hydrate(trees: Record<string, Tree>, owner = storageOwner) {
  load();
  storageOwner = owner;
  state = { trees };
  emit();
}

/** アカウント境界を越えてツリーを見せないため、ローカル状態を空にする。 */
export function clearTrees(owner = GUEST_OWNER) {
  load();
  storageOwner = owner;
  state = { trees: {} };
  emit();
}

// ---- mutations ----

export function createTree(question: string): { treeId: string; nodeId: string } {
  load();
  const treeId = uid();
  const nodeId = uid();
  const now = Date.now();
  const root: SondeurNode = {
    id: nodeId,
    treeId,
    parentId: null,
    edgeType: "root",
    selectedSpan: question,
    spanStart: -1,
    spanEnd: -1,
    content: "",
    status: "streaming",
    collapsed: false,
    createdAt: now,
  };
  const title = question.length > 24 ? question.slice(0, 24) + "…" : question;
  state = {
    trees: {
      ...state.trees,
      [treeId]: {
        id: treeId,
        title,
        rootNodeId: nodeId,
        nodes: { [nodeId]: root },
        createdAt: now,
        updatedAt: now,
      },
    },
  };
  emit();
  return { treeId, nodeId };
}

export function addChildNode(
  treeId: string,
  parentId: string,
  edgeType: Exclude<EdgeType, "root">,
  selectedSpan: string,
  spanStart: number,
  spanEnd: number,
  question?: string
): string {
  load();
  const tree = state.trees[treeId];
  if (!tree) throw new Error(`tree not found: ${treeId}`);
  const nodeId = uid();
  const now = Date.now();
  const node: SondeurNode = {
    id: nodeId,
    treeId,
    parentId,
    edgeType,
    selectedSpan,
    spanStart,
    spanEnd,
    ...(question ? { question } : {}),
    content: "",
    status: "streaming",
    collapsed: false,
    createdAt: now,
  };
  state = {
    trees: {
      ...state.trees,
      [treeId]: {
        ...tree,
        nodes: { ...tree.nodes, [nodeId]: node },
        updatedAt: now,
      },
    },
  };
  emit();
  return nodeId;
}

export function appendNodeContent(treeId: string, nodeId: string, chunk: string) {
  load();
  const tree = state.trees[treeId];
  const node = tree?.nodes[nodeId];
  if (!tree || !node) return;
  state = {
    trees: {
      ...state.trees,
      [treeId]: {
        ...tree,
        nodes: {
          ...tree.nodes,
          [nodeId]: { ...node, content: node.content + chunk },
        },
        updatedAt: Date.now(),
      },
    },
  };
  emit();
}

export function setNodeStatus(treeId: string, nodeId: string, status: SondeurNode["status"]) {
  load();
  const tree = state.trees[treeId];
  const node = tree?.nodes[nodeId];
  if (!tree || !node) return;
  state = {
    trees: {
      ...state.trees,
      [treeId]: {
        ...tree,
        nodes: { ...tree.nodes, [nodeId]: { ...node, status } },
        updatedAt: Date.now(),
      },
    },
  };
  emit();
}

export function resetNodeContent(treeId: string, nodeId: string) {
  load();
  const tree = state.trees[treeId];
  const node = tree?.nodes[nodeId];
  if (!tree || !node) return;
  state = {
    trees: {
      ...state.trees,
      [treeId]: {
        ...tree,
        nodes: { ...tree.nodes, [nodeId]: { ...node, content: "", status: "streaming" } },
        updatedAt: Date.now(),
      },
    },
  };
  emit();
}

export function toggleCollapsed(treeId: string, nodeId: string) {
  load();
  const tree = state.trees[treeId];
  const node = tree?.nodes[nodeId];
  if (!tree || !node) return;
  state = {
    trees: {
      ...state.trees,
      [treeId]: {
        ...tree,
        nodes: { ...tree.nodes, [nodeId]: { ...node, collapsed: !node.collapsed } },
      },
    },
  };
  emit();
}

export function deleteTree(treeId: string) {
  load();
  const trees = { ...state.trees };
  delete trees[treeId];
  state = { trees };
  emit();
}

export function setShared(treeId: string, shared: boolean) {
  load();
  const tree = state.trees[treeId];
  if (!tree) return;
  state = {
    trees: {
      ...state.trees,
      [treeId]: { ...tree, shared },
    },
  };
  emit();
}

// ---- selectors ----

export function childrenOf(tree: Tree, nodeId: string): SondeurNode[] {
  return Object.values(tree.nodes)
    .filter((n) => n.parentId === nodeId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function depthOf(tree: Tree, nodeId: string): number {
  let d = 0;
  let cur = tree.nodes[nodeId];
  while (cur?.parentId) {
    d++;
    cur = tree.nodes[cur.parentId];
  }
  return d;
}

/** ルートから nodeId までのパス (root 含む、nodeId 含む) */
export function pathToNode(tree: Tree, nodeId: string): SondeurNode[] {
  const path: SondeurNode[] = [];
  let cur: SondeurNode | undefined = tree.nodes[nodeId];
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? tree.nodes[cur.parentId] : undefined;
  }
  return path;
}
