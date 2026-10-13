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
