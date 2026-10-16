import { expect, it } from "vitest";
import { documentNodes, documentSourceKey, finalizeDocument } from "../trailDocument";
import type { Tree, SondeurNode } from "../types";
const node = (id: string, parentId: string | null, status: SondeurNode["status"] = "done") => ({ id, treeId: "t", parentId, selectedSpan: id, edgeType: parentId ? "what" : "root", content: "answer "+id, status, createdAt: 1 } as SondeurNode);
it("includes completed branches but not unfinished or disconnected explanations", () => {
  const tree = { rootNodeId: "a", nodes: { a: node("a", null), b: node("b", "a"), c: node("c", "a", "streaming"), d: node("d", "c"), e: node("e", "missing") } } as unknown as Tree;
  expect(documentNodes(tree).map(n => n.id)).toEqual(["a", "b"]);
  expect(documentNodes(tree)[0].question).toBe("a");
});
it("changes the source fingerprint when text or language changes", async () => {
  const n = [{ id: "a", parentId: null, question: "ice", content: "water" }];
  const a = await documentSourceKey(n, "en");
  expect(await documentSourceKey(n, "en")).toBe(a);
  expect(await documentSourceKey(n, "ja")).not.toBe(a);
  expect(await documentSourceKey([{ ...n[0], content: "other" }], "en")).not.toBe(a);
});
it("retains original sources and drops invented links and unknown node citations", () => {
  const n = [{ id: "a", parentId: null, question: "ice", content: "[source](https://iapws.org/faq)" }];
  const doc = finalizeDocument("# Title\nClaim [N1] [N99] https://invented.invalid/", n, "en");
  expect(doc).toContain("[1]"); expect(doc).toContain("https://iapws.org/faq");
  expect(doc).not.toContain("invented.invalid"); expect(doc).not.toContain("[N99]");
});
