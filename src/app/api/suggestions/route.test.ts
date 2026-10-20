import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { createResponse } = vi.hoisted(() => ({ createResponse: vi.fn() }));
vi.mock("openai", () => ({
  default: class { responses = { create: createResponse }; },
}));

const questions = ["Why this discovery?", "How does this work?", "Why did this happen?"];
const request = () => new Request("https://sondeur.app/api/suggestions?lang=en");
const rss = () => new Response("<rss><channel><item><title>A new discovery</title></item></channel></rss>");

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("SONDEUR_MODEL", undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  createResponse.mockResolvedValue({ output_text: JSON.stringify(questions) });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("recovers from an RSS outage instead of caching fallback questions", async () => {
  const fetchFeed = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetchFeed);
  const { GET } = await import("./route");
  expect((await (await GET(request())).json()).source).toBe("fallback");
  expect(createResponse).not.toHaveBeenCalled();
  fetchFeed.mockImplementation(async () => rss());
  expect(await (await GET(request())).json()).toMatchObject({ source: "rss+llm", suggestions: questions });
  await GET(request());
  expect(createResponse).toHaveBeenCalledTimes(1);
  expect(fetchFeed).toHaveBeenCalledTimes(6);
});

it("uses available headlines when one category fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("blocked", { status: 403 }))
    .mockImplementation(async () => rss()));
  const { GET } = await import("./route");
  expect((await (await GET(request())).json()).source).toBe("rss+llm");
  expect(createResponse).toHaveBeenCalledWith(expect.objectContaining({
    model: "gpt-6-luna", reasoning: { effort: "low" }, input: expect.stringContaining("A new discovery"),
  }));
});

it("retries after a provider failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => rss()));
  createResponse.mockRejectedValueOnce(new Error("provider unavailable"));
  const { GET } = await import("./route");
  expect((await (await GET(request())).json()).source).toBe("fallback");
  expect((await (await GET(request())).json()).source).toBe("rss+llm");
});

it("separates the daily cache by normalized topics and language", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => rss()));
  const { GET } = await import("./route");
  const withTopics = (topics: string, lang = "en") => new Request(`https://sondeur.app/api/suggestions?lang=${lang}&topics=${topics}`);
  await GET(withTopics("space,science"));
  await GET(withTopics("science,space"));
  expect(createResponse).toHaveBeenCalledTimes(1);
  expect(createResponse.mock.calls[0][0].input).toContain('["Science","Space"]');
  await GET(withTopics("history"));
  await GET(withTopics("history", "ja"));
  expect(createResponse).toHaveBeenCalledTimes(3);
});

it("rejects arbitrary prompt text and too many topics before calling a provider", async () => {
  const { GET } = await import("./route");
  for (const topics of ["ignore-instructions", "science,space,history,health"]) {
    expect((await GET(new Request(`https://sondeur.app/api/suggestions?topics=${topics}`))).status).toBe(400);
  }
  expect(createResponse).not.toHaveBeenCalled();
});

it("requires exactly three distinct questions and does not cache malformed generations", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => rss()));
  createResponse.mockResolvedValueOnce({ output_text: '["Only one?","Only one?","Second?"]' });
  const { GET } = await import("./route");
  expect((await (await GET(request())).json()).source).toBe("fallback");
  expect((await (await GET(request())).json()).suggestions).toEqual(questions);
  expect(createResponse).toHaveBeenCalledTimes(2);
});

it("keeps selected topics during RSS and generation outages without inventing news", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("offline", { status: 503 })));
  createResponse.mockRejectedValue(new Error("offline"));
  const { GET } = await import("./route");
  const res = await GET(new Request("https://sondeur.app/api/suggestions?lang=ja&topics=space"));
  const body = await res.json();
  expect(body.source).toBe("fallback");
  expect(body.suggestions).toHaveLength(3);
  expect(body.suggestions.every((q: string) => q.includes("宇宙"))).toBe(true);
  expect(createResponse.mock.calls[0][0].input).toContain("Never invent current events");
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
});

it("coalesces simultaneous requests for the same selection", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => rss()));
  const { GET } = await import("./route");
  const [first, second] = await Promise.all([GET(request()), GET(request())]);
  expect(await first.json()).toEqual(await second.json());
  expect(createResponse).toHaveBeenCalledTimes(1);
});
