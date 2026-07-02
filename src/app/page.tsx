"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import ReadingPanel from "@/components/ReadingPanel";
import { deleteTree, toggleCollapsed, useTreeStore } from "@/lib/store";
import { expandAsk, expandSpan, startTree } from "@/lib/expand";
import { syncCollapsed, syncTreeDeleted } from "@/lib/sync";
import { initAuth, useAuthInfo } from "@/lib/authState";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { GUEST_NODE_LIMIT } from "@/lib/planLimits";
import { useI18n } from "@/lib/i18n";
import { useIsMobile } from "@/lib/useIsMobile";

const GraphView = dynamic(() => import("@/components/GraphView"), { ssr: false });

export default function Home() {
  const { trees } = useTreeStore();
  const { t, locale } = useI18n();
  const isMobile = useIsMobile();
  // モバイルではドロワー扱いなので初期状態は閉じる (SSR中は判定不能なので開)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches
  );
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [blankMode, setBlankMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    initAuth();
  }, []);

  useEffect(() => {
    const cacheKey = `sondeur.suggestions.${locale}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as { date: string; suggestions: string[] };
        const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
        if (cached.date === today && cached.suggestions?.length > 0) {
          setSuggestions(cached.suggestions);
          return;
        }
      }
    } catch {}
    setSuggestions(null);
    fetch(`/api/suggestions?lang=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.suggestions) && d.suggestions.length > 0) {
          setSuggestions(d.suggestions);
          try { localStorage.setItem(cacheKey, JSON.stringify({ date: d.date, suggestions: d.suggestions })); } catch {}
        }
      })
      .catch(() => {});
  }, [locale]);

  const treeList = useMemo(
    () => Object.values(trees).sort((a, b) => b.updatedAt - a.updatedAt),
    [trees]
  );
  const tree = selectedTreeId ? trees[selectedTreeId] ?? null : null;
  const selectedNode = tree && selectedNodeId ? tree.nodes[selectedNodeId] ?? null : null;

  const auth = useAuthInfo();
  const totalNodes = useMemo(
    () => Object.values(trees).reduce((acc, t) => acc + Object.keys(t.nodes).length, 0),
    [trees]
  );
  const [guestBlocked, setGuestBlocked] = useState(false);
  const guardGuestLimit = (): boolean => {
    if (!isSupabaseConfigured()) return true;
    if (auth.kind === "signedIn") return true;
    if (totalNodes >= GUEST_NODE_LIMIT) {
      setGuestBlocked(true);
      return false;
    }
    return true;
  };

  const launch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || !guardGuestLimit()) return;
    const { treeId, nodeId } = startTree(trimmed);
    setSelectedTreeId(treeId);
    setSelectedNodeId(nodeId);
    setQuestion("");
    setBlankMode(false);
  };

  const handleExpand = (op: "what" | "why", span: string, start: number, end: number) => {
    if (!tree || !selectedNode || !guardGuestLimit()) return;
    const nodeId = expandSpan(tree, selectedNode.id, op, span, start, end);
    setSelectedNodeId(nodeId);
  };

  const handleAsk = (q: string, span: string, start: number, end: number) => {
    if (!tree || !selectedNode || !guardGuestLimit()) return;
    const nodeId = expandAsk(tree, selectedNode.id, q, span, start, end);
    setSelectedNodeId(nodeId);
  };

  if (!mounted) {
    return <div className="h-dvh" />;
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {guestBlocked && auth.kind !== "signedIn" && (
        <div className="neu-raised fade-up fixed left-1/2 top-6 z-30 w-[min(30rem,85vw)] -translate-x-1/2 rounded-2xl px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[13px] leading-6 text-slate-600">
              {t("home.guestBlocked", { limit: String(GUEST_NODE_LIMIT) })}
              <br />
              <span className="font-semibold text-navy">{t("home.guestBlockedCta")}</span>
            </div>
            <button
              onClick={() => setGuestBlocked(false)}
              className="shrink-0 rounded px-1.5 text-slate-400 hover:text-slate-600"
              aria-label={t("home.close")}
            >
              ✕
            </button>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {t("home.guestBlockedHint")}
          </div>
        </div>
      )}

      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        trees={treeList}
        selectedTreeId={selectedTreeId}
        onSelectTree={(id) => {
          setSelectedTreeId(id);
          setSelectedNodeId(trees[id]?.rootNodeId ?? null);
          if (isMobile) setSidebarOpen(false);
        }}
        onSelectNode={(treeId, nodeId) => {
          setSelectedTreeId(treeId);
          setSelectedNodeId(nodeId);
          if (isMobile) setSidebarOpen(false);
        }}
        onNewTree={() => {
          setSelectedTreeId(null);
          setSelectedNodeId(null);
          setBlankMode(false);
        }}
        onNewNote={() => {
          setSelectedTreeId(null);
          setSelectedNodeId(null);
          setBlankMode(true);
        }}
        onDeleteTree={(id) => {
          deleteTree(id);
          syncTreeDeleted(id);
          if (selectedTreeId === id) {
            setSelectedTreeId(null);
            setSelectedNodeId(null);
          }
        }}
      />

      <div className="flex h-full min-w-0 flex-1">
        <div className="relative h-full min-w-0 flex-1">
          {tree ? (
            <>
              <GraphView
                tree={tree}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onToggleCollapse={(id) => {
                  toggleCollapsed(tree.id, id);
                  syncCollapsed(tree.id, id);
                }}
              />
              <div className="fixed bottom-5 left-1/2 z-20 w-[min(36rem,55vw)] -translate-x-1/2 max-md:w-[calc(100vw-1.5rem)]">
                <div className="neu-raised flex gap-2 rounded-2xl p-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) launch(question);
                    }}
                    placeholder={t("home.placeholderActive")}
                    className="neu-inset min-w-0 flex-1 rounded-xl px-4 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none"
                  />
                  <button
                    onClick={() => launch(question)}
                    disabled={!question.trim()}
                    className="shrink-0 rounded-xl bg-navy px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                  >
                    {t("home.submit")}
                  </button>
                </div>
              </div>
            </>
          ) : blankMode ? (
            <>
              <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
                <svg className="ring-pop" width="90" height="90">
                  <circle
                    cx="45" cy="45" r="41"
                    fill="none" stroke="#2f4a7c" strokeWidth="2.5" strokeOpacity="0.9"
                  />
                </svg>
              </div>
              {/* What / Why / Ask legend */}
              <div className="neu-raised-sm pointer-events-none absolute left-16 top-4 flex flex-col gap-1.5 rounded-xl px-3.5 py-2.5 text-[11px] text-slate-500 fade-up">
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
              <div className="fixed inset-x-0 bottom-5 flex justify-center">
              <div className="neu-raised fade-up flex w-[min(36rem,55vw)] gap-2 rounded-2xl p-2 max-md:w-[calc(100vw-1.5rem)]">
                <input
                  autoFocus
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) launch(question);
                  }}
                  placeholder={t("home.placeholderActive")}
                  className="neu-inset min-w-0 flex-1 rounded-xl px-4 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none"
                />
                <button
                  onClick={() => launch(question)}
                  disabled={!question.trim()}
                  className="shrink-0 rounded-xl bg-navy px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  {t("home.submit")}
                </button>
              </div>
              </div>
            </>
          ) : (
            <div className="pointer-events-none fixed inset-0 flex flex-col items-center" style={{ paddingTop: "calc(50dvh - 9rem)" }}>
              <div className="pointer-events-auto flex flex-col items-center">
              <h1 className="fade-up mb-2 text-3xl font-bold tracking-wide text-slate-700">
                Sondeur
              </h1>
              <p className="fade-up mb-6 text-sm text-slate-500" style={{ animationDelay: "0.1s" }}>
                {t("home.tagline")}
              </p>
              <div className="relative mb-8 flex h-28 w-28 items-center justify-center">
                <div className="sonar-ring absolute inset-0 rounded-full border-2 border-navy/30" />
                <div className="sonar-ring sonar-ring-2 absolute inset-0 rounded-full border-2 border-navy/20" />
                <div className="neu-raised flex h-16 w-16 items-center justify-center rounded-full">
                  <div className="h-3.5 w-3.5 rounded-full bg-navy" />
                </div>
              </div>
              <div
                className="neu-raised fade-up flex w-[min(36rem,85vw)] gap-2 rounded-2xl p-2"
                style={{ animationDelay: "0.2s" }}
              >
                <input
                  autoFocus
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) launch(question);
                  }}
                  placeholder={t("home.placeholder")}
                  className="neu-inset min-w-0 flex-1 rounded-xl px-4 py-2.5 text-[15px] text-slate-700 placeholder-slate-400 outline-none"
                />
                <button
                  onClick={() => launch(question)}
                  disabled={!question.trim()}
                  className="shrink-0 rounded-xl bg-navy px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  {t("home.submit")}
                </button>
              </div>

              <div className="mt-5 min-h-[2rem]">
                {suggestions && (
                  <div className="fade-up flex max-w-[58rem] flex-wrap justify-center gap-3 max-md:px-4" style={{ animationDelay: "0.3s" }}>
                    {suggestions.map((q) => (
                      <button
                        key={q}
                        onClick={() => launch(q)}
                        className="neu-raised-sm rounded-full px-4 py-1.5 text-xs text-slate-500 transition-colors hover:text-navy"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              </div>
            </div>
          )}
        </div>

        {/* 読みパネル: デスクトップ=右サイド / モバイル=ボトムシート (max-md で軸を translate-y に切替) */}
        <div
          className={`fixed inset-y-0 right-0 z-10 w-[clamp(300px,30vw,540px)] transform transition-transform duration-300 max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:z-30 max-md:h-[62dvh] max-md:w-full ${
            tree && selectedNode
              ? "translate-x-0 translate-y-0"
              : "translate-x-full max-md:translate-x-0 max-md:translate-y-full"
          }`}
        >
          {tree && selectedNode && (
            <ReadingPanel
              tree={tree}
              node={selectedNode}
              onClose={() => setSelectedNodeId(null)}
              onExpand={handleExpand}
              onAsk={handleAsk}
              onJumpToNode={setSelectedNodeId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
