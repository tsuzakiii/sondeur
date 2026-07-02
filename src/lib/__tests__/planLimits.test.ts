import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { PLAN_NODE_LIMITS, consumeNodeQuota } from "@/lib/planLimits";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const user = { id: "u1" } as User;

/** from().select().eq().single() と rpc() だけを持つ SupabaseClient モック */
function mockSupabase(opts: {
  profile?: { plan: string } | null;
  profileError?: object | null;
  rpcAllowed?: boolean;
  rpcError?: object | null;
}): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: opts.profile ?? null, error: opts.profileError ?? null }),
        }),
      }),
    }),
    rpc: async () => ({ data: opts.rpcAllowed ?? true, error: opts.rpcError ?? null }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("consumeNodeQuota", () => {
  it("free プランで枠内なら ok", async () => {
    const res = await consumeNodeQuota(mockSupabase({ profile: { plan: "free" }, rpcAllowed: true }), user);
    expect(res.ok).toBe(true);
  });

  it("free プランで上限到達なら ok=false + reason 付き", async () => {
    const res = await consumeNodeQuota(mockSupabase({ profile: { plan: "free" }, rpcAllowed: false }), user);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain(String(PLAN_NODE_LIMITS.free));
  });

  it("pro プランは RPC を呼ばず無条件で ok", async () => {
    const rpc = vi.fn();
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { plan: "pro" }, error: null }) }) }),
      }),
      rpc,
    } as unknown as SupabaseClient;
    const res = await consumeNodeQuota(supabase, user);
    expect(res.ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("未知のプランは free の上限にフォールバック", async () => {
    const res = await consumeNodeQuota(mockSupabase({ profile: { plan: "enterprise" }, rpcAllowed: false }), user);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain(String(PLAN_NODE_LIMITS.free));
  });

  it("profile 読み取り失敗は fail-open (ok=true)", async () => {
    const res = await consumeNodeQuota(mockSupabase({ profileError: { message: "db down" } }), user);
    expect(res.ok).toBe(true);
  });

  it("RPC 失敗は fail-open (ok=true)", async () => {
    const res = await consumeNodeQuota(
      mockSupabase({ profile: { plan: "free" }, rpcError: { message: "rpc down" } }),
      user
    );
    expect(res.ok).toBe(true);
  });

  it("fail-open 時は Sentry に記録される", async () => {
    const Sentry = await import("@sentry/nextjs");
    vi.mocked(Sentry.captureException).mockClear();
    await consumeNodeQuota(mockSupabase({ profileError: { message: "db down" } }), user);
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });
});
