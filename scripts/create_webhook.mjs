// Stripe Webhook エンドポイントを作成し、signing secret を .env.local に直接書き込む。
// secret は stdout に一切出さない (コンソール/エージェントのコンテキストに載せないため)。
// 同一 URL の既存 endpoint があれば削除して作り直す (secret は作成時しか取得できない)。
// 実行: node --env-file=.env.local scripts/create_webhook.mjs
import { readFileSync, writeFileSync } from "node:fs";
import Stripe from "stripe";

const WEBHOOK_URL = "https://sondeur.app/api/billing/webhook";
const ENV_PATH = ".env.local";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const existing = await stripe.webhookEndpoints.list({ limit: 100 });
for (const ep of existing.data) {
  if (ep.url === WEBHOOK_URL) {
    console.log(`既存 endpoint ${ep.id} を削除して再作成します (secret は再取得不可のため)`);
    await stripe.webhookEndpoints.del(ep.id);
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

let env = readFileSync(ENV_PATH, "utf8");
const line = `STRIPE_WEBHOOK_SECRET=${endpoint.secret}`;
if (/^STRIPE_WEBHOOK_SECRET=.*$/m.test(env)) {
  env = env.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, line);
} else {
  env += (env.endsWith("\n") ? "" : "\n") + line + "\n";
}
writeFileSync(ENV_PATH, env);

console.log("Webhook endpoint created:", endpoint.id);
console.log("signing secret は .env.local の STRIPE_WEBHOOK_SECRET に書き込み済み (表示しません)");
