import type { SondeurNode, Tree } from "@/lib/types";

// visible ノード列と、collapsed 節点ごとの hidden 子孫数を計算する。
// parentId が cycle した壊れたツリー (sync merge の regression 等) で stack overflow
// しないよう、visited Set で再訪を止める。cycle-back child は "same node revisited"
// なので count に含めない (child filter で除外する — visited flag を先に立てて
// filter が跳ねるようにする)。store.ts の depthOf と同じ思想。

export interface VisibleWalkResult {
  visibleNodes: SondeurNode[];
  hiddenCount: Map<string, number>;
}

export function computeVisibleWalk(tree: Tree): VisibleWalkResult {
  const visible: SondeurNode[] = [];
  const hidden = new Map<string, number>();
  const seenDescendant = new Set<string>();

  const countDescendants = (id: string): number => {
    if (seenDescendant.has(id)) return 0;
    seenDescendant.add(id);
    // filter 側でも既訪 child を除外して cycle-back を +1 として数えないようにする
    return Object.values(tree.nodes)
      .filter((n) => n.parentId === id && !seenDescendant.has(n.id))
      .reduce((acc, c) => acc + 1 + countDescendants(c.id), 0);
  };

  const walked = new Set<string>();
  const walk = (id: string) => {
    if (walked.has(id)) return;
    walked.add(id);
    const node = tree.nodes[id];
    if (!node) return;
    visible.push(node);
    if (node.collapsed) {
      hidden.set(id, countDescendants(id));
      return;
    }
    const children = Object.values(tree.nodes).filter((n) => n.parentId === id);
    for (const c of children) walk(c.id);
  };
  walk(tree.rootNodeId);
  return { visibleNodes: visible, hiddenCount: hidden };
}
