import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { getServiceSupabase, getStripe, planFromPriceId } from "@/lib/stripe";

export const runtime = "nodejs";

// 戻り値: 更新に成功したら true。失敗時は呼び出し元が 500 を返して Stripe の再送に乗せる
async function setPlan(userId: string, plan: string, stripeCustomerId?: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error("[webhook] service supabase not configured");
    Sentry.captureException(new Error("[webhook] service supabase not configured"));
    return false;
  }
  const patch: Record<string, string> = { plan };
  if (stripeCustomerId) patch.stripe_customer_id = stripeCustomerId;
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", userId).select("id");
  if (error) {
    console.error("[webhook] profile update failed", error);
    Sentry.captureException(error);
    return false;
  }
  // PostgREST は 0 行更新でも error にならない。profile 不在を成功扱いにすると
  // 課金済み・plan 未反映が闇に落ちるため、失敗として Stripe の再送に乗せる
  if (!data || data.length === 0) {
    console.error(`[webhook] profile not found for user ${userId}`);
    Sentry.captureMessage(`[webhook] profile not found for user ${userId}`);
    return false;
  }
  return true;
}

// unknown price のケースでも stripe_customer_id だけは profile に書き込みたい
// (checkout route の live subscription チェックが customer_id 経由なので、これがないと
// 2 subscription を作られる経路が残る)。plan は変えずに customer_id だけ update する。
async function setCustomerIdOnly(userId: string, customerId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error("[webhook] service supabase not configured");
    Sentry.captureException(new Error("[webhook] service supabase not configured"));
    return false;
  }
  const { data, error } = await supabase
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId)
    .select("id");
  if (error) {
    console.error("[webhook] customer id update failed", error);
    Sentry.captureException(error);
    return false;
  }
  if (!data || data.length === 0) {
    console.error(`[webhook] profile not found for user ${userId}`);
    Sentry.captureMessage(`[webhook] profile not found for user ${userId}`, "warning");
    return false;
  }
  return true;
}

async function setPlanByCustomer(customerId: string, plan: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error("[webhook] service supabase not configured");
    Sentry.captureException(new Error("[webhook] service supabase not configured"));
    return false;
  }
  const { data, error } = await supabase
    .from("profiles")
    .update({ plan })
    .eq("stripe_customer_id", customerId)
    .select("id");
  if (error) {
    console.error("[webhook] profile update by customer failed", error);
    Sentry.captureException(error);
    return false;
  }
  // 0 行更新 = 該当 customer の profile がまだ無い (checkout.session.completed より先に
  // subscription イベントが届いた等)。500 で再送させれば customer_id 設定後に成功する
  if (!data || data.length === 0) {
    console.error(`[webhook] profile not found for customer ${customerId}`);
    Sentry.captureMessage(`[webhook] profile not found for customer ${customerId}`);
    return false;
  }
  return true;
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
    Sentry.captureException(err);
    return new Response("invalid signature", { status: 400 });
  }

  // false になったら Stripe に再送させるため 500 を返す (冪等更新なので再送で二重付与にはならない)
  let ok = true;

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
        if (!plan) {
          const priceId = sub.items.data[0]?.price?.id;
          const msg = `[webhook] unknown price id: ${priceId} (sub=${sub.id}, customer=${customerId ?? "?"}, user=${userId})`;
          console.error(msg);
          Sentry.captureMessage(msg, "warning");
          // Price ID の catalog が Stripe 側で変わらない限り再送しても解決しない。
          // 500 で 3 日間再送させると Sentry を spam するだけになるので 200 で受け取り、
          // operator に Sentry 経由で通知して Portal 経由の手動対応に回す。
          // ただし checkout route の live-subscription チェックが customer_id 経由で
          // 効くよう、customer_id だけは profile に残す (plan は変えない — 別 event
          // での handling を待つ)。
          if (customerId) ok = await setCustomerIdOnly(userId, customerId);
          break;
        }
        ok = await setPlan(userId, plan, customerId);
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      if (sub.status === "active" || sub.status === "trialing") {
        const plan = planFromSubscription(sub);
        if (!plan) {
          const priceId = sub.items.data[0]?.price?.id;
          const msg = `[webhook] unknown price id: ${priceId} (sub=${sub.id}, customer=${customerId})`;
          console.error(msg);
          Sentry.captureMessage(msg, "warning");
          // 同上。旧 Price ID の subscription が catalog 変更を跨いだケース等。
          // 500 リトライは無効なので 200 で受けて Sentry 経由で運用対応する。
          // customer_id は既に profile 側で保存済み (checkout completed で入る)。
          ok = true;
          break;
        }
        ok = await setPlanByCustomer(customerId, plan);
      } else if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
        ok = await setPlanByCustomer(customerId, "free");
      }
      // それ以外 (past_due, incomplete 等) は現状維持 (支払いリトライ中の猶予、意図的に何もしない)
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      ok = await setPlanByCustomer(customerId, "free");
      break;
    }
  }

  if (!ok) return new Response("processing failed", { status: 500 });
  return Response.json({ received: true });
}
