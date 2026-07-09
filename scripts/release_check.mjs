import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function env(name) {
  return process.env[name]?.trim() ?? "";
}

function checkRequiredEnv(name) {
  if (!env(name)) fail(`${name} is missing`);
}

function checkLiveKey(name, livePrefix, testPrefix) {
  const value = env(name);
  if (!value) {
    fail(`${name} is missing`);
    return;
  }
  if (value.startsWith(testPrefix)) {
    fail(`${name} is a test key; production launch requires ${livePrefix}...`);
  } else if (!value.startsWith(livePrefix)) {
    // 別 prefix は誤設定の可能性が高い。live launch を通してはいけないので fail。
    fail(`${name} does not start with ${livePrefix}; expected a live-mode key`);
  }
}

function checkWebhookSecret(name) {
  const value = env(name);
  if (!value) {
    fail(`${name} is missing`);
    return;
  }
  // Stripe の webhook signing secret は `whsec_` prefix。placeholder 値 (e.g. "changeme")
  // を通してしまうと Stripe からの POST が signature verification に失敗して 400 を返す。
  if (!value.startsWith("whsec_")) {
    fail(`${name} does not start with whsec_; check that the Stripe webhook signing secret is copied verbatim`);
  }
}

function checkPriceId(name) {
  const value = env(name);
  if (!value) {
    fail(`${name} is missing`);
    return;
  }
  // Stripe Price ID は必ず `price_` prefix。live/test の区別は Price ID からは判別
  // できないので、runbook 側で API 経由の目視確認を残す。ここでは形式のみを保証する。
  if (!value.startsWith("price_")) {
    fail(`${name} does not look like a Stripe Price ID (expected price_...)`);
  }
}

checkRequiredEnv("OPENAI_API_KEY");
checkRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
checkRequiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
checkRequiredEnv("SUPABASE_SECRET_KEY");
checkWebhookSecret("STRIPE_WEBHOOK_SECRET");
checkLiveKey("STRIPE_SECRET_KEY", "sk_live_", "sk_test_");
checkLiveKey("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_", "pk_test_");
checkPriceId("STRIPE_PRICE_STANDARD");
checkPriceId("STRIPE_PRICE_PRO");

if (env("STRIPE_PRICE_STANDARD") && env("STRIPE_PRICE_STANDARD") === env("STRIPE_PRICE_PRO")) {
  fail("STRIPE_PRICE_STANDARD and STRIPE_PRICE_PRO must be different Price IDs");
}

// NEXT_PUBLIC_SITE_URL は runbook で「Set to the production URL」と必須指定。未設定だと
// metadata が Vercel preview URL に fallback して OG / canonical が誤る。
if (!env("NEXT_PUBLIC_SITE_URL")) fail("NEXT_PUBLIC_SITE_URL is missing");
// Sentry は optional (未設定でも launch は可、runtime error が Sentry に送られないだけ)
if (!env("SENTRY_DSN")) warn("SENTRY_DSN is not set; runtime errors will not be reported to Sentry");

const tokushohoPath = join(root, "src", "app", "legal", "tokushoho", "page.tsx");
const tokushoho = readFileSync(tokushohoPath, "utf8");
// tokushoho.tsx はファイル冒頭の block comment 内で `【】` 記法自体を説明している。
// placeholder が「埋まっていない」ことを検出したいのはコード側 (ROWS の value) だけなので、
// block/line comment を除去した後にスキャンする。
const tokushohoWithoutComments = tokushoho
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
if (tokushohoWithoutComments.includes("【")) {
  fail("Commercial Disclosure still contains 【...】 placeholders");
}
if (!tokushoho.includes("月額7米ドル") || !tokushoho.includes("月額14米ドル")) {
  fail("Commercial Disclosure does not mention the current USD Standard/Pro prices");
}
if (!tokushoho.includes("Free プラン: 20ノード/月")) {
  fail("Commercial Disclosure does not mention the current Free plan limit");
}

const migrationDir = join(root, "supabase", "migrations");
const migrations = existsSync(migrationDir) ? readdirSync(migrationDir).sort() : [];
// Supabase の migration file 名は `<4桁 ID>_<slug>.sql`。id+`_` の前方一致だけだと
// `0001_notes.txt` のような別拡張子が通ってしまうので、.sql 拡張子まで含めて確認する。
for (const id of ["0001", "0002", "0003", "0004", "0005", "0006", "0007"]) {
  const pattern = new RegExp(`^${id}_.*\\.sql$`);
  if (!migrations.some((name) => pattern.test(name))) fail(`Supabase migration ${id} is missing locally`);
}

console.log("Sondeur release check");
if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const message of warnings) console.log(`- ${message}`);
}
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const message of failures) console.log(`- ${message}`);
  process.exit(1);
}
console.log("- required environment variables look present");
console.log("- Stripe keys look live-mode");
console.log("- Commercial Disclosure has no launch placeholders");
console.log("- local Supabase migration files 0001-0006 are present");
