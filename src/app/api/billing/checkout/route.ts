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
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", auth.user.id)
    .single();

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
