// Checkout Session の Stripe idempotency key。同一 (user, plan, priceId, hasStripe)
// の連続リクエストは Stripe が同じ Session ID / URL を返す (24h の retention 窓)。
// hasStripe bit を含めるのは、webhook が stripe_customer_id を populate した瞬間に
// create の customer / customer_email 分岐が切り替わるため。key が同じままだと
// Stripe が parameter conflict 400 を返すので、bit で明示的に別 key に流す。
// 詳細は docs/fix-checkout-open-session-guard.md (M2, Layer 1)。

export type CheckoutPlan = "standard" | "pro";

export function checkoutIdempotencyKey(
  userId: string,
  plan: CheckoutPlan,
  priceId: string,
  hasStripe: boolean
): string {
  return `checkout:${userId}:${plan}:${priceId}:${hasStripe ? "c" : "e"}`;
}
