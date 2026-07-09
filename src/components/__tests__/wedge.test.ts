import { describe, expect, it } from "vitest";
import { BASE_ROTATION, computeWedgeAngles } from "@/components/wedge";
import type { SondeurNode } from "@/lib/types";

function makeNode(id: string, parentId: string | null, createdAt = id.charCodeAt(0)): SondeurNode {
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
    collapsed: false,
    createdAt,
  };
}

const TWO_PI = Math.PI * 2;
function normalize(a: number): number {
  const two = TWO_PI;
  let x = a % two;
  if (x <= -Math.PI) x += two;
  if (x > Math.PI) x -= two;
  return x;
}

describe("computeWedgeAngles", () => {
  it("(a) bare root tree places root at BASE_ROTATION", () => {
    const nodes: SondeurNode[] = [makeNode("root", null)];
    const angles = computeWedgeAngles(nodes, "root");
    expect(angles.get("root")).toBeCloseTo(BASE_ROTATION, 6);
    // 対角 (BASE_ROTATION + π) ではないこと
    const diff = Math.abs(normalize((angles.get("root") ?? 0) - (BASE_ROTATION + Math.PI)));
    expect(diff).toBeGreaterThan(0.1);
  });

  it("(b) single-child tree places the child at BASE_ROTATION", () => {
    const nodes: SondeurNode[] = [
      makeNode("root", null),
      makeNode("c1", "root"),
    ];
    const angles = computeWedgeAngles(nodes, "root");
    expect(angles.get("c1")).toBeCloseTo(BASE_ROTATION, 6);
    expect(angles.get("root")).toBeCloseTo(BASE_ROTATION, 6);
  });

  it("(c) two-child balanced tree places children symmetrically about BASE_ROTATION", () => {
    const nodes: SondeurNode[] = [
      makeNode("root", null),
      makeNode("c1", "root", 1),
      makeNode("c2", "root", 2),
    ];
    const angles = computeWedgeAngles(nodes, "root");
    const a1 = normalize((angles.get("c1") ?? 0) - BASE_ROTATION);
    const a2 = normalize((angles.get("c2") ?? 0) - BASE_ROTATION);
    // 符号反対、絶対値等しい
    expect(Math.sign(a1)).toBe(-Math.sign(a2));
    expect(Math.abs(a1)).toBeCloseTo(Math.abs(a2), 6);
    // total=2 なので slot 中心は (0.5, 1.5) / 2 = 0.25, 0.75 → 0.5π, 1.5π
    // BASE 基準の offset: 0.5π と 1.5π (== -0.5π)
    expect(Math.abs(a1)).toBeCloseTo(Math.PI / 2, 6);
  });

  it("(d) three-child tree places children at 2π/3 intervals", () => {
    const nodes: SondeurNode[] = [
      makeNode("root", null),
      makeNode("c1", "root", 1),
      makeNode("c2", "root", 2),
      makeNode("c3", "root", 3),
    ];
    const angles = computeWedgeAngles(nodes, "root");
    const offsets = ["c1", "c2", "c3"].map((id) => normalize((angles.get(id) ?? 0) - BASE_ROTATION));
    // 隣接差が 2π/3 (順序は BASE から時計回り)
    const sorted = offsets.slice().sort((a, b) => a - b);
    // 3 点間の差が均等
    const d1 = sorted[1] - sorted[0];
    const d2 = sorted[2] - sorted[1];
    // wrap を考慮: 円周上 3 等分 = 全ペア差が 2π/3 相当
    const gaps = [d1, d2, TWO_PI - (d1 + d2)];
    for (const g of gaps) expect(g).toBeCloseTo(TWO_PI / 3, 6);
  });
});
