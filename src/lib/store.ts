"use client";

import { useSyncExternalStore } from "react";
import type { EdgeType, SondeurNode, Tree } from "./types";

const STORAGE_KEY = "sondeur.trees.v1";

interface StoreState {
  trees: Record<string, Tree>;
}

let state: StoreState = { trees: {} };
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const trees = JSON.parse(raw) as Record<string, Tree>;
      // streaming のまま保存されたノードは中断扱いにする
      for (const tree of Object.values(trees)) {
        for (const node of Object.values(tree.nodes)) {
          if (node.status === "streaming") {
            node.status = node.content.length > 0 ? "done" : "error";
          }
        }
      }
      state = { trees };
    }
  } catch {
    // 壊れたデータは捨てる
    state = { trees: {} };
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trees));
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

/** リモートから取得した状態で置き換える (ログイン時の同期用) */
export function hydrate(trees: Record<string, Tree>) {
  load();
  state = { trees };
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
