"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { regenerateNode, retryIfQuotaError } from "@/lib/expand";
import { useI18n } from "@/lib/i18n";
import { buildSegments, type ChildEdge, type Segment } from "@/lib/segments";
import type { ReactNode } from "react";
import type { SondeurNode, Tree } from "@/lib/types";

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
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
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

interface PillState {
  x: number;
  y: number;
  span: string;
  start: number;
  end: number;
  asking: boolean;
}

const HIGHLIGHT_CLASS: Record<ChildEdge, string> = {
  what: "bg-navy/10 text-navy underline decoration-navy/50 hover:bg-navy/20",
  why: "bg-wine/10 text-wine underline decoration-wine/50 decoration-dashed hover:bg-wine/20",
  ask: "bg-gold/15 text-gold underline decoration-gold/60 decoration-dotted hover:bg-gold/25",
};

const HIGHLIGHT_TITLE_KEY: Record<ChildEdge, string> = {
  what: "panel.highlightWhat",
  why: "panel.highlightWhy",
  ask: "panel.highlightAsk",
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
  onAsk: (question: string, span: string, start: number, end: number) => void;
  onJumpToNode: (id: string) => void;
}) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pillInputRef = useRef<HTMLInputElement>(null);
  const [pill, setPill] = useState<PillState | null>(null);
  const [pillQuestion, setPillQuestion] = useState("");
  const [nodeQuestion, setNodeQuestion] = useState("");
  const [copied, setCopied] = useState(false);

  const segments: Segment[] = useMemo(() => buildSegments(tree, node), [tree, node]);

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
    const pre = range.cloneRange();
    pre.selectNodeContents(container);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const rect = range.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    // タッチ端末はネイティブの選択ハンドル/コピーメニューが選択範囲の上に出るので、ピルは下に出す
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setPill({
      x: rect.left + rect.width / 2 - panelRect.left,
      y: coarse ? rect.bottom - panelRect.top + 52 : rect.top - panelRect.top,
      span: text,
      start,
      end: start + text.length,
      asking: false,
    });
    setPillQuestion("");
  }, []);

  useEffect(() => {
    setPill(null);
    setPillQuestion("");
    setNodeQuestion("");
    setCopied(false);
    retryIfQuotaError(tree, node.id);
  }, [node.id]);

  useEffect(() => {
    const onDocSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setPill((p) => (p?.asking ? p : null));
    };
    document.addEventListener("selectionchange", onDocSelectionChange);
    return () => document.removeEventListener("selectionchange", onDocSelectionChange);
  }, []);

  // タッチ端末: 長押し選択後にハンドルで範囲を調整すると touchend が来ないので、
  // selectionchange を debounce してピルを追従させる
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    let timer: number | undefined;
    const onSel = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(handleSelection, 350);
    };
    document.addEventListener("selectionchange", onSel);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", onSel);
    };
  }, [handleSelection]);

  const validPill = (): PillState | null => {
    if (!pill) return null;
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
    node.edgeType === "root" ? t("panel.edgeRoot")
    : node.edgeType === "what" ? "What is it"
    : node.edgeType === "why" ? "Why is it"
    : t("panel.edgeAsk");

  const headerTitle = node.edgeType === "ask" ? node.question ?? node.selectedSpan : node.selectedSpan;

  return (
    <div
      ref={panelRef}
      className="relative flex h-full w-full flex-col border-l border-[#d8dde8] bg-background shadow-[-8px_0_24px_rgba(150,160,180,0.18)] max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t max-md:shadow-[0_-8px_24px_rgba(150,160,180,0.18)]"
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
              <span className="ml-2 font-normal text-slate-400">{t("panel.about", { span: node.selectedSpan })}</span>
            ) : null}
          </div>
          <div className="truncate text-sm font-medium text-slate-700" title={headerTitle}>
            {headerTitle}
          </div>
        </div>
        <button
          onClick={onClose}
          className="relative flex w-7 shrink-0 items-center justify-center rounded-lg pt-[6px] pb-[8px] text-sm leading-none text-slate-400 transition-colors hover:neu-flat hover:text-slate-600"
          aria-label={t("panel.close")}
        >
          <span>✕</span>
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
                title={t(HIGHLIGHT_TITLE_KEY[seg.childEdge!])}
                className={`cursor-pointer rounded-sm px-0.5 transition-colors ${HIGHLIGHT_CLASS[seg.childEdge!]}`}
              >
                {renderWithCitations(seg.text)}
              </span>
            ) : (
              <span key={seg.start}>{renderWithCitations(seg.text)}</span>
            )
          )}
          {node.status === "streaming" && (
            <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-slate-400 align-middle" />
          )}
        </div>
        {node.status === "error" && node.content.length === 0 && (
          <div className="mt-4 text-sm text-rose-400">{t("panel.generationFailed")}</div>
        )}
        {node.status === "done" && node.content.length > 0 && (
          <div className="mt-4 flex items-center gap-1.5">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(node.content).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className="rounded p-1 text-slate-400 transition-colors hover:text-slate-600"
              title={t("panel.copy")}
            >
              {copied ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              )}
            </button>
            <button
              onClick={() => regenerateNode(tree, node.id)}
              className="rounded p-1 text-slate-400 transition-colors hover:text-slate-600"
              title={t("panel.regenerate")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-[#d8dde8] px-3 py-2.5">
        <div className="flex gap-2">
          <input
            value={nodeQuestion}
            onChange={(e) => setNodeQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) fireNodeAsk();
            }}
            disabled={node.status !== "done"}
            placeholder={t("panel.questionPlaceholder")}
            className="neu-inset min-w-0 flex-1 rounded-xl px-3.5 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none disabled:opacity-40"
          />
          <button
            onClick={fireNodeAsk}
            disabled={!nodeQuestion.trim() || node.status !== "done"}
            className="shrink-0 rounded-xl bg-gold px-3.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {t("panel.questionSubmit")}
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
                placeholder={t("panel.pillAskPlaceholder", { span: pill.span.length > 12 ? pill.span.slice(0, 12) + "…" : pill.span })}
                className="neu-inset w-64 rounded-full px-3.5 py-1 text-sm text-slate-700 placeholder-slate-400 outline-none max-md:w-48"
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
                What
              </button>
              <div className="w-px bg-[#d8dde8]" />
              <button
                onClick={() => firePill("why")}
                className="px-4 py-2 text-sm font-semibold text-wine hover:bg-wine/10"
              >
                Why
              </button>
              <div className="w-px bg-[#d8dde8]" />
              <button
                onClick={() => {
                  setPill((p) => (p ? { ...p, asking: true } : p));
                  setTimeout(() => pillInputRef.current?.focus(), 0);
                }}
                className="px-4 py-2 text-sm font-semibold text-gold hover:bg-gold/10"
              >
                Ask
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
