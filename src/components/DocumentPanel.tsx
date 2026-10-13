"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getStorageOwner, getState, saveTrailDocument } from "@/lib/store";
import { DOCUMENT_MAX_CHARS, DOCUMENT_MAX_NODES, documentNodes, documentSourceKey } from "@/lib/trailDocument";
import { GUEST_NODE_LIMIT } from "@/lib/planLimits";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { Tree } from "@/lib/types";

// Render only text, headings and http(s) links. Generated HTML is never executed.
function DocumentText({ text }: { text: string }) {
  return text.split("\n").map((line, i) => {
    if (line.startsWith("# ")) return <h2 key={i} className="mb-5 mt-2 text-2xl font-semibold text-navy">{line.slice(2)}</h2>;
    if (line.startsWith("## ")) return <h3 key={i} className="mb-3 mt-7 text-lg font-semibold text-navy">{line.slice(3)}</h3>;
    if (!line.trim()) return <div key={i} className="h-3" />;
    return <p key={i} className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{line.split(/(https?:\/\/[^\s<>"\])]+)/g).map((part, j) =>
      /^https?:\/\//.test(part) ? <a key={j} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-navy underline">{part}</a> : part
    )}</p>;
  });
}

export default function DocumentPanel({ tree, onClose }: { tree: Tree; onClose: () => void }) {
  const { t, locale } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sourceKey, setSourceKey] = useState("");
  const nodes = useMemo(() => documentNodes(tree), [tree]);
  const document = tree.document;
  const streaming = Object.values(tree.nodes).some(n => n.status === "streaming");
  const tooLarge = nodes.length > DOCUMENT_MAX_NODES || nodes.reduce((s,n) => s+n.content.length+n.question.length, 0) > DOCUMENT_MAX_CHARS;
  useEffect(() => {
    trigger.current = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
    dialog.current?.showModal();
    return () => { controller.current?.abort(); trigger.current?.focus(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    documentSourceKey(nodes, locale).then(key => { if (!cancelled) setSourceKey(key); });
    return () => { cancelled = true; };
  }, [nodes, locale]);

  async function generate() {
    if (controller.current || streaming || !nodes.length || tooLarge) return;
    const owner = getStorageOwner();
    const used = Object.values(getState().trees).reduce((sum, tr) => sum + Object.keys(tr.nodes).length + (tr.documentGenerations ?? 0), 0);
    if (owner === "guest" && isSupabaseConfigured() && used >= GUEST_NODE_LIMIT) { setError("document.quota"); return; }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(""); setCopied(false);
    try {
      const key = await documentSourceKey(nodes, locale);
      const response = await fetch("/api/document", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, lang: locale }), signal: abort.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "document.failed");
      if (typeof result.markdown !== "string" || !result.markdown.trim()) throw new Error("document.failed");
      if (!abort.signal.aborted) saveTrailDocument(tree.id, { markdown: result.markdown, sourceKey: key, createdAt: Date.now(), locale }, owner);
    } catch (err) {
      if (!abort.signal.aborted) setError(err instanceof Error && /^document\.[a-zA-Z]+$/.test(err.message) ? err.message : "document.failed");
    } finally { controller.current = null; if (!abort.signal.aborted) setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(document!.markdown); setCopied(true); }
    catch { setError("document.copyFailed"); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([document!.markdown], { type: "text/markdown;charset=utf-8" }));
    const a = window.document.createElement("a"); a.href = url;
    a.download = `${tree.title.replace(/[^\p{L}\p{N}\s_-]/gu, "").slice(0, 60) || "sondeur"}.md`;
    a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="document-title"
    className="m-auto h-[90dvh] w-[min(800px,94vw)] rounded-2xl border border-slate-200 bg-background p-0 shadow-xl backdrop:bg-slate-900/30">
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h1 id="document-title" className="font-semibold text-navy">{t("document.title")}</h1>
        <button onClick={onClose} className="rounded-lg px-3 py-1 text-slate-600" aria-label={t("home.close")}>×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5" aria-busy={busy}>
        {document ? <>
          <p className="mb-3 text-xs text-slate-500">{t("document.saved")}</p>
          {sourceKey && document.sourceKey !== sourceKey && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("document.stale")}</p>}
          <DocumentText text={document.markdown} />
          <p className="mt-7 text-xs text-slate-500">{t("document.sourcesNote")}</p>
        </> : <p className="text-sm leading-7 text-slate-600">{t("document.intro")}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{t(error)}</p>}
        {busy && <p role="status" className="mt-4 text-sm text-navy">{t("document.generating")}</p>}
      </div>
      <div className="border-t border-slate-200 px-5 py-4">
        <p className="mb-3 text-xs text-slate-500">{t(streaming ? "document.busy" : tooLarge ? "document.tooLarge" : !nodes.length ? "document.empty" : "document.cost")}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={generate} disabled={busy || streaming || !nodes.length || tooLarge} className="rounded-xl bg-navy px-4 py-2 text-sm text-white disabled:opacity-40">{t(busy ? "document.generating" : document ? "document.regenerate" : "document.generate")}</button>
          {document && <>
            <button onClick={copy} className="neu-raised-sm rounded-xl px-4 py-2 text-sm text-navy">{t(copied ? "panel.copied" : "document.copy")}</button>
            <button onClick={download} className="neu-raised-sm rounded-xl px-4 py-2 text-sm text-navy">{t("document.download")}</button>
          </>}
        </div>
      </div>
    </div>
  </dialog>;
}
