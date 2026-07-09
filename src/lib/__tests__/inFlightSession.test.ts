import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SessionAlreadyCompletedError,
  clearInFlightSession,
  expireInFlightSessionIfDifferentPlan,
  recordInFlightSession,
} from "@/lib/inFlightSession";

type RetrieveResult = {
  status?: "open" | "expired" | "complete";
  line_items?: { data: Array<{ price?: { id: string } | string | null }> };
};

function asStripeSession(r: RetrieveResult): Stripe.Checkout.Session {
  return r as unknown as Stripe.Checkout.Session;
}

function stripeMock(opts: {
  retrieveResult: RetrieveResult;
  expireImpl?: () => Promise<unknown>;
}): Stripe {
  const retrieve = vi.fn(async () => asStripeSession(opts.retrieveResult));
  const expire = vi.fn(async () => (opts.expireImpl ? opts.expireImpl() : {}));
  return {
    checkout: { sessions: { retrieve, expire } },
  } as unknown as Stripe;
}

function supabaseCapturingUpdate() {
  const update = vi.fn(function (this: unknown) { return chain; });
  const eq = vi.fn(function (this: unknown) { return chain; });
  const chain: Record<string, unknown> = {
    update,
    eq,
    then: (fn: (v: { error: null }) => void) => Promise.resolve({ error: null }).then(fn),
  };
  const from = vi.fn(() => chain);
  return { supabase: { from } as unknown as SupabaseClient, from, update, eq };
}

describe("expireInFlightSessionIfDifferentPlan (AC-#15-3)", () => {
  it("(a) different plan → expire is called, returns 'cleared'", async () => {
    const stripe = stripeMock({
      retrieveResult: {
        status: "open",
        line_items: { data: [{ price: { id: "price_standard" } }] },
      },
    });
    const { supabase } = supabaseCapturingUpdate();
    const outcome = await expireInFlightSessionIfDifferentPlan(
      stripe,
      supabase,
      "uid",
      "cs_prev",
      "price_pro"
    );
    expect(outcome).toBe("cleared");
    expect((stripe.checkout.sessions.expire as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("cs_prev");
  });

  it("(b) same plan and open → expire NOT called, returns 'kept-same-plan'", async () => {
    const stripe = stripeMock({
      retrieveResult: {
        status: "open",
        line_items: { data: [{ price: { id: "price_standard" } }] },
      },
    });
    const { supabase } = supabaseCapturingUpdate();
    const outcome = await expireInFlightSessionIfDifferentPlan(
      stripe,
      supabase,
      "uid",
      "cs_prev",
      "price_standard"
    );
    expect(outcome).toBe("kept-same-plan");
    expect((stripe.checkout.sessions.expire as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("branch-r1-F1: same plan but Session status complete → throws SessionAlreadyCompletedError (not 'cleared')", async () => {
    const stripe = stripeMock({
      retrieveResult: {
        status: "complete",
        line_items: { data: [{ price: { id: "price_standard" } }] },
      },
    });
    const { supabase } = supabaseCapturingUpdate();
    await expect(
      expireInFlightSessionIfDifferentPlan(stripe, supabase, "uid", "cs_prev", "price_standard")
    ).rejects.toBeInstanceOf(SessionAlreadyCompletedError);
  });

  it("retrieve is called with expand: ['line_items']", async () => {
    const stripe = stripeMock({
      retrieveResult: {
        status: "open",
        line_items: { data: [{ price: { id: "price_standard" } }] },
      },
    });
    const { supabase } = supabaseCapturingUpdate();
    await expireInFlightSessionIfDifferentPlan(stripe, supabase, "uid", "cs_prev", "price_standard");
    const retrieveMock = stripe.checkout.sessions.retrieve as ReturnType<typeof vi.fn>;
    expect(retrieveMock).toHaveBeenCalledWith("cs_prev", { expand: ["line_items"] });
  });

  it("impl-r7-F2: same plan but Session status expired → returns 'cleared' and no expire call", async () => {
    const stripe = stripeMock({
      retrieveResult: {
        status: "expired",
        line_items: { data: [{ price: { id: "price_standard" } }] },
      },
    });
    const { supabase } = supabaseCapturingUpdate();
    const outcome = await expireInFlightSessionIfDifferentPlan(
      stripe,
      supabase,
      "uid",
      "cs_prev",
      "price_standard"
    );
    expect(outcome).toBe("cleared");
    expect((stripe.checkout.sessions.expire as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("(c) expire throws session_already_expired → returns 'cleared'", async () => {
    const stripe = stripeMock({
      retrieveResult: {
        status: "open",
        line_items: { data: [{ price: { id: "price_pro" } }] },
      },
      expireImpl: async () => {
        const e: { code: string } = { code: "session_already_expired" };
        throw e;
      },
    });
    const { supabase } = supabaseCapturingUpdate();
    const outcome = await expireInFlightSessionIfDifferentPlan(
      stripe,
      supabase,
      "uid",
      "cs_prev",
      "price_standard"
    );
    expect(outcome).toBe("cleared");
  });

  it("(d) expire throws session_already_completed → throws SessionAlreadyCompletedError", async () => {
    const stripe = stripeMock({
      retrieveResult: {
        status: "open",
        line_items: { data: [{ price: { id: "price_pro" } }] },
      },
      expireImpl: async () => {
        const e: { code: string } = { code: "session_already_completed" };
        throw e;
      },
    });
    const { supabase } = supabaseCapturingUpdate();
    await expect(
      expireInFlightSessionIfDifferentPlan(stripe, supabase, "uid", "cs_prev", "price_standard")
    ).rejects.toBeInstanceOf(SessionAlreadyCompletedError);
  });

  it("(e) expire throws anything else → helper rethrows original", async () => {
    const stripe = stripeMock({
      retrieveResult: {
        status: "open",
        line_items: { data: [{ price: { id: "price_pro" } }] },
      },
      expireImpl: async () => {
        throw new Error("rate limit");
      },
    });
    const { supabase } = supabaseCapturingUpdate();
    await expect(
      expireInFlightSessionIfDifferentPlan(stripe, supabase, "uid", "cs_prev", "price_standard")
    ).rejects.toThrow("rate limit");
  });

  it("review-r1 B1 asymmetry: Supabase clear error during status='expired' path is swallowed (safeClearInFlightSession), returns 'cleared'", async () => {
    // Verify the route-side asymmetry: when Stripe expire has already succeeded
    // (or the Session is already expired), a transient DB blip should NOT surface
    // as a route 500. If a future edit reverts `safeClearInFlightSession` → throwing
    // `clearInFlightSession` at inFlightSession.ts:65 (or removes the safe wrapper),
    // this test fails.
    const stripe = stripeMock({
      retrieveResult: {
        status: "expired",
        line_items: { data: [{ price: { id: "price_standard" } }] },
      },
    });
    // Custom Supabase mock: `.update().eq().eq()` resolves with an error
    const err = new Error("db down");
    const finalEq = vi.fn(() => Promise.resolve({ error: err }));
    const eq1 = vi.fn(() => ({ eq: finalEq }));
    const update = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ update }));
    const supabase = { from } as unknown as SupabaseClient;

    const outcome = await expireInFlightSessionIfDifferentPlan(
      stripe,
      supabase,
      "uid",
      "cs_prev",
      "price_standard"
    );
    // safeClearInFlightSession catches the error → returns "cleared" instead of throwing
    expect(outcome).toBe("cleared");
  });

  it("review-r1 B1 asymmetry: Supabase clear error during expire-succeeded path is also swallowed", async () => {
    // Second `safeClearInFlightSession` call site (inFlightSession.ts:87 after successful
    // Stripe expire). Same asymmetry: DB blip must not 500 the route when Stripe already
    // did its job.
    const stripe = stripeMock({
      retrieveResult: {
        status: "open",
        line_items: { data: [{ price: { id: "price_pro" } }] },
      },
    });
    const err = new Error("db down");
    const finalEq = vi.fn(() => Promise.resolve({ error: err }));
    const eq1 = vi.fn(() => ({ eq: finalEq }));
    const update = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ update }));
    const supabase = { from } as unknown as SupabaseClient;

    const outcome = await expireInFlightSessionIfDifferentPlan(
      stripe,
      supabase,
      "uid",
      "cs_prev",
      "price_standard"
    );
    expect(outcome).toBe("cleared");
    // Stripe expire was called (different-plan path)
    expect((stripe.checkout.sessions.expire as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("cs_prev");
  });

  it("impl-r7-F3: missing line_items → conservatively expires (safest for invariant)", async () => {
    const stripe = stripeMock({
      retrieveResult: { status: "open" }, // no line_items
    });
    const { supabase } = supabaseCapturingUpdate();
    const outcome = await expireInFlightSessionIfDifferentPlan(
      stripe,
      supabase,
      "uid",
      "cs_prev",
      "price_standard"
    );
    expect(outcome).toBe("cleared");
    expect((stripe.checkout.sessions.expire as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("cs_prev");
  });
});

describe("recordInFlightSession (AC-#15-3)", () => {
  it("(f) writes in_flight_checkout_session_id via update/eq chain", async () => {
    const { supabase, from, update, eq } = supabaseCapturingUpdate();
    await recordInFlightSession(supabase, "uid", "cs_new");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ in_flight_checkout_session_id: "cs_new" });
    expect(eq).toHaveBeenCalledWith("id", "uid");
  });

  it("impl-r7-F4: throws when Supabase returns error", async () => {
    const eq2 = vi.fn(() => Promise.resolve({ error: new Error("db down") }));
    const eq1 = vi.fn(() => ({ then: (fn: (v: unknown) => void) => Promise.resolve({ error: new Error("db down") }).then(fn) }));
    const update = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ update }));
    void eq2;
    const supabase = { from } as unknown as SupabaseClient;
    await expect(recordInFlightSession(supabase, "uid", "cs")).rejects.toThrow("db down");
  });
});

describe("clearInFlightSession (AC-#15-3)", () => {
  it("(g) update chain includes Session-ID condition in WHERE", async () => {
    const { supabase, from, update, eq } = supabaseCapturingUpdate();
    await clearInFlightSession(supabase, "uid", "cs_target");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ in_flight_checkout_session_id: null });
    // eq が id=uid と in_flight_checkout_session_id=cs_target の 2 回呼ばれる
    expect(eq).toHaveBeenCalledWith("id", "uid");
    expect(eq).toHaveBeenCalledWith("in_flight_checkout_session_id", "cs_target");
  });

  it("review-r1 B1: throws when Supabase returns error (no silent swallow)", async () => {
    const err = new Error("db down");
    const eq2 = vi.fn(() =>
      Promise.resolve({ error: err })
    );
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ update }));
    const supabase = { from } as unknown as SupabaseClient;
    await expect(clearInFlightSession(supabase, "uid", "cs_target")).rejects.toThrow("db down");
  });

  it("Session-ID mismatch semantics: WHERE clause carries both conditions so a stale webhook cannot clear a newer pointer", async () => {
    // Postgres 側の UPDATE...WHERE の runtime 保証を verify するのは integration test
    // の領分。ここでは chain の shape が「id AND in_flight_checkout_session_id」の両方を
    // eq で filter しているかだけを確認する (WHERE guard が実装で drop されたら fail)。
    const { supabase, eq } = supabaseCapturingUpdate();
    await clearInFlightSession(supabase, "uidA", "cs_stale");
    const calls = eq.mock.calls;
    // 順番と回数を明示的に確認
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["id", "uidA"]);
    expect(calls[1]).toEqual(["in_flight_checkout_session_id", "cs_stale"]);
  });
});
