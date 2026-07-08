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
    warn(`${name} does not start with ${livePrefix}; verify it manually`);
  }
}

function checkPriceId(name) {
  const value = env(name);
  if (!value) {
    fail(`${name} is missing`);
    return;
  }
  if (!value.startsWith("price_")) warn(`${name} does not look like a Stripe Price ID`);
}

checkRequiredEnv("OPENAI_API_KEY");
checkRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
checkRequiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
checkRequiredEnv("SUPABASE_SECRET_KEY");
checkRequiredEnv("STRIPE_WEBHOOK_SECRET");
checkLiveKey("STRIPE_SECRET_KEY", "sk_live_", "sk_test_");
checkLiveKey("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_", "pk_test_");
checkPriceId("STRIPE_PRICE_STANDARD");
checkPriceId("STRIPE_PRICE_PRO");

if (env("STRIPE_PRICE_STANDARD") && env("STRIPE_PRICE_STANDARD") === env("STRIPE_PRICE_PRO")) {
  fail("STRIPE_PRICE_STANDARD and STRIPE_PRICE_PRO must be different Price IDs");
}

if (!env("NEXT_PUBLIC_SITE_URL")) warn("NEXT_PUBLIC_SITE_URL is not set; metadata may fall back to the Vercel preview URL");
if (!env("SENTRY_DSN")) warn("SENTRY_DSN is not set; runtime errors will not be reported to Sentry");

const tokushohoPath = join(root, "src", "app", "legal", "tokushoho", "page.tsx");
const tokushoho = readFileSync(tokushohoPath, "utf8");
if (tokushoho.includes("【")) fail("Commercial Disclosure still contains 【...】 placeholders");
if (!tokushoho.includes("月額7米ドル") || !tokushoho.includes("月額14米ドル")) {
  fail("Commercial Disclosure does not mention the current USD Standard/Pro prices");
}
if (!tokushoho.includes("Free プラン: 20ノード/月")) {
  fail("Commercial Disclosure does not mention the current Free plan limit");
}

const migrationDir = join(root, "supabase", "migrations");
const migrations = existsSync(migrationDir) ? readdirSync(migrationDir).sort() : [];
for (const id of ["0001", "0002", "0003", "0004", "0005", "0006"]) {
  if (!migrations.some((name) => name.startsWith(id))) fail(`Supabase migration ${id} is missing locally`);
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
