import type { SondeurNode } from "@/lib/types";

// 深さ1段あたりの目標半径 (ウェッジ理想位置の同心円間隔)
export const RING = 130;
// 最初の葉が真上やや右から生え、時計回りに配る (真横スタートより木らしい)
export const BASE_ROTATION = -Math.PI / 2 + 0.35;

// 各ノードの「理想方角」を計算する。葉に円周上のスロットを in-order で割り当て
// (部分木 = 連続した角度ウェッジ)、内部ノードは自分の部分木の中央角を取る。
// 角度は葉数比例なので、アンバランスな実際の木では自然に不均等になる。
// この方角×深さ半径の理想位置へ弱い力で引き、charge/collide が有機的に揺らす —
// forceRadial (半径のみ制御・方角は成り行き) と違い、枝の重なり・交差・偏りが出ない。
export function computeWedgeAngles(nodes: SondeurNode[], rootId: string): Map<string, number> {
  // 親→子マップを一度だけ構築 (毎回の全走査を避ける)。兄弟順は createdAt →
  // id で安定ソートし、hydration/merge の順序に依らず決定的にする
  const childrenByParent = new Map<string, SondeurNode[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = childrenByParent.get(n.parentId);
    if (list) list.push(n);
    else childrenByParent.set(n.parentId, [n]);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  }

  // 一回の DFS で葉スロットの範囲 [min, max] を割り当てる
  const ranges = new Map<string, [number, number]>();
  let leafIdx = 0;
  const assign = (id: string): [number, number] => {
    const kids = childrenByParent.get(id) ?? [];
    if (kids.length === 0) {
      const slot = leafIdx;
      leafIdx += 1;
      ranges.set(id, [slot, slot]);
      return [slot, slot];
    }
    let mn = Infinity;
    let mx = -Infinity;
    for (const k of kids) {
      const [a, b] = assign(k.id);
      mn = Math.min(mn, a);
      mx = Math.max(mx, b);
    }
    ranges.set(id, [mn, mx]);
    return [mn, mx];
  };
  assign(rootId);

  const total = Math.max(1, leafIdx);
  const angles = new Map<string, number>();

  // 葉が 1 枚しかない木 (root だけ、または root + 唯一の子) の場合、汎用の
  // ((mn+mx)/2 + 0.5)/total = 0.5 → +π の位置に飛んで対角に描画されてしまう。
  // コメント冒頭の「真上やや右から生え」の意図に合わせて BASE_ROTATION に固定する。
  if (total === 1) {
    for (const id of ranges.keys()) angles.set(id, BASE_ROTATION);
    return angles;
  }

  // 角度はスロット中心 (slot + 0.5) 基準。内部ノードは部分木の中心角
  // ((mn+mx)/2 + 0.5) になり、境界基準の半スロット偏りが出ない
  for (const [id, [mn, mx]] of ranges) {
    angles.set(id, BASE_ROTATION + (((mn + mx) / 2 + 0.5) / total) * Math.PI * 2);
  }
  return angles;
}
