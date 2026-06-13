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

const GraphView = dynamic(() => import("@/components/GraphView"), { ssr: false });

const SAMPLE_QUESTIONS = [
  "LE-9エンジンとSSMEの違いは？",
  "NISAの税制優遇はどういう仕組み？",
  "TransformerとMambaは何がどう違う？",
];

export default function Home() {
  const { trees } = useTreeStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(SAMPLE_QUESTIONS);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // 認証リスナーはルートで一度だけ登録 (UIコンポーネントの開閉に左右されない)
    initAuth();
  }, []);

  // 当日のニュースから生成したサジェストに差し替える (失敗時は静的サンプルのまま)
  useEffect(() => {
    fetch("/api/suggestions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.suggestions) && d.suggestions.length > 0) {
          setSuggestions(d.suggestions);
        }
      })
      .catch(() => {});
  }, []);

  const treeList = useMemo(
    () => Object.values(trees).sort((a, b) => b.updatedAt - a.updatedAt),
    [trees]
  );
  const tree = selectedTreeId ? trees[selectedTreeId] ?? null : null;
  const selectedNode = tree && selectedNodeId ? tree.nodes[selectedNodeId] ?? null : null;

  // ゲストお試し枠: 未ログインは合計ノード数で制限し、超えたらログイン誘導
  const auth = useAuthInfo();
  const totalNodes = useMemo(
    () => Object.values(trees).reduce((acc, t) => acc + Object.keys(t.nodes).length, 0),
    [trees]
  );
  const [guestBlocked, setGuestBlocked] = useState(false);
  const guardGuestLimit = (): boolean => {
    if (!isSupabaseConfigured()) return true; // 認証基盤なし (ローカル開発) は制限しない
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
      {/* ゲストお試し枠の上限通知 */}
      {guestBlocked && auth.kind !== "signedIn" && (
        <div className="neu-raised fade-up fixed left-1/2 top-6 z-30 w-[min(30rem,85vw)] -translate-x-1/2 rounded-2xl px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[13px] leading-6 text-slate-600">
              お試し枠（{GUEST_NODE_LIMIT}ノード）を使い切りました。
              <br />
              <span className="font-semibold text-navy">ログイン（無料）</span>
              すると続きから掘れます。作った航跡はそのまま引き継がれます。
            </div>
            <button
              onClick={() => setGuestBlocked(false)}
              className="shrink-0 rounded px-1.5 text-slate-400 hover:text-slate-600"
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            ログインはサイドバー左下から（メールアドレスだけでOK）
          </div>
        </div>
      )}

      {/* 左サイドバー */}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        trees={treeList}
        selectedTreeId={selectedTreeId}
        onSelectTree={(id) => {
          setSelectedTreeId(id);
          setSelectedNodeId(trees[id]?.rootNodeId ?? null);
        }}
        onSelectNode={(treeId, nodeId) => {
          setSelectedTreeId(treeId);
          setSelectedNodeId(nodeId);
        }}
        onNewTree={() => {
          setSelectedTreeId(null);
          setSelectedNodeId(null);
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

      {/* 右ペイン: グラフ領域 (パネルはオーバーレイ、各UIはウィンドウ相対配置) */}
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
              {/* コマンドバー — ウィンドウ中央下に固定 (サイドバー/パネルの開閉で動かない) */}
              <div className="fixed bottom-5 left-1/2 z-20 w-[min(36rem,55vw)] -translate-x-1/2">
                <div className="neu-raised flex gap-2 rounded-2xl p-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) launch(question);
                    }}
                    placeholder="新しい問いを立てる…"
                    className="neu-inset min-w-0 flex-1 rounded-xl px-4 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none"
                  />
                  <button
                    onClick={() => launch(question)}
                    disabled={!question.trim()}
                    className="shrink-0 rounded-xl bg-navy px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                  >
                    測深
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* 空状態 — ウィンドウ中央に固定 */
            <div className="pointer-events-none fixed inset-0 flex flex-col items-center justify-center px-6">
              <div className="pointer-events-auto flex flex-col items-center">
              <div className="relative mb-8 flex h-28 w-28 items-center justify-center">
                <div className="sonar-ring absolute inset-0 rounded-full border-2 border-navy/30" />
                <div className="sonar-ring sonar-ring-2 absolute inset-0 rounded-full border-2 border-navy/20" />
                <div className="neu-raised flex h-16 w-16 items-center justify-center rounded-full">
                  <div className="h-3.5 w-3.5 rounded-full bg-navy" />
                </div>
              </div>
              <h1 className="fade-up mb-2 text-3xl font-bold tracking-wide text-slate-700">
                Sondeur
              </h1>
              <p className="fade-up mb-10 text-sm text-slate-500" style={{ animationDelay: "0.1s" }}>
                わからないことを、わかるまで測深する。
              </p>

              <div
                className="neu-raised fade-up flex w-full max-w-xl gap-2 rounded-2xl p-2"
                style={{ animationDelay: "0.2s" }}
              >
                <input
                  autoFocus
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) launch(question);
                  }}
                  placeholder="何がわからない？"
                  className="neu-inset min-w-0 flex-1 rounded-xl px-4 py-2.5 text-[15px] text-slate-700 placeholder-slate-400 outline-none"
                />
                <button
                  onClick={() => launch(question)}
                  disabled={!question.trim()}
                  className="shrink-0 rounded-xl bg-navy px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  測深
                </button>
              </div>

              <div
                className="fade-up mt-7 flex flex-wrap justify-center gap-3"
                style={{ animationDelay: "0.35s" }}
              >
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

              <p
                className="fade-up mt-12 max-w-md text-center text-xs leading-6 text-slate-400"
                style={{ animationDelay: "0.5s" }}
              >
                返ってきた説明の、わからない箇所を選択して
                <span className="mx-1 font-semibold" style={{ color: "#2f4a7c" }}>What</span>/
                <span className="mx-1 font-semibold" style={{ color: "#8e3a52" }}>Why</span>
                で掘り下げる。掘った航跡は木になって残ります。
              </p>
              </div>
            </div>
          )}
        </div>

        {/* リーディングパネル — 右端オーバーレイ、幅はウィンドウ相対 (30vw) */}
        <div
          className={`fixed inset-y-0 right-0 z-10 w-[clamp(300px,30vw,540px)] transform transition-transform duration-300 ${
            tree && selectedNode ? "translate-x-0" : "translate-x-full"
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
