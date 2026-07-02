import type { SondeurNode, Tree } from "./types";

/**
 * ノード本文を「掘り済みスパン」で分割するロジック。
 * ReadingPanel と SharedTreeView で共用する。
 */

export type ChildEdge = "what" | "why" | "ask";

export interface Segment {
  text: string;
  start: number;
  childId: string | null;
  childEdge: ChildEdge | null;
}

function childrenOf(tree: Tree, nodeId: string): SondeurNode[] {
  return Object.values(tree.nodes)
    .filter((n) => n.parentId === nodeId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * 本文を [平文, 掘り済みスパン, 平文, ...] のセグメント列に分割する。
 * - 範囲外 (負 / 本文長超え / start>=end) の子は無視
 * - 重なった子は先に始まる方を優先し、後続はスキップ
 */
export function buildSegments(tree: Tree, node: SondeurNode): Segment[] {
  const children = childrenOf(tree, node.id).filter(
    (c) => c.spanStart >= 0 && c.spanEnd <= node.content.length && c.spanStart < c.spanEnd
  );
  const sorted = [...children].sort((a, b) => a.spanStart - b.spanStart);
  const segs: Segment[] = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.spanStart < cursor) continue;
    if (c.spanStart > cursor) {
      segs.push({ text: node.content.slice(cursor, c.spanStart), start: cursor, childId: null, childEdge: null });
    }
    segs.push({
      text: node.content.slice(c.spanStart, c.spanEnd),
      start: c.spanStart,
      childId: c.id,
      childEdge: c.edgeType as ChildEdge,
    });
    cursor = c.spanEnd;
  }
  if (cursor < node.content.length) {
    segs.push({ text: node.content.slice(cursor), start: cursor, childId: null, childEdge: null });
  }
  return segs;
}
