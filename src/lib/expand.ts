"use client";

import {
  addChildNode,
  appendNodeContent,
  childrenOf,
  createTree,
  pathToNode,
  resetNodeContent,
  setNodeStatus,
} from "./store";
import { syncNodeFinalized, syncTreeCreated } from "./sync";
import type { ExpandRequest, SondeurNode, Tree } from "./types";

function summarize(text: string, max = 50): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function pathLabel(n: SondeurNode): string {
  if (n.edgeType === "root") return `Q: ${summarize(n.selectedSpan)}`;
  if (n.edgeType === "ask") return `ask: ${summarize(n.question ?? n.selectedSpan)}`;
  return `${n.edgeType}: ${summarize(n.selectedSpan)}`;
}

async function streamInto(treeId: string, nodeId: string, req: ExpandRequest) {
  try {
    const res = await fetch("/api/expand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.status === 402) {
      // プラン制限: 理由をそのまま本文として表示する
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      appendNodeContent(treeId, nodeId, data?.error ?? "プランの上限に達しました。");
      setNodeStatus(treeId, nodeId, "error");
      return;
    }
    if (!res.ok || !res.body) {
      throw new Error(`expand failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      appendNodeContent(treeId, nodeId, decoder.decode(value, { stream: true }));
    }
    // マルチバイト文字が途中で切れている場合に備えて最終フラッシュ
    const tail = decoder.decode();
    if (tail) appendNodeContent(treeId, nodeId, tail);
    setNodeStatus(treeId, nodeId, "done");
    syncNodeFinalized(treeId, nodeId);
  } catch (err) {
    console.error(err);
    appendNodeContent(treeId, nodeId, "\n\n[生成に失敗しました]");
    setNodeStatus(treeId, nodeId, "error");
  }
}

/** 新規ツリー作成 + ルートノード生成 */
export function startTree(question: string): { treeId: string; nodeId: string } {
  const { treeId, nodeId } = createTree(question);
  syncTreeCreated(treeId);
  void streamInto(treeId, nodeId, {
    pathSummaries: [],
    parentContent: "",
    grandparentContent: null,
    selectedSpan: question,
    operation: "root",
  });
  return { treeId, nodeId };
}

/** スパン選択 → What/Why 掘り下げ */
export function expandSpan(
  tree: Tree,
  parentId: string,
  operation: "what" | "why",
  selectedSpan: string,
  spanStart: number,
  spanEnd: number
): string {
  const parent = tree.nodes[parentId];
  // 同一スパン・同一操作の既存子があれば再生成しない (原価削減)
  const existing = childrenOf(tree, parentId).find(
    (c) => c.edgeType === operation && c.spanStart === spanStart && c.spanEnd === spanEnd
  );
  if (existing) return existing.id;
  const grandparent = parent.parentId ? tree.nodes[parent.parentId] : null;
  const path = pathToNode(tree, parentId);
  const nodeId = addChildNode(tree.id, parentId, operation, selectedSpan, spanStart, spanEnd);
  void streamInto(tree.id, nodeId, {
    pathSummaries: path.map(pathLabel),
    parentId,
    parentContent: parent.content,
    grandparentContent: grandparent?.content ?? null,
    selectedSpan,
    operation,
  });
  return nodeId;
}

const QUOTA_ERROR_PATTERNS = ["ノード生成上限", "お試し枠を使い切りました", "プランの上限に達しました"];

function isQuotaError(node: SondeurNode): boolean {
  return node.status === "error" && QUOTA_ERROR_PATTERNS.some((p) => node.content.includes(p));
}

function buildRetryRequest(tree: Tree, node: SondeurNode): ExpandRequest | null {
  if (node.edgeType === "root") {
    return {
      pathSummaries: [],
      parentContent: "",
      grandparentContent: null,
      selectedSpan: node.selectedSpan,
      operation: "root",
    };
  }
  const parent = node.parentId ? tree.nodes[node.parentId] : null;
  if (!parent || parent.status !== "done") return null;
  const grandparent = parent.parentId ? tree.nodes[parent.parentId] : null;
  const path = pathToNode(tree, node.parentId!);
  const base = {
    pathSummaries: path.map(pathLabel),
    parentId: node.parentId!,
    parentContent: parent.content,
    grandparentContent: grandparent?.content ?? null,
    selectedSpan: node.selectedSpan,
  };
  if (node.edgeType === "ask") {
    return { ...base, question: node.question, operation: "ask" as const };
  }
  return { ...base, operation: node.edgeType as "what" | "why" };
}

/** クオータエラーのノードを表示時に自動再生成する (ノードを開いた時に呼ぶ) */
export function retryIfQuotaError(tree: Tree, nodeId: string): boolean {
  const node = tree.nodes[nodeId];
  if (!node || !isQuotaError(node)) return false;
  const req = buildRetryRequest(tree, node);
  if (!req) return false;
  resetNodeContent(tree.id, node.id);
  void streamInto(tree.id, node.id, req);
  return true;
}

/** 自由質問 (スパン選択あり / なし両対応)。質問が違えば別ノードなので重複排除しない */
export function expandAsk(
  tree: Tree,
  parentId: string,
  question: string,
  selectedSpan = "",
  spanStart = -1,
  spanEnd = -1
): string {
  const parent = tree.nodes[parentId];
  const grandparent = parent.parentId ? tree.nodes[parent.parentId] : null;
  const path = pathToNode(tree, parentId);
  const nodeId = addChildNode(tree.id, parentId, "ask", selectedSpan, spanStart, spanEnd, question);
  void streamInto(tree.id, nodeId, {
    pathSummaries: path.map(pathLabel),
    parentId,
    parentContent: parent.content,
    grandparentContent: grandparent?.content ?? null,
    selectedSpan,
    question,
    operation: "ask",
  });
  return nodeId;
}
