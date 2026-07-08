import { getRequestUser } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) return Response.json({ error: "billing not configured" }, { status: 503 });

  const auth = await getRequestUser();
  if (!auth) return Response.json({ error: "login required" }, { status: 401 });

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("stripe_customer_id, plan")
    .eq("id", auth.user.id)
    .single();
  if (profileError || !profile) {
    return Response.json({ error: "profile unavailable — try again shortly" }, { status: 503 });
  }

  const origin = new URL(request.url).origin;

  if (profile?.stripe_customer_id) {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: origin,
    });
    return Response.json({ url: session.url });
  }

  // 有料profileなのに Stripe customer が無い状態は webhook/運用不整合。
  // checkout へ流すと二重課金を作り得るため fail-closed にする。
  if (profile.plan !== "free") {
    return Response.json(
      { error: "billing profile incomplete — contact support" },
      { status: 409 }
    );
  }

  return Response.json({ error: "no subscription to manage" }, { status: 404 });
}
