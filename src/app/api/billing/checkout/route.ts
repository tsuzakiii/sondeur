import { getRequestUser } from "@/lib/supabase/server";
import { getServiceSupabase, getStripe, priceIdForPlan } from "@/lib/stripe";
import { checkoutIdempotencyKey } from "@/lib/idempotencyKey";
import { releaseCheckoutLock, tryAcquireCheckoutLock } from "@/lib/checkoutLock";
import {
  SessionAlreadyCompletedError,
  expireInFlightSessionIfDifferentPlan,
  recordInFlightSession,
} from "@/lib/inFlightSession";
import * as Sentry from "@sentry/nextjs";

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
    // branch-r1-F2/F4: in-flight cleanup を最初の 4xx guard より前に走らせる。
    // 途中で 409 return する path でも stale pointer が残らないため。
    const { data: initial, error: initialError } = await auth.supabase
      .from("profiles")
      .select("plan, stripe_customer_id, in_flight_checkout_session_id")
      .eq("id", auth.user.id)
      .single();
    if (initialError || !initial) {
      return Response.json({ error: "profile unavailable — try again shortly" }, { status: 503 });
    }

    const service = getServiceSupabase();
    if (service && initial.in_flight_checkout_session_id) {
      await expireInFlightSessionIfDifferentPlan(
        stripe,
        service,
        auth.user.id,
        initial.in_flight_checkout_session_id,
        price
      );
    }

    // 一次 guard (stale snapshot 判定は cleanup 後の fresh 再読で最終確認する)
    if (initial.plan && initial.plan !== "free") {
      return Response.json(
        { error: "already subscribed — use the billing portal to change plans" },
        { status: 409 }
      );
    }
    if (initial.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({
        customer: initial.stripe_customer_id,
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

    // branch-r1-F2: cleanup 中に webhook が profile を更新した可能性を再 read で吸収。
    // create の decision は fresh の値だけを使う。
    const { data: fresh, error: freshError } = await auth.supabase
      .from("profiles")
      .select("plan, stripe_customer_id")
      .eq("id", auth.user.id)
      .single();
    if (freshError || !fresh) {
      return Response.json({ error: "profile unavailable — try again shortly" }, { status: 503 });
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
    // branch-r1-F5: expire 自体の失敗も Sentry に送る (silently swallow しない)。
    if (service) {
      try {
        await recordInFlightSession(service, auth.user.id, session.id);
      } catch (recErr) {
        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch (expErr) {
          Sentry.captureException(expErr);
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
