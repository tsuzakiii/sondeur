import { describe, expect, it } from "vitest";
import { buildSegments } from "@/lib/segments";
import type { SondeurNode, Tree } from "@/lib/types";

function makeNode(partial: Partial<SondeurNode> & { id: string }): SondeurNode {
  return {
    treeId: "t1",
    parentId: null,
    edgeType: "root",
    selectedSpan: "",
    spanStart: -1,
    spanEnd: -1,
    content: "",
    status: "done",
    collapsed: false,
    createdAt: 0,
    ...partial,
  };
}

function makeTree(nodes: SondeurNode[]): Tree {
  return {
    id: "t1",
    title: "test",
    rootNodeId: nodes[0].id,
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    createdAt: 0,
    updatedAt: 0,
  };
}

const CONTENT = "0123456789abcdefghij"; // 20 chars

describe("buildSegments", () => {
  it("子がなければ本文全体が1セグメント", () => {
    const root = makeNode({ id: "r", content: CONTENT });
    const segs = buildSegments(makeTree([root]), root);
    expect(segs).toEqual([{ text: CONTENT, start: 0, childId: null, childEdge: null }]);
  });

  it("掘り済みスパンの前後が平文セグメントに分かれる", () => {
    const root = makeNode({ id: "r", content: CONTENT });
    const child = makeNode({ id: "c1", parentId: "r", edgeType: "what", spanStart: 5, spanEnd: 8, createdAt: 1 });
    const segs = buildSegments(makeTree([root, child]), root);
    expect(segs.map((s) => s.text)).toEqual(["01234", "567", "89abcdefghij"]);
    expect(segs[1]).toMatchObject({ childId: "c1", childEdge: "what", start: 5 });
  });

  it("スパンが本文先頭/末尾に接するとき空セグメントを作らない", () => {
    const root = makeNode({ id: "r", content: CONTENT });
    const head = makeNode({ id: "c1", parentId: "r", edgeType: "what", spanStart: 0, spanEnd: 3, createdAt: 1 });
    const tail = makeNode({ id: "c2", parentId: "r", edgeType: "why", spanStart: 17, spanEnd: 20, createdAt: 2 });
    const segs = buildSegments(makeTree([root, head, tail]), root);
    expect(segs.map((s) => s.text)).toEqual(["012", "3456789abcdefg", "hij"]);
    expect(segs.every((s) => s.text.length > 0)).toBe(true);
  });

  it("複数スパンは位置順に並ぶ (作成順ではなく)", () => {
    const root = makeNode({ id: "r", content: CONTENT });
    const later = makeNode({ id: "c1", parentId: "r", edgeType: "what", spanStart: 10, spanEnd: 12, createdAt: 1 });
    const earlier = makeNode({ id: "c2", parentId: "r", edgeType: "why", spanStart: 2, spanEnd: 4, createdAt: 2 });
    const segs = buildSegments(makeTree([root, later, earlier]), root);
    const spanSegs = segs.filter((s) => s.childId);
    expect(spanSegs.map((s) => s.childId)).toEqual(["c2", "c1"]);
  });

  it("重なったスパンは先に始まる方を優先し後続をスキップ", () => {
    const root = makeNode({ id: "r", content: CONTENT });
    const first = makeNode({ id: "c1", parentId: "r", edgeType: "what", spanStart: 3, spanEnd: 8, createdAt: 1 });
    const overlap = makeNode({ id: "c2", parentId: "r", edgeType: "why", spanStart: 5, spanEnd: 10, createdAt: 2 });
    const segs = buildSegments(makeTree([root, first, overlap]), root);
    expect(segs.filter((s) => s.childId).map((s) => s.childId)).toEqual(["c1"]);
    expect(segs.map((s) => s.text).join("")).toBe(CONTENT); // 本文の復元性
  });

  it("範囲外のスパン (負 / 本文長超え / start>=end) は無視", () => {
    const root = makeNode({ id: "r", content: CONTENT });
    const bad1 = makeNode({ id: "c1", parentId: "r", edgeType: "what", spanStart: -1, spanEnd: 3, createdAt: 1 });
    const bad2 = makeNode({ id: "c2", parentId: "r", edgeType: "what", spanStart: 5, spanEnd: 99, createdAt: 2 });
    const bad3 = makeNode({ id: "c3", parentId: "r", edgeType: "what", spanStart: 7, spanEnd: 7, createdAt: 3 });
    const segs = buildSegments(makeTree([root, bad1, bad2, bad3]), root);
    expect(segs).toEqual([{ text: CONTENT, start: 0, childId: null, childEdge: null }]);
  });

  it("他ノードの子は混ざらない", () => {
    const root = makeNode({ id: "r", content: CONTENT });
    const mid = makeNode({ id: "m", parentId: "r", edgeType: "what", spanStart: 0, spanEnd: 3, content: "xyz", createdAt: 1 });
    const grandchild = makeNode({ id: "g", parentId: "m", edgeType: "why", spanStart: 0, spanEnd: 2, createdAt: 2 });
    const segs = buildSegments(makeTree([root, mid, grandchild]), root);
    expect(segs.filter((s) => s.childId).map((s) => s.childId)).toEqual(["m"]);
  });

  it("セグメント連結で常に本文が復元される", () => {
    const root = makeNode({ id: "r", content: CONTENT });
    const c1 = makeNode({ id: "c1", parentId: "r", edgeType: "what", spanStart: 1, spanEnd: 4, createdAt: 1 });
    const c2 = makeNode({ id: "c2", parentId: "r", edgeType: "ask", spanStart: 8, spanEnd: 15, createdAt: 2 });
    const segs = buildSegments(makeTree([root, c1, c2]), root);
    expect(segs.map((s) => s.text).join("")).toBe(CONTENT);
  });
});
