import type Stripe from "stripe";
import { getServiceSupabase, getStripe, planFromPriceId } from "@/lib/stripe";

export const runtime = "nodejs";

async function setPlan(userId: string, plan: string, stripeCustomerId?: string) {
  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error("[webhook] service supabase not configured");
    return;
  }
  const patch: Record<string, string> = { plan };
  if (stripeCustomerId) patch.stripe_customer_id = stripeCustomerId;
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) console.error("[webhook] profile update failed", error);
}

async function setPlanByCustomer(customerId: string, plan: string) {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from("profiles")
    .update({ plan })
    .eq("stripe_customer_id", customerId);
  if (error) console.error("[webhook] profile update by customer failed", error);
}

function planFromSubscription(sub: Stripe.Subscription): string | null {
  const priceId = sub.items.data[0]?.price?.id;
  return priceId ? planFromPriceId(priceId) : null;
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("not configured", { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch (err) {
    console.error("[webhook] signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const customerId = typeof session.customer === "string" ? session.customer : undefined;
      if (userId && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(
          typeof session.subscription === "string" ? session.subscription : session.subscription.id
        );
        const plan = planFromSubscription(sub);
        if (plan) await setPlan(userId, plan, customerId);
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      if (sub.status === "active" || sub.status === "trialing") {
        const plan = planFromSubscription(sub);
        if (plan) await setPlanByCustomer(customerId, plan);
      } else if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
        await setPlanByCustomer(customerId, "free");
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await setPlanByCustomer(customerId, "free");
      break;
    }
  }

  return Response.json({ received: true });
}
