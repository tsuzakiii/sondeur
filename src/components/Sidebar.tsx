"use client";

import { useEffect, useMemo, useState } from "react";
import AuthFooter from "./AuthFooter";
import { useI18n } from "@/lib/i18n";
import { setShared } from "@/lib/store";
import type { SondeurNode, Tree } from "@/lib/types";

interface SearchHit {
  treeId: string;
  treeTitle: string;
  nodeId: string;
  label: string;
  snippet: string;
}

function nodeLabel(n: SondeurNode): string {
  return n.edgeType === "ask" ? n.question ?? n.selectedSpan : n.selectedSpan;
}

function searchTrees(trees: Tree[], query: string, limit = 20): SearchHit[] {
  const q = query.toLowerCase();
  const hits: SearchHit[] = [];
  for (const tree of trees) {
    for (const node of Object.values(tree.nodes)) {
      const label = nodeLabel(node);
      const content = node.content;
      const labelIdx = label.toLowerCase().indexOf(q);
      const contentIdx = content.toLowerCase().indexOf(q);
      if (labelIdx < 0 && contentIdx < 0) continue;
      const snippet =
        contentIdx >= 0
          ? (contentIdx > 20 ? "…" : "") +
            content.slice(Math.max(0, contentIdx - 20), contentIdx + 40).replace(/\s+/g, " ") +
            "…"
          : content.slice(0, 50).replace(/\s+/g, " ") + (content.length > 50 ? "…" : "");
      hits.push({ treeId: tree.id, treeTitle: tree.title, nodeId: node.id, label, snippet });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

export default function Sidebar({
  open,
  onToggle,
  trees,
  selectedTreeId,
  onSelectTree,
  onSelectNode,
  onNewTree,
  onNewNote,
  onDeleteTree,
}: {
  open: boolean;
  onToggle: () => void;
  trees: Tree[];
  selectedTreeId: string | null;
  onSelectTree: (id: string) => void;
  onSelectNode: (treeId: string, nodeId: string) => void;
  onNewTree: () => void;
  onNewNote: () => void;
  onDeleteTree: (id: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; active: boolean; time: string; nodeText: string } | null>(null);
  const [deleteRect, setDeleteRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [deleteExpanded, setDeleteExpanded] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const hits = useMemo(
    () => (query.trim().length >= 2 ? searchTrees(trees, query.trim()) : null),
    [trees, query]
  );

  const relativeTime = (ts: number): string => {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return t("sidebar.justNow");
    if (min < 60) return t("sidebar.minutesAgo", { n: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t("sidebar.hoursAgo", { n: hr });
    const day = Math.floor(hr / 24);
    if (day < 30) return t("sidebar.daysAgo", { n: day });
    return new Date(ts).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  };

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="neu-raised-sm absolute left-3 top-3 z-20 rounded-xl px-2.5 py-1.5 text-slate-500 transition-colors hover:text-navy"
        title={t("sidebar.open")}
      >
        ≡
      </button>
    );
  }

  return (
    <>
      {/* モバイル: ドロワーの背面タップで閉じる */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/15 backdrop-blur-[2px] md:hidden"
        onClick={onToggle}
      />
      <div className="flex h-full w-[clamp(200px,15vw,340px)] shrink-0 flex-col border-r border-[#d8dde8] max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[min(85vw,320px)] max-md:bg-background max-md:shadow-[8px_0_24px_rgba(150,160,180,0.3)]">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onToggle}
          className="rounded px-1.5 py-0.5 text-slate-400 transition-colors hover:text-navy"
          title={t("sidebar.close")}
        >
          ≡
        </button>
        <button
          onClick={onNewTree}
          className="flex items-center gap-1.5 rounded px-1 transition-opacity hover:opacity-70"
          title={t("sidebar.home")}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-navy" />
          <span className="text-[clamp(14px,1vw,18px)] font-bold tracking-wider text-slate-600">Sondeur</span>
        </button>
        <button
          onClick={onNewNote}
          className="rounded px-1.5 py-0.5 text-lg leading-none text-slate-400 transition-colors hover:text-navy"
          title={t("sidebar.new")}
        >
          ＋
        </button>
      </div>

      <div className="mx-4 mb-1 border-b border-[#d8dde8]" />

      <div className="px-3 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder={t("sidebar.search")}
          className="neu-inset w-full rounded-lg px-3 py-1.5 text-[12px] text-slate-700 placeholder-slate-400 outline-none"
        />
      </div>

      {hits !== null ? (
        <div className="flex-1 overflow-y-auto px-2 py-1.5">
          {hits.length === 0 && (
            <div className="px-3 py-6 text-xs text-slate-400">{t("sidebar.noResults", { query })}</div>
          )}
          {hits.map((h) => (
            <div
              key={`${h.treeId}:${h.nodeId}`}
              onClick={() => {
                onSelectNode(h.treeId, h.nodeId);
              }}
              className="mb-1.5 cursor-pointer rounded-xl px-3 py-2 transition-colors hover:bg-[#dde2ec]"
            >
              <div className="truncate text-[12px] font-medium text-slate-600">{h.label}</div>
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-400">{h.snippet}</div>
              <div className="mt-0.5 truncate text-[10px] text-slate-300">{h.treeTitle}</div>
            </div>
          ))}
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {trees.length === 0 && (
          <div className="px-3 py-8 text-xs leading-6 text-slate-400">
            {t("sidebar.empty")}
            <br />
            {t("sidebar.emptyHint")}
          </div>
        )}
        {trees.map((tr) => {
          const nodeCount = Object.keys(tr.nodes).length;
          const active = tr.id === selectedTreeId;
          return (
            <div
              key={tr.id}
              data-tree-item
              onClick={() => onSelectTree(tr.id)}
              className={`group mb-1.5 cursor-pointer rounded-xl px-3 py-2 ${
                active ? "neu-inset" : "hover:neu-flat"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`truncate text-[clamp(13px,0.95vw,17px)] ${active ? "font-medium text-navy" : "text-slate-500 group-hover:text-slate-700"}`}
                  title={tr.title}
                >
                  {tr.title}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const row = e.currentTarget.closest<HTMLElement>("[data-tree-item]");
                    if (row) {
                      const rect = row.getBoundingClientRect();
                      setDeleteRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
                      setDeleteTarget({
                        id: tr.id, title: tr.title, active,
                        time: relativeTime(tr.updatedAt),
                        nodeText: t(nodeCount === 1 ? "sidebar.node" : "sidebar.nodes", { count: nodeCount }),
                      });
                      setDeleteExpanded(false);
                      requestAnimationFrame(() => requestAnimationFrame(() => setDeleteExpanded(true)));
                    }
                  }}
                  className="invisible flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:text-wine group-hover:visible"
                  title={t("sidebar.delete")}
                >
                  <span className="text-sm leading-none">✕</span>
                </button>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[clamp(11px,0.75vw,13px)] text-slate-400">
                <span>{relativeTime(tr.updatedAt)}</span>
                <span>·</span>
                <span>{t(nodeCount === 1 ? "sidebar.node" : "sidebar.nodes", { count: nodeCount })}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tr.shared) {
                      void fetch("/api/share", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ treeId: tr.id, shared: false }),
                      }).then((res) => {
                        if (res.ok) {
                          setShared(tr.id, false);
                          setShareToast(tr.id);
                          setTimeout(() => setShareToast((v) => v === tr.id ? null : v), 1500);
                        }
                      });
                    } else {
                      const url = `${window.location.origin}/s/${tr.id}`;
                      void fetch("/api/share", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ treeId: tr.id, shared: true }),
                      }).then((res) => {
                        if (res.ok) {
                          setShared(tr.id, true);
                          void navigator.clipboard.writeText(url).then(() => {
                            setShareToast(tr.id);
                            setTimeout(() => setShareToast((v) => v === tr.id ? null : v), 1500);
                          });
                        }
                      });
                    }
                  }}
                  className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                    tr.shared
                      ? "text-navy hover:text-wine"
                      : "invisible text-slate-400 hover:text-navy group-hover:visible"
                  }`}
                  title={tr.shared ? t("sidebar.unshare") : t("sidebar.share")}
                >
                  {shareToast === tr.id ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : tr.shared ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      <div className="mx-4 mb-1 border-b border-[#d8dde8]" />
      <AuthFooter />

      {/* Delete confirmation — card extends right */}
      {deleteTarget && deleteRect && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setDeleteExpanded(false);
              setTimeout(() => { setDeleteTarget(null); setDeleteRect(null); }, 180);
            }}
          />
          <div
            className={`fixed z-50 overflow-hidden rounded-xl px-3 py-2 ${
              deleteTarget.active ? "neu-inset" : "neu-raised-sm"
            }`}
            style={{
              top: deleteRect.top,
              left: deleteRect.left,
              height: deleteRect.height,
              width: deleteExpanded ? deleteRect.width + 80 : deleteRect.width,
              transition: "width 0.2s ease-out",
            }}
          >
            <div
              className={`truncate text-[clamp(13px,0.95vw,17px)] ${
                deleteTarget.active ? "font-medium text-navy" : "text-slate-500"
              }`}
              style={{ width: deleteRect.width - 24 }}
            >
              {deleteTarget.title}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[clamp(11px,0.75vw,13px)] text-slate-400">
              <span>{deleteTarget.time}</span>
              <span>·</span>
              <span>{deleteTarget.nodeText}</span>
            </div>
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg bg-wine px-3 py-1 text-[11px] font-medium text-white hover:opacity-90"
              style={{
                opacity: deleteExpanded ? 1 : 0,
                transition: "opacity 0.15s ease-out 0.08s",
              }}
              onClick={() => {
                onDeleteTree(deleteTarget.id);
                setDeleteExpanded(false);
                setTimeout(() => { setDeleteTarget(null); setDeleteRect(null); }, 50);
              }}
            >
              {t("sidebar.delete")}
            </button>
          </div>
        </>
      )}
      </div>
    </>
  );
}
