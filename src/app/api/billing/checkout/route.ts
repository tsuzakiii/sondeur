import { getRequestUser } from "@/lib/supabase/server";
import { getStripe, priceIdForPlan } from "@/lib/stripe";

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

  // 既存のStripe顧客がいれば再利用 (二重顧客を作らない)
  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("plan, stripe_customer_id")
    .eq("id", auth.user.id)
    .single();

  // 二重課金ガードの前提となる読み取りに失敗したら fail-closed (素通りするとガードが無効化される)
  if (profileError || !profile) {
    return Response.json({ error: "profile unavailable — try again shortly" }, { status: 503 });
  }

  // plan ガード: free 以外は billing portal でのプラン変更に誘導する (checkout での二重課金を防ぐ)
  if (profile.plan && profile.plan !== "free") {
    return Response.json(
      { error: "already subscribed — use the billing portal to change plans" },
      { status: 409 }
    );
  }

  // Stripe 側ガード (ベルト&サスペンダー): webhook 遅延等で plan カラムが free のままでも
  // Stripe 側に生きた subscription が実在すれば防ぐ。canceled / incomplete_expired は終了済み、
  // incomplete は checkout 未完了の一時状態 (23時間で自動失効) なので対象外
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

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: auth.user.id,
    ...(profile?.stripe_customer_id
      ? { customer: profile.stripe_customer_id }
      : { customer_email: auth.user.email ?? undefined }),
    subscription_data: { metadata: { user_id: auth.user.id } },
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancel`,
  });

  return Response.json({ url: session.url });
}
