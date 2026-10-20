import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchParallel } from "@/lib/parallelSearch";
import { POST } from "./route";
import { getRequestUser } from "@/lib/supabase/server";
import { checkGuestRateLimit } from "@/lib/guestRateLimit";

const { createResponse } = vi.hoisted(() => ({ createResponse: vi.fn() }));
vi.mock("@/lib/parallelSearch", () => ({ searchParallel: vi.fn() }));
vi.mock("openai", () => ({
  default: class { responses = { create: createResponse }; },
}));
vi.mock("@/lib/supabase/server", () => ({ getRequestUser: vi.fn() }));
vi.mock("@/lib/guestRateLimit", () => ({
  checkGuestRateLimit: vi.fn(), getClientIp: () => "test-ip",
}));
vi.mock("@/lib/planLimits", () => ({ consumeNodeQuota: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("SONDEUR_MODEL", undefined);
  vi.stubEnv("SONDEUR_SEARCH_PROVIDER", undefined);
  vi.mocked(getRequestUser).mockResolvedValue(null);
  vi.mocked(checkGuestRateLimit).mockResolvedValue(true);
  createResponse.mockImplementation(async function* () {
    yield { type: "response.created" };
    yield { type: "response.web_search_call.completed" };
    yield { type: "response.output_text.delta", delta: "理由は" };
    yield { type: "response.output_text.delta", delta: "これです。" };
    yield { type: "response.completed" };
  });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

const request = (operation = "root", lang = "ja") => new Request("https://sondeur.app/api/expand", {
  method: "POST",
  body: JSON.stringify({
    operation, lang, selectedSpan: "半導体", question: "なぜ必要？",
    parentContent: "半導体についての説明", grandparentContent: null, pathSummaries: [],
  }),
});

describe("Luna route integration", () => {
  it.each(["root", "what", "why", "ask"])("streams %s with search enabled and explicit effort", async (operation) => {
    const res = await POST(request(operation));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("理由はこれです。");
    expect(createResponse).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-6-luna", reasoning: { effort: "none" }, stream: true,
      tools: [{ type: "web_search" }], max_output_tokens: 4000,
      input: expect.stringContaining("日本語で答える"),
    }), { signal: expect.any(AbortSignal) });
  });

  it("preserves English prompts and the rollback model override", async () => {
    vi.stubEnv("SONDEUR_MODEL", "gpt-5.4-mini");
    const res = await POST(request("what", "en"));
    await res.text();
    expect(createResponse.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.4-mini", input: expect.stringContaining("Answer in English"),
    });
    expect(createResponse.mock.calls[0][0]).not.toHaveProperty("reasoning");
  });

  it("enforces quota before a billable model call", async () => {
    vi.mocked(checkGuestRateLimit).mockResolvedValue(false);
    const res = await POST(request());
    expect(res.status).toBe(402);
    expect(createResponse).not.toHaveBeenCalled();
  });

  it("does not turn a failed provider stream into a successful empty answer", async () => {
    createResponse.mockImplementation(async function* () {
      yield { type: "response.web_search_call.completed" };
      yield { type: "response.output_text.delta", delta: "partial" };
      throw new Error("provider failed");
    });
    const res = await POST(request());
    await expect(res.text()).rejects.toThrow("provider failed");
  });
});

it("uses Parallel sources without OpenAI search tools when selected", async () => {
  vi.stubEnv("SONDEUR_SEARCH_PROVIDER", "parallel");
  vi.mocked(searchParallel).mockResolvedValue([{ title: "source", url: "https://example.org", excerpts: ["verified fact"] }]);
  const response = await POST(request());
  await response.text();
  expect(searchParallel).toHaveBeenCalledTimes(1);
  expect(createResponse.mock.calls[0][0]).not.toHaveProperty("tools");
  expect(createResponse.mock.calls[0][0].input).toContain("verified fact");
});

it("requires OpenAI web search for roots, but leaves follow-up search optional", async () => {
  await (await POST(request("root"))).text();
  expect(createResponse.mock.calls[0][0].tool_choice).toBe("required");
  await (await POST(request("what"))).text();
  expect(createResponse.mock.calls[1][0]).not.toHaveProperty("tool_choice");
});

it("never generates an unsearched root after Parallel fails", async () => {
  vi.stubEnv("SONDEUR_SEARCH_PROVIDER", "parallel");
  vi.mocked(searchParallel).mockRejectedValue(new Error("search unavailable"));
  const response = await POST(request());
  await expect(response.text()).rejects.toThrow("search unavailable");
  expect(createResponse).not.toHaveBeenCalled();
});

it("rejects a root response if OpenAI does not complete its required search", async () => {
  createResponse.mockImplementation(async function* () {
    yield { type: "response.output_text.delta", delta: "Unsearched answer" };
  });
  const response = await POST(request());
  await expect(response.text()).rejects.toThrow("Root search did not complete");
});

it("does not serve unsearched mock answers when production is misconfigured", async () => {
  vi.stubEnv("OPENAI_API_KEY", undefined);
  vi.stubEnv("NODE_ENV", "production");
  expect((await POST(request())).status).toBe(503);
  expect(createResponse).not.toHaveBeenCalled();
});
