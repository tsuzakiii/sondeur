"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import AuthFooter from "./AuthFooter";
import { useAuthInfo } from "@/lib/authState";
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
  const panelId = useId();
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  function closeSidebar() {
    onToggle();
    requestAnimationFrame(() => openButton.current?.focus());
  }
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; active: boolean; time: string; nodeText: string } | null>(null);
  const [deleteRect, setDeleteRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [deleteExpanded, setDeleteExpanded] = useState(false);
  // 共有操作の結果フィードバック。ok=false は失敗の ✕ 表示 (無言失敗の禁止)
  const [shareToast, setShareToast] = useState<{ id: string; ok: boolean } | null>(null);
  const auth = useAuthInfo();
  // ゲストのツリーはサーバーに存在しないので共有は原理的に不可 → ボタン自体を出さない
  const canShare = auth.kind === "signedIn";
  // Sidebar は開閉中も mount したままなので、Date.now() を 1 分刻みで更新する。lint の
  // `Cannot call impure function during render` を避けつつ「N 分前 → M 分前」が経時で
  // 正しく進むようにする。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const hits = useMemo(
    () => (query.trim().length >= 2 ? searchTrees(trees, query.trim()) : null),
    [trees, query]
  );

  const relativeTime = (ts: number): string => {
    const diff = now - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return t("sidebar.justNow");
    if (min < 60) return t("sidebar.minutesAgo", { n: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t("sidebar.hoursAgo", { n: hr });
    const day = Math.floor(hr / 24);
    if (day < 30) return t("sidebar.daysAgo", { n: day });
    return new Date(ts).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  };

  return (
    <>
      <button
        ref={openButton}
        onClick={() => {
          onToggle();
          requestAnimationFrame(() => closeButton.current?.focus());
        }}
        className="sidebar-open-button neu-raised-sm absolute left-3 top-3 z-20 rounded-xl px-2.5 py-1.5 text-slate-500 hover:text-navy"
        data-visible={!open}
        tabIndex={open ? -1 : 0}
        aria-hidden={open}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("sidebar.open")}
        title={t("sidebar.open")}
      >
        ≡
      </button>
      {/* Keep the drawer mounted so closing can animate; inert removes hidden controls. */}
      <div
        className="sidebar-backdrop fixed inset-0 z-40 bg-slate-900/15 backdrop-blur-[2px] md:hidden"
        data-open={open}
        onClick={closeSidebar}
        aria-hidden="true"
      />
      <div className="sidebar-frame" data-open={open} inert={!open} aria-hidden={!open} id={panelId}>
      <div className="sidebar-panel navigation-surface flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          ref={closeButton}
          onClick={closeSidebar}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t("sidebar.close")}
          className="rounded px-1.5 py-0.5 text-rail-muted transition-colors hover:text-rail-text"
          title={t("sidebar.close")}
        >
          ≡
        </button>
        <button
          onClick={onNewTree}
          className="flex items-center gap-1.5 rounded px-1 transition-opacity hover:opacity-70"
          title={t("sidebar.home")}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-rail-text" />
          <span className="text-[clamp(14px,1vw,18px)] font-bold tracking-wider text-rail-text">Sondeur</span>
        </button>
        <button
          onClick={onNewNote}
          className="rounded px-1.5 py-0.5 text-lg leading-none text-rail-muted transition-colors hover:text-rail-text"
          title={t("sidebar.new")}
        >
          ＋
        </button>
      </div>

      <div className="mx-4 mb-1 border-b border-rail-line" />

      <div className="px-3 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder={t("sidebar.search")}
          className="rail-search w-full rounded-lg px-3 py-1.5 text-[12px] text-rail-text placeholder-rail-muted outline-none"
        />
      </div>

      {hits !== null ? (
        <div className="flex-1 overflow-y-auto px-2 py-1.5">
          {hits.length === 0 && (
            <div className="px-3 py-6 text-xs text-rail-muted">{t("sidebar.noResults", { query })}</div>
          )}
          {hits.map((h) => (
            <div
              key={`${h.treeId}:${h.nodeId}`}
              onClick={() => {
                onSelectNode(h.treeId, h.nodeId);
              }}
              className="mb-1.5 cursor-pointer rounded-xl px-3 py-2 transition-colors hover:bg-rail-hover"
            >
              <div className="truncate text-[12px] font-medium text-rail-text">{h.label}</div>
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-rail-muted">{h.snippet}</div>
              <div className="mt-0.5 truncate text-[10px] text-rail-muted">{h.treeTitle}</div>
            </div>
          ))}
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {trees.length === 0 && (
          <div className="px-3 py-8 text-xs leading-6 text-rail-muted">
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
              data-active={active}
              onClick={() => onSelectTree(tr.id)}
              className="navigation-item group mb-1.5 cursor-pointer rounded-lg px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`truncate text-[clamp(13px,0.95vw,17px)] ${active ? "font-medium text-rail-text" : "text-rail-muted group-hover:text-rail-text"}`}
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
                  className="invisible flex h-5 w-5 shrink-0 items-center justify-center rounded text-rail-muted hover:text-rail-danger group-hover:visible"
                  title={t("sidebar.delete")}
                >
                  <span className="text-sm leading-none">✕</span>
                </button>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[clamp(11px,0.75vw,13px)] text-rail-muted">
                <span>{relativeTime(tr.updatedAt)}</span>
                <span>·</span>
                <span>{t(nodeCount === 1 ? "sidebar.node" : "sidebar.nodes", { count: nodeCount })}</span>
                {canShare && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const flash = (ok: boolean) => {
                      setShareToast({ id: tr.id, ok });
                      setTimeout(() => setShareToast((v) => (v?.id === tr.id ? null : v)), 1500);
                    };
                    const next = !tr.shared;
                    if (next) {
                      // クリックジェスチャ内で先にコピーする。fetch 完了後の writeText は
                      // Safari 系でジェスチャ扱いされずブロックされる
                      try {
                        void navigator.clipboard.writeText(`${window.location.origin}/s/${tr.id}`).catch(() => {});
                      } catch {}
                    }
                    void fetch("/api/share", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ treeId: tr.id, shared: next }),
                    })
                      .then((res) => {
                        if (res.ok) {
                          setShared(tr.id, next);
                          flash(true);
                        } else {
                          flash(false); // 401/404/500 — 無言にしない
                        }
                      })
                      .catch(() => flash(false));
                  }}
                  className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                    tr.shared
                      ? "text-rail-text hover:text-rail-danger"
                      : "invisible text-rail-muted hover:text-rail-text group-hover:visible"
                  }`}
                  title={tr.shared ? t("sidebar.unshare") : t("sidebar.share")}
                >
                  {shareToast?.id === tr.id ? (
                    shareToast.ok ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <span className="text-sm leading-none text-rail-danger">✕</span>
                    )
                  ) : tr.shared ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                  )}
                </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      <div className="mx-4 mb-1 border-b border-rail-line" />
      <AuthFooter />
      </div>
      </div>

      {/* Delete confirmation — card extends right */}
      {open && deleteTarget && deleteRect && (
        <>
          <div
            className="fixed inset-0 z-60"
            onClick={() => {
              setDeleteExpanded(false);
              setTimeout(() => { setDeleteTarget(null); setDeleteRect(null); }, 180);
            }}
          />
          <div
            className="rail-confirm fixed z-70 overflow-hidden rounded-lg px-3 py-2"
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
                deleteTarget.active ? "font-medium text-rail-text" : "text-rail-muted"
              }`}
              style={{ width: deleteRect.width - 24 }}
            >
              {deleteTarget.title}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[clamp(11px,0.75vw,13px)] text-rail-muted">
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
    </>
  );
}
