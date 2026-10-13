import type { SondeurNode, Tree } from "./types";

export interface DocumentNode { id: string; parentId: string | null; question: string; content: string }
export interface TrailDocument { markdown: string; sourceKey: string; createdAt: number; locale: string }
export const DOCUMENT_MAX_CHARS = 120000;
export const DOCUMENT_MAX_NODES = 200;

/** Only complete nodes reachable from the root, preserving every explored branch. */
export function documentNodes(tree: Tree): DocumentNode[] {
  const result: DocumentNode[] = [];
  const seen = new Set<string>();
  const children = new Map<string, SondeurNode[]>();
  Object.values(tree.nodes).forEach(n => {
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  });
  function visit(n?: SondeurNode) {
    if (!n || seen.has(n.id)) return;
    seen.add(n.id);
    if (n.status !== "done" || !n.content.trim()) return;
    result.push({ id: n.id, parentId: n.parentId, question: n.edgeType === "root" ? n.selectedSpan : n.edgeType === "ask" ? n.question ?? n.selectedSpan : `${n.edgeType}: ${n.selectedSpan}`, content: n.content });
    (children.get(n.id) ?? []).sort((a,b) => a.createdAt-b.createdAt).forEach(visit);
  }
  visit(tree.nodes[tree.rootNodeId]);
  return result;
}

export async function documentSourceKey(nodes: DocumentNode[], locale: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ nodes, locale })));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
}

export function sourceUrls(content: string): string[] {
  return [...new Set(Array.from(content.matchAll(/https?:\/\/[^\s<>"\])]+/g), m => m[0]))];
}

/** The reference appendix is built from the original answers, never invented by the model. */
export function finalizeDocument(text: string, nodes: DocumentNode[], lang: string): string {
  const allowed = new Set(nodes.flatMap(n => sourceUrls(n.content)));
  const clean = text.replace(/https?:\/\/[^\s<>"\])]+/g, url => allowed.has(url) ? url : "")
    .replace(/\[N(\d+)\]/g, (_, n: string) => +n >= 1 && +n <= nodes.length ? `[${n}]` : "");
  const refs = nodes.map((n, i) => {
    const urls = sourceUrls(n.content);
    return `${i + 1}. ${n.question.replace(/\s+/g, " ")}\n${urls.length ? urls.map(u => `   - ${u}`).join("\n") : `   - ${lang === "ja" ? "元の説明に外部出典なし" : "No external source in the original explanation"}`}`;
  });
  return `${clean.trim()}\n\n## ${lang === "ja" ? "探索した問いと出典" : "Explored questions and sources"}\n\n${refs.join("\n\n")}\n`;
}
