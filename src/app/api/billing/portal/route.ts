import { getRequestUser } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) return Response.json({ error: "billing not configured" }, { status: 503 });

  const auth = await getRequestUser();
  if (!auth) return Response.json({ error: "login required" }, { status: 401 });

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", auth.user.id)
    .single();
  if (!profile?.stripe_customer_id) {
    return Response.json({ error: "no subscription" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: origin,
  });
  return Response.json({ url: session.url });
}
