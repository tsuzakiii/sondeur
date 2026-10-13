import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getRequestUser } from "@/lib/supabase/server";
import { consumeNodeQuota } from "@/lib/planLimits";
const { createResponse } = vi.hoisted(() => ({ createResponse: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create: createResponse }; } }));
vi.mock("@/lib/supabase/server", () => ({ getRequestUser: vi.fn() }));
vi.mock("@/lib/planLimits", () => ({ consumeNodeQuota: vi.fn() }));
vi.mock("@/lib/guestRateLimit", () => ({ checkGuestRateLimit: vi.fn().mockResolvedValue(true), getClientIp: () => "ip" }));
const nodes = [{ id: "one", parentId: null, question: "Why ice?", content: "Ice is less dense. [IAPWS](https://iapws.org/faqs)" }];
const req = (body: unknown) => new Request("https://sondeur.app/api/document", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.mocked(getRequestUser).mockResolvedValue(null);
  createResponse.mockResolvedValue({ status: "completed", output_text: "# Ice\n\nLower density [N1]." });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("synthesizes without any search tools, retaining original sources and disabling caches", async () => {
  const result = await POST(req({ nodes, lang: "ja" }));
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect((await result.json()).markdown).toContain("https://iapws.org/faqs");
  expect(createResponse.mock.calls[0][0]).not.toHaveProperty("tools");
  expect(createResponse.mock.calls[0][0]).toMatchObject({ model: "gpt-6-luna", max_output_tokens: 6000, instructions: expect.stringContaining("Japanese") });
});
it("rejects malformed or oversized input before a paid call", async () => {
  expect((await POST(req(null))).status).toBe(400);
  expect((await POST(req({ nodes: [{ ...nodes[0], content: "x".repeat(160000) }] }))).status).toBe(413);
  expect(createResponse).not.toHaveBeenCalled();
});
it("enforces the signed-in quota before generation", async () => {
  vi.mocked(getRequestUser).mockResolvedValue({ user: { id: "user" }, supabase: {} } as Awaited<ReturnType<typeof getRequestUser>>);
  vi.mocked(consumeNodeQuota).mockResolvedValue({ ok: false });
  expect((await POST(req({ nodes }))).status).toBe(402);
  expect(createResponse).not.toHaveBeenCalled();
});
it("never saves a truncated provider response as a finished document", async () => {
  createResponse.mockResolvedValue({ status: "incomplete", output_text: "unfinished" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await POST(req({ nodes }))).status).toBe(502);
  log.mockRestore();
});
