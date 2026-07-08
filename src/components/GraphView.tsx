"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from "d3-zoom";
import { drag } from "d3-drag";
import { depthOf } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import type { SondeurNode, Tree } from "@/lib/types";

interface SimNode extends SimulationNodeDatum {
  id: string;
  node: SondeurNode;
  depth: number;
  hiddenChildren: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  edgeType: "what" | "why" | "ask";
}

// 白背景パレット: What=紺 / Why=ワインレッド / 自由質問=黄
const EDGE_COLOR: Record<string, string> = { what: "#2f4a7c", why: "#8e3a52", ask: "#b8912a" };
const EDGE_DASH: Record<string, string | null> = { what: null, why: "6 4", ask: "2 4" };
const ROOT_COLOR = "#2f4a7c";

function nodeRadius(depth: number): number {
  // ルートは明確に大きく、どこから木が伸びているか一目でわかるように
  if (depth === 0) return 34;
  return Math.max(9, 20 - (depth - 1) * 3);
}

// 深さ1段あたりの目標半径 (ウェッジ理想位置の同心円間隔)
const RING = 130;
// 最初の葉が真上やや右から生え、時計回りに配る (真横スタートより木らしい)
const BASE_ROTATION = -Math.PI / 2 + 0.35;

// 各ノードの「理想方角」を計算する。葉に円周上のスロットを in-order で割り当て
// (部分木 = 連続した角度ウェッジ)、内部ノードは自分の部分木の中央角を取る。
// 角度は葉数比例なので、アンバランスな実際の木では自然に不均等になる。
// この方角×深さ半径の理想位置へ弱い力で引き、charge/collide が有機的に揺らす —
// forceRadial (半径のみ制御・方角は成り行き) と違い、枝の重なり・交差・偏りが出ない。
function computeWedgeAngles(nodes: SondeurNode[], rootId: string): Map<string, number> {
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

  // 角度はスロット中心 (slot + 0.5) 基準。内部ノードは部分木の中心角
  // ((mn+mx)/2 + 0.5) になり、境界基準の半スロット偏りが出ない
  const total = Math.max(1, leafIdx);
  const angles = new Map<string, number>();
  for (const [id, [mn, mx]] of ranges) {
    angles.set(id, BASE_ROTATION + (((mn + mx) / 2 + 0.5) / total) * Math.PI * 2);
  }
  return angles;
}

export default function GraphView({
  tree,
  selectedNodeId,
  onSelectNode,
  onToggleCollapse,
}: {
  tree: Tree;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const lastCenterRef = useRef<{ x: number; y: number } | null>(null);
  const lastRectRef = useRef<{ left: number; top: number } | null>(null);
  const callbacksRef = useRef({ onSelectNode, onToggleCollapse });

  useEffect(() => {
    callbacksRef.current = { onSelectNode, onToggleCollapse };
  }, [onSelectNode, onToggleCollapse]);

  // collapsed ノードの子孫を除いた可視ノード集合
  const { visibleNodes, visibleLinks, hiddenCount } = useMemo(() => {
    const visible: SondeurNode[] = [];
    const hidden = new Map<string, number>();
    const countDescendants = (id: string): number =>
      Object.values(tree.nodes)
        .filter((n) => n.parentId === id)
        .reduce((acc, c) => acc + 1 + countDescendants(c.id), 0);
    const walk = (id: string) => {
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
    const links = visible
      .filter((n) => n.parentId && n.edgeType !== "root")
      .map((n) => ({ source: n.parentId!, target: n.id, edgeType: n.edgeType as "what" | "why" | "ask" }));
    return { visibleNodes: visible, visibleLinks: links, hiddenCount: hidden };
  }, [tree]);

  // 本文ストリーミングの度に simulation を再構築しないよう、構造変化のみに反応する
  const structureKey = useMemo(
    () =>
      visibleNodes.map((n) => `${n.id}:${n.status}:${n.collapsed}`).join("|") +
      `#${selectedNodeId ?? ""}`,
    [visibleNodes, selectedNodeId]
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const { height } = rect;
    // ノード座標は「ウィンドウ座標系」で持つ。svg の位置ずれは g.offset の translate で吸収するため、
    // サイドバー/パネルの開閉でノードのシミュレーション座標は一切動かない
    const centerX = window.innerWidth / 2;
    const centerY = rect.top + height / 2;
    lastCenterRef.current = { x: centerX, y: centerY };

    // 既存位置を保ちつつ SimNode を構築
    const prev = simNodesRef.current;
    const simNodes: SimNode[] = visibleNodes.map((n) => {
      const existing = prev.get(n.id);
      const depth = depthOf(tree, n.id);
      const hiddenChildren = hiddenCount.get(n.id) ?? 0;
      if (existing) {
        existing.node = n;
        existing.depth = depth;
        existing.hiddenChildren = hiddenChildren;
        return existing;
      }
      // 新ノードは親の近くから生やす
      const parentSim = n.parentId ? prev.get(n.parentId) : undefined;
      return {
        id: n.id,
        node: n,
        depth,
        hiddenChildren,
        x: (parentSim?.x ?? centerX) + (Math.random() - 0.5) * 40,
        y: (parentSim?.y ?? centerY) + (Math.random() - 0.5) * 40,
      };
    });
    simNodesRef.current = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = visibleLinks.map((l) => ({ ...l }));

    const root = select(svg);
    let g = root.select<SVGGElement>("g.viewport");
    if (g.empty()) {
      g = root.append("g").attr("class", "viewport");
      const zoomBehavior = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", (event) => g.attr("transform", event.transform));
      zoomRef.current = zoomBehavior;
      root.call(zoomBehavior).on("dblclick.zoom", null);
      // ノード座標はウィンドウ座標系。svg の画面上の位置ずれは初期ズーム変換に焼き込む
      root.call(zoomBehavior.transform, zoomIdentity.translate(-rect.left, -rect.top));
      lastRectRef.current = { left: rect.left, top: rect.top };
    }

    const linkSel = g
      .selectAll<SVGLineElement, SimLink>("line.edge")
      .data(simLinks, (d) => `${typeof d.source === "object" ? (d.source as SimNode).id : d.source}->${typeof d.target === "object" ? (d.target as SimNode).id : d.target}`)
      .join("line")
      .attr("class", "edge")
      .attr("stroke", (d) => EDGE_COLOR[d.edgeType])
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.45)
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", (d) => EDGE_DASH[d.edgeType]);

    const nodeSel = g
      .selectAll<SVGGElement, SimNode>("g.node")
      .data(simNodes, (d) => d.id)
      .join((enter) => {
        const ng = enter.append("g").attr("class", "node").attr("cursor", "pointer");
        ng.append("circle").attr("class", "ping");
        ng.append("circle").attr("class", "ring"); // ルート用の外周リング
        ng.append("circle").attr("class", "body spawn");
        ng.append("text")
          .attr("class", "label")
          .attr("text-anchor", "middle")
          .attr("font-size", 11)
          .attr("pointer-events", "none");
        ng.append("text")
          .attr("class", "badge")
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("fill", "#ffffff")
          .attr("font-size", 10)
          .attr("font-weight", 700)
          .attr("pointer-events", "none");
        return ng;
      });

    const nodeColor = (d: SimNode) =>
      d.node.edgeType === "root" ? ROOT_COLOR : EDGE_COLOR[d.node.edgeType] ?? "#64748b";

    nodeSel
      .select<SVGCircleElement>("circle.body")
      .attr("r", (d) => nodeRadius(d.depth))
      .attr("fill", nodeColor);

    // 外周リング: ルート (木の起点) と選択中ノードに表示
    nodeSel
      .select<SVGCircleElement>("circle.ring")
      .attr("r", (d) => nodeRadius(d.depth) + 7)
      .attr("fill", "none")
      .attr("stroke", (d) => (d.id === selectedNodeId ? nodeColor(d) : ROOT_COLOR))
      .attr("stroke-width", (d) => (d.id === selectedNodeId ? 2.5 : 1.5))
      .attr("stroke-opacity", (d) => (d.id === selectedNodeId ? 0.9 : 0.5))
      .attr("display", (d) =>
        d.node.edgeType === "root" || d.id === selectedNodeId ? null : "none"
      );

    // 生成中のソナーピング (波紋)
    nodeSel
      .select<SVGCircleElement>("circle.ping")
      .attr("r", (d) => nodeRadius(d.depth))
      .attr("fill", "none")
      .attr("stroke", nodeColor)
      .attr("stroke-width", 1.5)
      .attr("display", (d) => (d.node.status === "streaming" ? null : "none"));

    nodeSel
      .select<SVGTextElement>("text.label")
      .attr("dy", (d) => nodeRadius(d.depth) + 16)
      .attr("font-weight", (d) => (d.node.edgeType === "root" ? 700 : 500))
      .text((d) => {
        const raw = d.node.edgeType === "ask" ? d.node.question ?? d.node.selectedSpan : d.node.selectedSpan;
        const t = raw.replace(/\s+/g, " ");
        return t.length > 14 ? t.slice(0, 14) + "…" : t;
      });

    nodeSel.select<SVGTextElement>("text.badge").text((d) => (d.hiddenChildren > 0 ? `+${d.hiddenChildren}` : ""));

    let suppressClick = false;
    nodeSel
      .on("click", (event: MouseEvent, d) => {
        if (suppressClick) return;
        event.stopPropagation();
        callbacksRef.current.onSelectNode(d.id);
      })
      .on("dblclick", (event: MouseEvent, d) => {
        event.stopPropagation();
        callbacksRef.current.onToggleCollapse(d.id);
      });

    // ラベル幅を見込んだ衝突半径 (ラベルはノード直下に出るので、文字数分の横幅を確保する)
    const collideRadius = (d: SimNode) => {
      const raw = d.node.edgeType === "ask" ? d.node.question ?? d.node.selectedSpan : d.node.selectedSpan;
      const labelChars = Math.min(15, raw.replace(/\s+/g, " ").length);
      return Math.max(nodeRadius(d.depth) + 18, (labelChars * 11) / 2 + 8);
    };

    // ウェッジ理想位置 (方角×深さ半径) への弱い引力。構造が変わるたびに角度を
    // 計算し直すので、枝が増えると既存の枝が滑らかに譲り合って再配分される。
    // 中心はリサイズで動くため lastCenterRef 経由で読む (RO 側で再設定する)
    const wedgeAngles = computeWedgeAngles(visibleNodes, tree.rootNodeId);
    const targetX = (d: SimNode) => {
      const c = lastCenterRef.current ?? { x: centerX, y: centerY };
      return c.x + (d.depth === 0 ? 0 : Math.cos(wedgeAngles.get(d.id) ?? 0) * d.depth * RING);
    };
    const targetY = (d: SimNode) => {
      const c = lastCenterRef.current ?? { x: centerX, y: centerY };
      return c.y + (d.depth === 0 ? 0 : Math.sin(wedgeAngles.get(d.id) ?? 0) * d.depth * RING);
    };

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => 80 + nodeRadius((d.source as SimNode).depth))
          .strength(0.7)
      )
      .force("charge", forceManyBody().strength(-120))
      .force("center", forceCenter(centerX, centerY).strength(0.03))
      .force("tx", forceX<SimNode>(targetX).strength(0.22))
      .force("ty", forceY<SimNode>(targetY).strength(0.22))
      .force("collide", forceCollide<SimNode>().radius(collideRadius).strength(0.9))
      .alpha(0.6)
      .alphaDecay(0.04);

    sim.on("tick", () => {
      // エッジはノードの中心ではなく円周で止める (ノードの下に線を通さない)
      linkSel.each(function (d) {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        const dx = (t.x ?? 0) - (s.x ?? 0);
        const dy = (t.y ?? 0) - (s.y ?? 0);
        const dist = Math.hypot(dx, dy) || 1;
        const sr = nodeRadius(s.depth) + 1;
        const tr = nodeRadius(t.depth) + 1;
        select(this)
          .attr("x1", (s.x ?? 0) + (dx / dist) * sr)
          .attr("y1", (s.y ?? 0) + (dy / dist) * sr)
          .attr("x2", (t.x ?? 0) - (dx / dist) * tr)
          .attr("y2", (t.y ?? 0) - (dy / dist) * tr);
      });
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    const dragBehavior = drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        suppressClick = false;
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        suppressClick = true;
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        // click イベントは drag end の後に発火するので少し待ってから解除
        setTimeout(() => (suppressClick = false), 0);
      });
    nodeSel.call(dragBehavior);

    // コンテナサイズ変化 (サイドバー格納 / パネル開閉 / ウィンドウリサイズ) に追従して
    // ノード群を新しい中心へ差分シフトする
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // サイドバー開閉等による svg の位置ずれはズーム変換の補正だけで吸収 (ノード座標は不動)
      const lastRect = lastRectRef.current;
      if (lastRect && (r.left !== lastRect.left || r.top !== lastRect.top)) {
        const t = zoomTransform(svg);
        zoomRef.current?.translateBy(
          root,
          -(r.left - lastRect.left) / t.k,
          -(r.top - lastRect.top) / t.k
        );
      }
      lastRectRef.current = { left: r.left, top: r.top };
      // ウィンドウ自体のリサイズで中心が変わった時だけ、クラスタを新しい中心へシフトする
      const next = { x: window.innerWidth / 2, y: r.top + r.height / 2 };
      const last = lastCenterRef.current;
      if (!last || (next.x === last.x && next.y === last.y)) return;
      const dx = next.x - last.x;
      const dy = next.y - last.y;
      lastCenterRef.current = next;
      for (const n of simNodesRef.current.values()) {
        if (n.x != null) n.x += dx;
        if (n.y != null) n.y += dy;
        if (n.fx != null) n.fx += dx;
        if (n.fy != null) n.fy += dy;
      }
      const center = sim.force("center") as ReturnType<typeof forceCenter> | undefined;
      center?.x(next.x).y(next.y);
      // forceX/Y はアクセサ評価値をキャッシュするので、新しい中心で再評価させる
      const tx = sim.force("tx") as ReturnType<typeof forceX<SimNode>> | undefined;
      tx?.x(targetX);
      const ty = sim.force("ty") as ReturnType<typeof forceY<SimNode>> | undefined;
      ty?.y(targetY);
      sim.alpha(0.15).restart();
    });
    // SVG要素はcontent boxを持たずROが発火しないため、親divを監視する
    ro.observe(svg.parentElement ?? svg);

    return () => {
      ro.disconnect();
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 本文の差分では再構築しない (structureKey が構造変化を代表する)
  }, [structureKey]);

  return (
    <div className="relative h-full w-full">
      <svg ref={svgRef} className="h-full w-full touch-none select-none">
        <style>{`
          circle.body {
            transition: opacity 0.2s ease;
          }
          g.node:hover circle.body {
            opacity: 0.85;
          }
          circle.body.spawn {
            animation: node-spawn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            transform-box: fill-box;
            transform-origin: center;
          }
          @keyframes node-spawn {
            from { transform: scale(0); }
            to { transform: scale(1); }
          }
          circle.ping {
            animation: node-ping 1.8s cubic-bezier(0.2, 0.6, 0.4, 1) infinite;
            transform-box: fill-box;
            transform-origin: center;
            pointer-events: none;
          }
          @keyframes node-ping {
            0% { transform: scale(1); opacity: 0.5; }
            100% { transform: scale(2.4); opacity: 0; }
          }
          text.label {
            fill: #4a5568;
            paint-order: stroke;
            stroke: rgba(232, 236, 243, 0.9);
            stroke-width: 3px;
            letter-spacing: 0.02em;
          }
        `}</style>
      </svg>
      {/* 凡例 — 色の意味づけ */}
      <div className="neu-raised-sm pointer-events-none absolute left-16 top-4 flex flex-col gap-1.5 rounded-xl px-3.5 py-2.5 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" stroke="#2f4a7c" strokeWidth="2" strokeLinecap="round" /></svg>
          <span><span className="font-semibold" style={{ color: "#2f4a7c" }}>What</span> — {t("graph.whatDesc")}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" stroke="#8e3a52" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 3" /></svg>
          <span><span className="font-semibold" style={{ color: "#8e3a52" }}>Why</span> — {t("graph.whyDesc")}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" stroke="#b8912a" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" /></svg>
          <span><span className="font-semibold" style={{ color: "#b8912a" }}>Ask</span> — {t("graph.askDesc")}</span>
        </div>
      </div>
    </div>
  );
}
