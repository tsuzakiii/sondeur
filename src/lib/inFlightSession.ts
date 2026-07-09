// checkout Session の "in-flight" 追跡。#15 / docs/fix-checkout-atomic-lock.md 参照。

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stripe 側で expire 前に他 tab が該当 Session の pay を完了した状態。
// route はこれを catch して 409 "checkout already completed" を返す。
export class SessionAlreadyCompletedError extends Error {
  constructor() {
    super("prior in-flight checkout session already completed");
    this.name = "SessionAlreadyCompletedError";
  }
}

type ExpireOutcome = "cleared" | "kept-same-plan";

function priceIdFromSession(session: Stripe.Checkout.Session): string | null {
  // impl-r7-F3: null-guard chain。line_items が expand されていない / empty /
  // deleted price object の全パターンを吸収する。
  const items = session.line_items?.data;
  if (!items || items.length === 0) return null;
  const price = items[0]?.price;
  if (!price || typeof price === "string") return null;
  return price.id ?? null;
}

async function ignoreStripeExpectedError(
  fn: () => Promise<unknown>
): Promise<"ok" | "already_expired" | "already_completed" | "rethrow"> {
  try {
    await fn();
    return "ok";
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "session_already_expired") return "already_expired";
    if (err.code === "session_already_completed") return "already_completed";
    throw e;
  }
}

/**
 * 既存 in-flight Session (sessionId) を:
 * - 同一 price なら "kept-same-plan" (Stripe idempotency に任せる)
 *   ただし retrieved.status === "expired" | "complete" なら DB pointer を掃除して "cleared"
 * - 異 price なら expire → "cleared"
 * - すでに complete 済み → SessionAlreadyCompletedError を throw (route が 409 に map)
 * - line_items 情報が取れない (impl-r7-F3) → 保守的に expire (invariant safety)
 */
export async function expireInFlightSessionIfDifferentPlan(
  stripe: Stripe,
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  requestedPrice: string
): Promise<ExpireOutcome> {
  const retrieved = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });
  const status = retrieved.status;
  const sessionPrice = priceIdFromSession(retrieved);

  // impl-r7-F2: 同 plan でも Session が既に payable でなくなっているなら pointer clear
  if (status === "expired" || status === "complete") {
    await clearInFlightSession(supabase, userId, sessionId);
    return "cleared";
  }

  if (sessionPrice !== null && sessionPrice === requestedPrice) {
    // 同 plan で open → Stripe idempotency に任せる。pointer は保持する。
    return "kept-same-plan";
  }

  // sessionPrice が取れない場合も安全側 (expire) に倒す
  const outcome = await ignoreStripeExpectedError(() =>
    stripe.checkout.sessions.expire(sessionId)
  );
  if (outcome === "already_completed") {
    throw new SessionAlreadyCompletedError();
  }
  // "ok" or "already_expired" 両方とも payable でなくなった状態
  await clearInFlightSession(supabase, userId, sessionId);
  return "cleared";
}

// impl-r7-F4: Supabase error 時は throw する。silent resolve すると Session が DB
// に記録されないまま URL がユーザーに届き invariant を壊すため。
export async function recordInFlightSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ in_flight_checkout_session_id: sessionId })
    .eq("id", userId);
  if (error) throw error;
}

// webhook が使う。Session-ID 一致条件で clear するので、古い Session の webhook
// が新 pointer を消してしまう F4/F5 (r6) の race を塞ぐ。
export async function clearInFlightSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<void> {
  await supabase
    .from("profiles")
    .update({ in_flight_checkout_session_id: null })
    .eq("id", userId)
    .eq("in_flight_checkout_session_id", sessionId);
}
