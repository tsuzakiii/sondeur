import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SharedTreeView from "./SharedTreeView";
import type { Tree, SondeurNode } from "@/lib/types";

interface NodeRow {
  id: string;
  tree_id: string;
  parent_id: string | null;
  edge_type: "root" | "what" | "why" | "ask";
  selected_span: string;
  span_start: number;
  span_end: number;
  question: string | null;
  content: string;
  collapsed: boolean;
  created_at: string;
}

interface TreeRow {
  id: string;
  title: string;
  root_node_id: string | null;
  shared: boolean;
  created_at: string;
  updated_at: string;
}

async function fetchSharedTree(id: string): Promise<Tree | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  try {
    const treeRes = await fetch(
      `${url}/rest/v1/trees?id=eq.${encodeURIComponent(id)}&shared=eq.true&select=*`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (!treeRes.ok) return null;
    const treeRows = (await treeRes.json()) as TreeRow[];
    if (!Array.isArray(treeRows) || !treeRows.length) return null;
    const tr = treeRows[0];

    const nodeRes = await fetch(
      `${url}/rest/v1/nodes?tree_id=eq.${encodeURIComponent(id)}&select=*`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (!nodeRes.ok) return null;
    const nodeRows = (await nodeRes.json()) as NodeRow[];
    if (!Array.isArray(nodeRows)) return null;

    const nodes: Record<string, SondeurNode> = {};
    for (const r of nodeRows) {
      nodes[r.id] = {
        id: r.id,
        treeId: r.tree_id,
        parentId: r.parent_id,
        edgeType: r.edge_type,
        selectedSpan: r.selected_span,
        spanStart: r.span_start,
        spanEnd: r.span_end,
        ...(r.question ? { question: r.question } : {}),
        content: r.content,
        status: r.content ? "done" : "error",
        collapsed: r.collapsed,
        createdAt: Date.parse(r.created_at),
      };
    }

    return {
      id: tr.id,
      title: tr.title,
      rootNodeId: tr.root_node_id ?? "",
      nodes,
      createdAt: Date.parse(tr.created_at),
      updatedAt: Date.parse(tr.updated_at),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const tree = await fetchSharedTree(id);
  if (!tree) {
    return { title: { absolute: "Sondeur" }, description: "This tree is not available." };
  }
  const description = `Explore "${tree.title}" — shared from Sondeur`;
  return {
    // layout の title.template が「— Sondeur」を付ける
    title: tree.title,
    description,
    openGraph: { title: `${tree.title} — Sondeur`, description },
    twitter: { title: `${tree.title} — Sondeur`, description },
  };
}

export default async function SharedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = await fetchSharedTree(id);

  if (!tree) notFound();

  return <SharedTreeView tree={tree} />;
}
