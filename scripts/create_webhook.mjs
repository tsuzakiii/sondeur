// Stripe Webhook エンドポイントを作成し、signing secret を .env.local に直接書き込む。
// secret は stdout に一切出さない (コンソール/エージェントのコンテキストに載せないため)。
// 同一 URL が既に設定済みなら終了する。既存 endpoint の secret を勝手に失効させない。
// 実行: node --env-file=.env.local scripts/create_webhook.mjs
import { readFileSync, writeFileSync } from "node:fs";
import Stripe from "stripe";

const WEBHOOK_URL = "https://sondeur.app/api/billing/webhook";
const ENV_PATH = ".env.local";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
let env = readFileSync(ENV_PATH, "utf8");

for await (const ep of stripe.webhookEndpoints.list({ limit: 100 })) {
  if (ep.url === WEBHOOK_URL) {
    throw new Error(`Webhook ${ep.id} は設定済みです。既存の STRIPE_WEBHOOK_SECRET を確認してください。再作成は行いません。`);
  }
}

const endpoint = await stripe.webhookEndpoints.create({
  url: WEBHOOK_URL,
  enabled_events: [
    "checkout.session.completed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ],
});

const line = `STRIPE_WEBHOOK_SECRET=${endpoint.secret}`;
if (/^STRIPE_WEBHOOK_SECRET=.*$/m.test(env)) {
  env = env.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, line);
} else {
  env += (env.endsWith("\n") ? "" : "\n") + line + "\n";
}
writeFileSync(ENV_PATH, env);

console.log("Webhook endpoint created:", endpoint.id);
console.log("signing secret は .env.local の STRIPE_WEBHOOK_SECRET に書き込み済み (表示しません)");
