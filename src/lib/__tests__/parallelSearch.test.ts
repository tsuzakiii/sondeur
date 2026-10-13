import { afterEach, expect, it, vi } from "vitest";
import { searchParallel } from "../parallelSearch";
const request = { operation: "why" as const, lang: "ja", selectedSpan: "エキスパンダーブリード", parentContent: "H3ロケットのLE-9エンジン", grandparentContent: null, pathSummaries: ["H3"] };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("sends one bounded GA Fast request with context and keeps only usable sources", async () => {
  vi.stubEnv("PARALLEL_API_KEY", "test-only");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ results: [
    { url: "javascript:alert(1)", excerpts: ["bad"] },
    { title: "JAXA", url: "https://www.jaxa.jp/", excerpts: ["engine details"] },
  ] }));
  vi.stubGlobal("fetch", fetcher);
  expect(await searchParallel(request)).toEqual([{ title: "JAXA", url: "https://www.jaxa.jp/", excerpts: ["engine details"] }]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("https://api.parallel.ai/v1/search");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ mode: "fast", max_chars_total: 8000, objective: expect.stringContaining("LE-9") });
});
it("fails explicitly on provider failure without exposing response body or retrying", async () => {
  vi.stubEnv("PARALLEL_API_KEY", "test-only");
  const fetcher = vi.fn().mockResolvedValue(new Response("secret provider detail", { status: 429 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(searchParallel(request)).rejects.toThrow("Parallel search failed (429)");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not make an anonymous request when the key is absent", async () => {
  vi.stubEnv("PARALLEL_API_KEY", undefined);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(searchParallel(request)).rejects.toThrow("not configured");
  expect(fetcher).not.toHaveBeenCalled();
});
