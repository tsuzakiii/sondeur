import { describe, expect, it } from "vitest";
import { computeVisibleWalk } from "@/components/visibleWalk";
import type { SondeurNode, Tree } from "@/lib/types";

function makeNode(id: string, parentId: string | null, collapsed = false): SondeurNode {
  return {
    id,
    treeId: "t",
    parentId,
    edgeType: parentId ? "what" : "root",
    selectedSpan: "",
    spanStart: -1,
    spanEnd: -1,
    content: "",
    status: "done",
    collapsed,
    createdAt: 0,
  };
}

function makeTree(nodesArr: SondeurNode[], rootId: string): Tree {
  const nodes: Record<string, SondeurNode> = {};
  for (const n of nodesArr) nodes[n.id] = n;
  return {
    id: "t",
    title: "t",
    rootNodeId: rootId,
    nodes,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("computeVisibleWalk (cycle safety)", () => {
  it("normal tree: 3 nodes, one collapsed → hiddenCount reports 1 descendant", () => {
    const nodes = [
      makeNode("root", null),
      makeNode("a", "root", true),
      makeNode("b", "a"),
    ];
    const { visibleNodes, hiddenCount } = computeVisibleWalk(makeTree(nodes, "root"));
    expect(visibleNodes.map((n) => n.id)).toEqual(["root", "a"]);
    expect(hiddenCount.get("a")).toBe(1);
  });

  it("cycle root ↔ a with a collapsed → does not stack overflow, does not inflate count with the cycle-back", () => {
    // root.parentId = a AND a.parentId = root → cycle
    const nodes = [
      makeNode("root", "a"),
      makeNode("a", "root", true),
    ];
    const { visibleNodes, hiddenCount } = computeVisibleWalk(makeTree(nodes, "root"));
    // walk 側では root と a の両方が visible (walk visited guard で無限再帰なし)
    expect(new Set(visibleNodes.map((n) => n.id))).toEqual(new Set(["root", "a"]));
    // a is collapsed. its descendants: filter で parentId === "a" は root だけ → root は
    // 既に visited (seenDescendant) なので cycle-back 除外で +1 されない → hiddenCount(a) === 0
    // (少なくとも 2 にはならないことが重要 — 2 だと "a と root" として root を数えている状態)
    expect(hiddenCount.get("a")).toBeLessThan(2);
  });

  it("collapsed root with parentId cycle back to descendant → hiddenCount not inflated by root itself", () => {
    // root(collapsed).parentId = a AND a.parentId = root → cycle
    const nodes = [
      makeNode("root", "a", true),
      makeNode("a", "root"),
    ];
    const { hiddenCount } = computeVisibleWalk(makeTree(nodes, "root"));
    // root is collapsed. countDescendants(root):
    //   seenDescendant.add("root")
    //   filter n.parentId === "root" → a (a.parentId = "root")
    //   +1 + countDescendants("a")
    //     seenDescendant.add("a")
    //     filter n.parentId === "a" && !seenDescendant.has(n.id) → root but root is visited → filter drops it → 0
    //   0
    //   total = 1
    // 実装が cycle-back を +1 として数えていれば 2 になる (root 自身の cycle-back)
    expect(hiddenCount.get("root")).toBe(1);
  });

  it("large legitimate tree (no cycle) counts correctly", () => {
    // root(collapsed) → a → b → c → d
    const nodes = [
      makeNode("root", null, true),
      makeNode("a", "root"),
      makeNode("b", "a"),
      makeNode("c", "b"),
      makeNode("d", "c"),
    ];
    const { hiddenCount } = computeVisibleWalk(makeTree(nodes, "root"));
    expect(hiddenCount.get("root")).toBe(4);
  });
});
