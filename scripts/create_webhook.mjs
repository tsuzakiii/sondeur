// Stripe Webhook エンドポイントを作成する
// 実行: node --env-file=.env.local scripts/create_webhook.mjs
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const endpoint = await stripe.webhookEndpoints.create({
  url: "https://sondeur.app/api/billing/webhook",
  enabled_events: [
    "checkout.session.completed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ],
});

console.log("Webhook endpoint created:", endpoint.id);
console.log("Signing secret:", endpoint.secret);
console.log(`\n.env.local に追記:\nSTRIPE_WEBHOOK_SECRET=${endpoint.secret}`);
