import { getRequestUser } from "@/lib/supabase/server";
import { getStripe, priceIdForPlan } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) return Response.json({ error: "billing not configured" }, { status: 503 });

  const auth = await getRequestUser();
  if (!auth) return Response.json({ error: "login required" }, { status: 401 });

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("stripe_customer_id, plan")
    .eq("id", auth.user.id)
    .single();

  const origin = new URL(request.url).origin;

  if (profile?.stripe_customer_id) {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: origin,
    });
    return Response.json({ url: session.url });
  }

  // Stripe未登録 → 現プランのcheckoutへ誘導
  const plan = profile?.plan === "standard" ? "standard" : "pro";
  const price = priceIdForPlan(plan);
  if (!price) return Response.json({ error: "price not configured" }, { status: 503 });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: auth.user.id,
    customer_email: auth.user.email ?? undefined,
    subscription_data: { metadata: { user_id: auth.user.id } },
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancel`,
  });
  return Response.json({ url: session.url });
}
