import { getRequestUser } from "@/lib/supabase/server";
import { getServiceSupabase, getStripe, priceIdForPlan } from "@/lib/stripe";
import { checkoutIdempotencyKey } from "@/lib/idempotencyKey";
import { releaseCheckoutLock, tryAcquireCheckoutLock } from "@/lib/checkoutLock";
import {
  SessionAlreadyCompletedError,
  expireInFlightSessionIfDifferentPlan,
  recordInFlightSession,
} from "@/lib/inFlightSession";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) return Response.json({ error: "billing not configured" }, { status: 503 });

  const auth = await getRequestUser();
  if (!auth) return Response.json({ error: "login required" }, { status: 401 });

  let body: { plan?: string };
  try {
    body = (await request.json()) as { plan?: string };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.plan !== "standard" && body.plan !== "pro") {
    return Response.json({ error: "invalid plan" }, { status: 400 });
  }
  const price = priceIdForPlan(body.plan);
  if (!price) return Response.json({ error: "price not configured" }, { status: 503 });

  // Layer 1 (#15 Component 1): per-user lock。認証直後、他の DB/Stripe call の前。
  // "unavailable" は SUPABASE_SECRET_KEY 未設定 = production は release_check で必須化済み
  // なので dev 環境のみ発生。fail-CLOSED で 503 を返す。
  // null = race loser (60s TTL 内に他 request が lock 保持中)。409 で retry を促す。
  const acquired = await tryAcquireCheckoutLock(auth.user.id);
  if (acquired === "unavailable") {
    return Response.json({ error: "billing not configured" }, { status: 503 });
  }
  if (acquired === null) {
    return Response.json(
      { error: "checkout in progress — please wait a moment and retry" },
      { status: 409 }
    );
  }
  const lockToken = acquired;

  try {
    // 初回 guard: 既存 profile 読み込み。二重課金ガードの前提。
    const { data: profile, error: profileError } = await auth.supabase
      .from("profiles")
      .select("plan, stripe_customer_id")
      .eq("id", auth.user.id)
      .single();
    if (profileError || !profile) {
      return Response.json({ error: "profile unavailable — try again shortly" }, { status: 503 });
    }
    if (profile.plan && profile.plan !== "free") {
      return Response.json(
        { error: "already subscribed — use the billing portal to change plans" },
        { status: 409 }
      );
    }
    if (profile.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "all",
        limit: 10,
      });
      const live = subs.data.some((s) =>
        ["active", "trialing", "past_due", "unpaid", "paused"].includes(s.status)
      );
      if (live) {
        return Response.json(
          { error: "already subscribed — use the billing portal to change plans" },
          { status: 409 }
        );
      }
    }

    // Layer 2 (M2 / #5 PR #16): create の直前で profile を再読して guard を再評価する。
    const { data: fresh, error: freshError } = await auth.supabase
      .from("profiles")
      .select("plan, stripe_customer_id, in_flight_checkout_session_id")
      .eq("id", auth.user.id)
      .single();
    if (freshError || !fresh) {
      return Response.json({ error: "profile unavailable — try again shortly" }, { status: 503 });
    }

    // #15 Component 3: 既存 in-flight Session がある場合、cross-plan なら expire する
    // (先に走らせて invariant を全 exit path でも保つ)。既に complete していれば 409。
    const service = getServiceSupabase();
    if (service && fresh.in_flight_checkout_session_id) {
      await expireInFlightSessionIfDifferentPlan(
        stripe,
        service,
        auth.user.id,
        fresh.in_flight_checkout_session_id,
        price
      );
    }

    if (fresh.plan && fresh.plan !== "free") {
      return Response.json(
        { error: "already subscribed — use the billing portal to change plans" },
        { status: 409 }
      );
    }
    if (fresh.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({
        customer: fresh.stripe_customer_id,
        status: "all",
        limit: 10,
      });
      const live = subs.data.some((s) =>
        ["active", "trialing", "past_due", "unpaid", "paused"].includes(s.status)
      );
      if (live) {
        return Response.json(
          { error: "already subscribed — use the billing portal to change plans" },
          { status: 409 }
        );
      }
    }

    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const origin = configuredOrigin && configuredOrigin.length > 0
      ? configuredOrigin.replace(/\/$/, "")
      : new URL(request.url).origin;
    const hasStripe = !!fresh.stripe_customer_id;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: auth.user.id,
        ...(hasStripe
          ? { customer: fresh.stripe_customer_id as string }
          : { customer_email: auth.user.email ?? undefined }),
        subscription_data: { metadata: { user_id: auth.user.id } },
        success_url: `${origin}/?billing=success`,
        cancel_url: `${origin}/?billing=cancel`,
      },
      { idempotencyKey: checkoutIdempotencyKey(auth.user.id, body.plan, price, hasStripe) }
    );

    // #15 Component 3 / impl-r7-F6: create 成功と record の間の atomicity gap を塞ぐ。
    // record が失敗すると invariant (DB pointer が Session を追跡している) が壊れるので、
    // ここでは Session を即 expire して 500 を返す。ユーザーは retry でき、開いたままの
    // 未追跡 Session は残らない。
    if (service) {
      try {
        await recordInFlightSession(service, auth.user.id, session.id);
      } catch (recErr) {
        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch {
          // best effort — Sentry には recErr が上に伝わる
        }
        throw recErr;
      }
    }

    return Response.json({ url: session.url });
  } catch (e) {
    if (e instanceof SessionAlreadyCompletedError) {
      return Response.json({ error: "checkout already completed" }, { status: 409 });
    }
    throw e;
  } finally {
    await releaseCheckoutLock(auth.user.id, lockToken);
  }
}
