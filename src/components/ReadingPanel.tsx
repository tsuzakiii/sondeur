"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { childrenOf } from "@/lib/store";
import { retryIfQuotaError } from "@/lib/expand";
import type { SondeurNode, Tree } from "@/lib/types";

interface PillState {
  x: number;
  y: number;
  span: string;
  start: number;
  end: number;
  /** ✏️ 質問を押してインライン入力モードに切り替わったか */
  asking: boolean;
}

type ChildEdge = "what" | "why" | "ask";

interface Segment {
  text: string;
  start: number;
  /** この区間を掘った既存の子ノード (あれば) */
  childId: string | null;
  childEdge: ChildEdge | null;
}

const HIGHLIGHT_CLASS: Record<ChildEdge, string> = {
  what: "bg-navy/10 text-navy underline decoration-navy/50 hover:bg-navy/20",
  why: "bg-wine/10 text-wine underline decoration-wine/50 decoration-dashed hover:bg-wine/20",
  ask: "bg-gold/15 text-gold underline decoration-gold/60 decoration-dotted hover:bg-gold/25",
};

const HIGHLIGHT_TITLE: Record<ChildEdge, string> = {
  what: "What で掘り済み — クリックで移動",
  why: "Why で掘り済み — クリックで移動",
  ask: "質問済み — クリックで移動",
};

export default function ReadingPanel({
  tree,
  node,
  onClose,
  onExpand,
  onAsk,
  onJumpToNode,
}: {
  tree: Tree;
  node: SondeurNode;
  onClose: () => void;
  onExpand: (op: "what" | "why", span: string, start: number, end: number) => void;
  /** 自由質問。span が空文字ならノード全体への質問 */
  onAsk: (question: string, span: string, start: number, end: number) => void;
  onJumpToNode: (id: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pillInputRef = useRef<HTMLInputElement>(null);
  const [pill, setPill] = useState<PillState | null>(null);
  const [pillQuestion, setPillQuestion] = useState("");
  const [nodeQuestion, setNodeQuestion] = useState("");

  // 掘り済みスパン (親本文内オフセット持ちの子ノード) → ハイライト区間
  const segments: Segment[] = useMemo(() => {
    const children = childrenOf(tree, node.id).filter(
      (c) => c.spanStart >= 0 && c.spanEnd <= node.content.length && c.spanStart < c.spanEnd
    );
    // 重複・入れ子は先勝ちで平坦化
    const sorted = [...children].sort((a, b) => a.spanStart - b.spanStart);
    const segs: Segment[] = [];
    let cursor = 0;
    for (const c of sorted) {
      if (c.spanStart < cursor) continue; // 重なりはスキップ
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
  }, [tree, node]);

  const handleSelection = useCallback(() => {
    const container = contentRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPill((p) => (p?.asking ? p : null));
      return;
    }
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setPill((p) => (p?.asking ? p : null));
      return;
    }
    const text = range.toString();
    if (!text.trim() || text.length > 200) {
      setPill((p) => (p?.asking ? p : null));
      return;
    }
    // コンテナ先頭から選択開始までのテキスト長 = オフセット
    const pre = range.cloneRange();
    pre.selectNodeContents(container);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const rect = range.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    setPill({
      x: rect.left + rect.width / 2 - panelRect.left,
      y: rect.top - panelRect.top,
      span: text,
      start,
      end: start + text.length,
      asking: false,
    });
    setPillQuestion("");
  }, []);

  // 表示ノードが切り替わったら古いピルを必ず捨てる (staleオフセット防止)
  // クオータエラーのノードを開いたら自動再生成
  useEffect(() => {
    setPill(null);
    setPillQuestion("");
    setNodeQuestion("");
    retryIfQuotaError(tree, node.id);
  }, [node.id]);

  useEffect(() => {
    const onDocSelectionChange = () => {
      const sel = window.getSelection();
      // 入力モード中は選択が消えてもピルを維持する
      if (!sel || sel.isCollapsed) setPill((p) => (p?.asking ? p : null));
    };
    document.addEventListener("selectionchange", onDocSelectionChange);
    return () => document.removeEventListener("selectionchange", onDocSelectionChange);
  }, []);

  const validPill = (): PillState | null => {
    if (!pill) return null;
    // オフセットが現在の本文と一致しない場合は発火しない (staleオフセット防止)
    if (node.content.slice(pill.start, pill.end) !== pill.span) {
      setPill(null);
      return null;
    }
    return pill;
  };

  const firePill = (op: "what" | "why") => {
    const p = validPill();
    if (!p) return;
    onExpand(op, p.span, p.start, p.end);
    setPill(null);
    window.getSelection()?.removeAllRanges();
  };

  const firePillAsk = () => {
    const p = validPill();
    const q = pillQuestion.trim();
    if (!p || !q) return;
    onAsk(q, p.span, p.start, p.end);
    setPill(null);
    setPillQuestion("");
    window.getSelection()?.removeAllRanges();
  };

  const fireNodeAsk = () => {
    const q = nodeQuestion.trim();
    if (!q) return;
    onAsk(q, "", -1, -1);
    setNodeQuestion("");
  };

  const edgeLabel =
    node.edgeType === "root" ? "問い"
    : node.edgeType === "what" ? "What is it"
    : node.edgeType === "why" ? "Why is it"
    : "質問";

  const headerTitle = node.edgeType === "ask" ? node.question ?? node.selectedSpan : node.selectedSpan;

  return (
    <div
      ref={panelRef}
      className="relative flex h-full w-full flex-col border-l border-[#d8dde8] bg-background shadow-[-8px_0_24px_rgba(150,160,180,0.18)]"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[#d8dde8] px-5 py-3.5">
        <div className="min-w-0">
          <div
            className={`text-xs font-semibold ${
              node.edgeType === "what"
                ? "text-navy"
                : node.edgeType === "why"
                ? "text-wine"
                : node.edgeType === "ask"
                ? "text-gold"
                : "text-navy"
            }`}
          >
            {edgeLabel}
            {node.edgeType === "ask" && node.selectedSpan ? (
              <span className="ml-2 font-normal text-slate-400">「{node.selectedSpan}」について</span>
            ) : null}
          </div>
          <div className="truncate text-sm font-medium text-slate-700" title={headerTitle}>
            {headerTitle}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div
          ref={contentRef}
          onMouseUp={handleSelection}
          onTouchEnd={handleSelection}
          className="sondeur-prose whitespace-pre-wrap"
        >
          {segments.map((seg) =>
            seg.childId ? (
              <span
                key={seg.start}
                onClick={() => onJumpToNode(seg.childId!)}
                title={HIGHLIGHT_TITLE[seg.childEdge!]}
                className={`cursor-pointer rounded-sm px-0.5 transition-colors ${HIGHLIGHT_CLASS[seg.childEdge!]}`}
              >
                {seg.text}
              </span>
            ) : (
              <span key={seg.start}>{seg.text}</span>
            )
          )}
          {node.status === "streaming" && (
            <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-slate-400 align-middle" />
          )}
        </div>
        {node.status === "error" && node.content.length === 0 && (
          <div className="mt-4 text-sm text-rose-400">生成に失敗しました。</div>
        )}
      </div>

      {/* ノード全体への自由質問 */}
      <div className="border-t border-[#d8dde8] px-3 py-2.5">
        <div className="flex gap-2">
          <input
            value={nodeQuestion}
            onChange={(e) => setNodeQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) fireNodeAsk();
            }}
            disabled={node.status !== "done"}
            placeholder="この説明について質問…"
            className="neu-inset min-w-0 flex-1 rounded-xl px-3.5 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none disabled:opacity-40"
          />
          <button
            onClick={fireNodeAsk}
            disabled={!nodeQuestion.trim() || node.status !== "done"}
            className="shrink-0 rounded-xl bg-gold px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            質問
          </button>
        </div>
      </div>

      {pill && node.status === "done" && (
        <div
          className="neu-raised pill-rise absolute z-20 overflow-hidden rounded-full"
          style={{
            left: Math.max(140, Math.min(pill.x, (panelRef.current?.clientWidth ?? 300) - 140)),
            top: Math.max(40, pill.y - 8),
          }}
          onMouseDown={(e) => {
            // 入力モードでは input にフォーカスが要るので preventDefault しない
            if (!pill.asking) e.preventDefault();
          }}
        >
          {pill.asking ? (
            <div className="flex items-center gap-1 px-2 py-1.5">
              <input
                ref={pillInputRef}
                value={pillQuestion}
                onChange={(e) => setPillQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) firePillAsk();
                  if (e.key === "Escape") setPill(null);
                }}
                placeholder={`「${pill.span.length > 12 ? pill.span.slice(0, 12) + "…" : pill.span}」について質問…`}
                className="neu-inset w-64 rounded-full px-3.5 py-1 text-sm text-slate-700 placeholder-slate-400 outline-none"
              />
              <button
                onClick={firePillAsk}
                disabled={!pillQuestion.trim()}
                className="rounded-full px-2 py-1 text-sm font-semibold text-gold hover:bg-gold/10 disabled:opacity-40"
              >
                ↵
              </button>
            </div>
          ) : (
            <div className="flex">
              <button
                onClick={() => firePill("what")}
                className="px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/10"
              >
                What is it
              </button>
              <div className="w-px bg-[#d8dde8]" />
              <button
                onClick={() => firePill("why")}
                className="px-4 py-2 text-sm font-semibold text-wine hover:bg-wine/10"
              >
                Why is it
              </button>
              <div className="w-px bg-[#d8dde8]" />
              <button
                onClick={() => {
                  setPill((p) => (p ? { ...p, asking: true } : p));
                  setTimeout(() => pillInputRef.current?.focus(), 0);
                }}
                className="px-4 py-2 text-sm font-semibold text-gold hover:bg-gold/10"
              >
                質問
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
