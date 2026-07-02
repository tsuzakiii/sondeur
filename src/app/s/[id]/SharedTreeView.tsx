"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { SondeurNode, Tree } from "@/lib/types";
import type { ReactNode } from "react";

const GraphView = dynamic(() => import("@/components/GraphView"), { ssr: false });

const CITE_RE = /\(?\[([^\]]+)\]\((https?:\/\/[^)]+)\)\)?/g;

function renderWithCitations(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE_RE)) {
    const idx = m.index!;
    if (idx > last) parts.push(text.slice(last, idx));
    const label = m[1];
    const url = m[2].replace(/\?utm_source=openai$/, "");
    parts.push(
      <a
        key={idx}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-0.5 inline-flex items-center gap-0.5 rounded-md border border-navy/20 bg-navy/5 px-1.5 py-0.5 align-baseline text-[10px] leading-none text-navy/70 no-underline transition-colors hover:bg-navy/10 hover:text-navy"
      >
        <span className="text-[9px]">&#8599;</span>
        {label}
      </a>
    );
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type ChildEdge = "what" | "why" | "ask";

interface Segment {
  text: string;
  start: number;
  childId: string | null;
  childEdge: ChildEdge | null;
}

const HIGHLIGHT_CLASS: Record<ChildEdge, string> = {
  what: "bg-navy/10 text-navy underline decoration-navy/50 hover:bg-navy/20",
  why: "bg-wine/10 text-wine underline decoration-wine/50 decoration-dashed hover:bg-wine/20",
  ask: "bg-gold/15 text-gold underline decoration-gold/60 decoration-dotted hover:bg-gold/25",
};

function childrenOf(tree: Tree, nodeId: string): SondeurNode[] {
  return Object.values(tree.nodes)
    .filter((n) => n.parentId === nodeId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

function buildSegments(tree: Tree, node: SondeurNode): Segment[] {
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

export default function SharedTreeView({ tree }: { tree: Tree }) {
  const { t } = useI18n();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(tree.rootNodeId);
  const node = selectedNodeId ? tree.nodes[selectedNodeId] ?? null : null;

  const edgeLabel = node
    ? node.edgeType === "root" ? t("panel.edgeRoot")
      : node.edgeType === "what" ? "What is it"
      : node.edgeType === "why" ? "Why is it"
      : t("panel.edgeAsk")
    : "";
  const headerTitle = node
    ? node.edgeType === "ask" ? node.question ?? node.selectedSpan : node.selectedSpan
    : "";

  const segments = node ? buildSegments(tree, node) : [];

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <div className="relative h-full min-w-0 flex-1">
        <GraphView
          tree={tree}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onToggleCollapse={() => {}}
        />
      </div>
      {/* 読みパネル: デスクトップ=右サイド / モバイル=ボトムシート */}
      <div
        className={`fixed inset-y-0 right-0 z-10 w-[clamp(300px,30vw,540px)] transform transition-transform duration-300 max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:h-[62dvh] max-md:w-full ${
          node
            ? "translate-x-0 translate-y-0"
            : "translate-x-full max-md:translate-x-0 max-md:translate-y-full"
        }`}
      >
        {node && (
          <div className="relative flex h-full w-full flex-col border-l border-[#d8dde8] bg-background shadow-[-8px_0_24px_rgba(150,160,180,0.18)] max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t max-md:shadow-[0_-8px_24px_rgba(150,160,180,0.18)]">
            <div className="flex items-start justify-between gap-2 border-b border-[#d8dde8] px-5 py-3.5">
              <div className="min-w-0">
                <div
                  className={`text-xs font-semibold ${
                    node.edgeType === "what" ? "text-navy"
                    : node.edgeType === "why" ? "text-wine"
                    : node.edgeType === "ask" ? "text-gold"
                    : "text-navy"
                  }`}
                >
                  {edgeLabel}
                  {node.edgeType === "ask" && node.selectedSpan ? (
                    <span className="ml-2 font-normal text-slate-400">{t("panel.about", { span: node.selectedSpan })}</span>
                  ) : null}
                </div>
                <div className="truncate text-sm font-medium text-slate-700" title={headerTitle}>
                  {headerTitle}
                </div>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="relative flex w-7 shrink-0 items-center justify-center rounded-lg pt-[6px] pb-[8px] text-sm leading-none text-slate-400 transition-colors hover:neu-flat hover:text-slate-600 mt-1.5"
              >
                <span>✕</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="sondeur-prose whitespace-pre-wrap">
                {segments.map((seg) =>
                  seg.childId ? (
                    <span
                      key={seg.start}
                      onClick={() => setSelectedNodeId(seg.childId!)}
                      className={`cursor-pointer rounded-sm px-0.5 transition-colors ${HIGHLIGHT_CLASS[seg.childEdge!]}`}
                    >
                      {renderWithCitations(seg.text)}
                    </span>
                  ) : (
                    <span key={seg.start}>{renderWithCitations(seg.text)}</span>
                  )
                )}
              </div>
            </div>

            <div className="border-t border-[#d8dde8] px-5 py-3">
              <Link href="/" className="text-[12px] text-navy transition-opacity hover:opacity-70">
                Sondeur — Sound the depths of understanding
              </Link>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                <Link href="/about" className="transition-colors hover:text-slate-600">{t("legal.about")}</Link>
                <Link href="/legal/terms" className="transition-colors hover:text-slate-600">{t("legal.terms")}</Link>
                <Link href="/legal/privacy" className="transition-colors hover:text-slate-600">{t("legal.privacy")}</Link>
                <Link href="/legal/tokushoho" className="transition-colors hover:text-slate-600">{t("legal.tokushoho")}</Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
