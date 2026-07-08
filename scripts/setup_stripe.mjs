// Stripe に Sondeur の商品と価格を作成し、env に貼る Price ID を出力する
// 実行: node --env-file=.env.local scripts/setup_stripe.mjs
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY が .env.local にありません");
  process.exit(1);
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function ensure(name, amountUsdCents, lookupKey) {
  // 既存の価格があれば再利用 (再実行しても重複しない)
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data.length > 0) {
    console.log(`${name}: 既存の価格を再利用 ${existing.data[0].id}`);
    return existing.data[0].id;
  }
  const product = await stripe.products.create({ name });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: amountUsdCents,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
  });
  console.log(`${name}: 作成 ${price.id}`);
  return price.id;
}

const standard = await ensure("Sondeur Standard", 1200, "sondeur_standard_usd_monthly");
const pro = await ensure("Sondeur Pro", 2400, "sondeur_pro_usd_monthly");

console.log("\n.env.local / Vercel に追記する値:");
console.log(`STRIPE_PRICE_STANDARD=${standard}`);
console.log(`STRIPE_PRICE_PRO=${pro}`);
