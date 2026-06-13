"use client";

import AuthFooter from "./AuthFooter";
import type { Tree } from "@/lib/types";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}日前`;
  return new Date(ts).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export default function Sidebar({
  open,
  onToggle,
  trees,
  selectedTreeId,
  onSelectTree,
  onNewTree,
  onDeleteTree,
}: {
  open: boolean;
  onToggle: () => void;
  trees: Tree[];
  selectedTreeId: string | null;
  onSelectTree: (id: string) => void;
  onNewTree: () => void;
  onDeleteTree: (id: string) => void;
}) {
  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="neu-raised-sm absolute left-3 top-3 z-20 rounded-xl px-2.5 py-1.5 text-slate-500 transition-colors hover:text-navy"
        title="サイドバーを開く"
      >
        ≡
      </button>
    );
  }

  return (
    <div className="flex h-full w-[clamp(200px,15vw,340px)] shrink-0 flex-col border-r border-[#d8dde8]">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onToggle}
          className="rounded px-1.5 py-0.5 text-slate-400 transition-colors hover:text-navy"
          title="サイドバーを閉じる"
        >
          ≡
        </button>
        <button
          onClick={onNewTree}
          className="flex items-center gap-1.5 rounded px-1 transition-opacity hover:opacity-70"
          title="ホームに戻る"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-navy" />
          <span className="text-[clamp(14px,1vw,18px)] font-bold tracking-wider text-slate-600">Sondeur</span>
        </button>
        <button
          onClick={onNewTree}
          className="rounded px-1.5 py-0.5 text-lg leading-none text-slate-400 transition-colors hover:text-navy"
          title="新しい問い"
        >
          ＋
        </button>
      </div>

      <div className="mx-4 mb-1 border-b border-[#d8dde8]" />

      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {trees.length === 0 && (
          <div className="px-3 py-8 text-xs leading-6 text-slate-400">
            まだ航跡がありません。
            <br />
            最初の問いを下ろしてみましょう。
          </div>
        )}
        {trees.map((t) => {
          const nodeCount = Object.keys(t.nodes).length;
          const active = t.id === selectedTreeId;
          return (
            <div
              key={t.id}
              onClick={() => onSelectTree(t.id)}
              className={`group mb-1.5 cursor-pointer rounded-xl px-3 py-2 ${
                active ? "neu-inset" : "hover:neu-flat"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`truncate text-[clamp(13px,0.95vw,17px)] ${active ? "font-medium text-navy" : "text-slate-500 group-hover:text-slate-700"}`}
                  title={t.title}
                >
                  {t.title}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`「${t.title}」を削除しますか？`)) onDeleteTree(t.id);
                  }}
                  className="invisible shrink-0 rounded px-1 text-slate-400 hover:text-wine group-hover:visible"
                  title="削除"
                >
                  ✕
                </button>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[clamp(11px,0.75vw,13px)] text-slate-400">
                <span>{relativeTime(t.updatedAt)}</span>
                <span>·</span>
                <span>{nodeCount} ノード</span>
              </div>
            </div>
          );
        })}
      </div>

      <AuthFooter />
    </div>
  );
}
