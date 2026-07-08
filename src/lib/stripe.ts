import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!isStripeConfigured()) return null;
  stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-05-27.dahlia" });
  return stripe;
}

/** Stripe Price ID → プラン名。env の価格IDと突き合わせる */
export function planFromPriceId(priceId: string): "standard" | "pro" | null {
  if (priceId === process.env.STRIPE_PRICE_STANDARD) return "standard";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return null;
}

export function priceIdForPlan(plan: "standard" | "pro"): string | undefined {
  return plan === "standard" ? process.env.STRIPE_PRICE_STANDARD : process.env.STRIPE_PRICE_PRO;
}

/**
 * RLSを越えて profiles を更新するためのサービスクライアント (webhook専用)。
 * SUPABASE_SECRET_KEY はサーバー環境変数のみ。クライアントに露出させないこと。
 */
export function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
